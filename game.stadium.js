// =====================================================
// PITCH ROYALE — Stadium systems
// Stadium picker, preview and imported stadium rendering
// =====================================================

// ----------- STADIUM PICKER -----------
let stadiumPickerIdx = 0;

function bindStadium() {
    const back    = $('stadium-back');
    const confirm = $('stadium-confirm');

    back?.addEventListener('click', () => history.back());
    confirm?.addEventListener('click', () => {
        const stadium = STADIUMS[stadiumPickerIdx];
        if (stadium) {
            setSelectedStadium(stadium.id);
            updateLaunchStadiumLabel();
        }
        history.back();
    });

    // keyboard nav, scoped to the picker screen
    document.addEventListener('keydown', (e) => {
        if (STATE.screen !== 'stadium') return;
        const onButton = e.target instanceof Element && !!e.target.closest('button');
        if (e.code === 'ArrowLeft' || e.code === 'ArrowUp')         { e.preventDefault(); navigateStadium(-1); }
        else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); navigateStadium(+1); }
        else if (e.code === 'Escape')                               { e.preventDefault(); history.back(); }
        // a focused button handles its own Enter; anywhere else Enter confirms
        else if (e.code === 'Enter' && !onButton)                   { e.preventDefault(); confirm?.click(); }
    });
}

function openStadiumPicker() {
    const sel = getSelectedStadium();
    stadiumPickerIdx = Math.max(0, STADIUMS.findIndex(s => s.id === sel.id));
    // Show the screen first so the viewer has real dimensions when the 3D
    // preview measures itself; otherwise getBoundingClientRect would return 0×0.
    gotoScreen('stadium');
    renderStadiumList();
    renderStadiumCard(stadiumPickerIdx);
}

function navigateStadium(delta) {
    if (STADIUMS.length <= 1) return;
    selectStadiumIndex((stadiumPickerIdx + delta + STADIUMS.length) % STADIUMS.length);
}

function selectStadiumIndex(idx) {
    stadiumPickerIdx = idx;
    renderStadiumCard(idx);
    renderStadiumList();
}

// The list on the right: one row per stadium, built once and then only
// re-flagged, so a row keeps keyboard focus while you move through it.
function renderStadiumList() {
    const list = $('stadium-list');
    if (!list) return;

    if (!list.children.length) {
        STADIUMS.forEach((s, i) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'stadium-row';
            const cell = (cls, text) => {
                const el = document.createElement('span');
                el.className = cls;
                el.textContent = text;
                return el;
            };
            row.append(
                cell('stadium-row__num', String(i + 1)),
                cell('stadium-row__name', s.name),
                cell('stadium-row__tag', 'gekozen'),
                cell('stadium-row__cap', s.capacity),
            );
            row.addEventListener('click', (e) => {
                // after a mouse click, hand focus back so Enter confirms
                if (e.detail > 0) row.blur();
                selectStadiumIndex(i);
            });
            list.appendChild(row);
        });
    }

    const chosenId = getSelectedStadium().id;
    [...list.children].forEach((row, i) => {
        const active = i === stadiumPickerIdx;
        row.classList.toggle('is-active', active);
        row.classList.toggle('is-chosen', STADIUMS[i].id === chosenId);
        if (active) {
            row.setAttribute('aria-current', 'true');
            row.scrollIntoView({ block: 'nearest' });
        } else {
            row.removeAttribute('aria-current');
        }
    });
}

function setText(id, value) {
    const el = $(id);
    if (el && el.textContent !== value) el.textContent = value;
}

// Caption under the 3D view + the preview itself.
function renderStadiumCard(idx) {
    const stadium = STADIUMS[idx];
    if (!stadium) return;
    const isChosen = stadium.id === getSelectedStadium().id;

    setText('stadium-name', stadium.name);
    setText('stadium-club', [stadium.club, stadium.city].filter(Boolean).join(' · '));
    setText('stadium-cap', `${stadium.capacity} plaatsen`);
    setText('stadium-confirm', isChosen ? 'Dit stadion houden' : 'Dit stadion kiezen');

    const slot = $('stadium-viewer');
    if (!slot) return;
    if (stadium.file && typeof THREE.GLTFLoader === 'function') {
        STADIUM_PREVIEW.show(stadium, slot);
    } else {
        STADIUM_PREVIEW.detach();
    }
}

// ----------- stadium picker preview (live .glb viewer) -----------
// Renders the selected stadium's .glb inside the picker card with
// drag-to-rotate (OrbitControls), idle auto-rotate, and per-stadium model
// caching. One persistent renderer is reused across cards to avoid
// re-allocating a WebGL context every navigation.
const STADIUM_PREVIEW = (() => {
    let renderer, scene, camera, controls;
    let raf = 0;
    let host = null;            // current viewer slot in the DOM
    let currentId = null;       // id of stadium currently in the scene
    let model = null;           // active THREE.Object3D
    let resizeObs = null;
    const cache = new Map();    // stadium.id -> prepared THREE.Object3D
    const inflight = new Map(); // stadium.id -> Promise (avoid double-fetch)
    let autoRotateResumeT = 0;

    function ensureRenderer() {
        if (renderer) return;
        if (typeof THREE.OrbitControls !== 'function') {
            console.warn('OrbitControls missing — stadium preview disabled');
            return;
        }
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.domElement.classList.add('stadium-card__viewer-canvas');

        scene = new THREE.Scene();

        // soft night-stadium lighting — hemi for ambient + key + fill
        scene.add(new THREE.HemisphereLight(0xfff1d6, 0x0a1612, 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(180, 240, 140);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x88e5ff, 0.35);
        fill.position.set(-180, 90, -140);
        scene.add(fill);

        camera = new THREE.PerspectiveCamera(36, 1, 0.5, 8000);
        camera.position.set(0, 80, 220);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.085;
        controls.enablePan = false;
        controls.rotateSpeed = 0.85;
        controls.zoomSpeed = 0.7;
        controls.minPolarAngle = Math.PI * 0.18;
        controls.maxPolarAngle = Math.PI * 0.495; // never below ground
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.55;

        // pause auto-rotate while the user is interacting; resume after a beat
        controls.addEventListener('start', () => {
            controls.autoRotate = false;
            host?.classList.add('is-grabbing');
        });
        controls.addEventListener('end', () => {
            host?.classList.remove('is-grabbing');
            clearTimeout(autoRotateResumeT);
            autoRotateResumeT = setTimeout(() => { controls.autoRotate = true; }, 3500);
        });
    }

    function loop() {
        raf = 0;
        if (!renderer || !host) return;
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
    }

    function resize() {
        if (!renderer || !host) return;
        const r = host.getBoundingClientRect();
        // host can be 0×0 momentarily if the picker screen is in the middle of
        // unhiding — ResizeObserver will fire again with real dims, so just
        // bail rather than configuring a zero-sized framebuffer.
        if (r.width < 1 || r.height < 1) return;
        const w = Math.max(1, Math.floor(r.width));
        const h = Math.max(1, Math.floor(r.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function frameModel(obj) {
        const bbox = new THREE.Box3().setFromObject(obj);
        if (bbox.isEmpty()) {
            console.warn('stadium preview: bbox empty', obj);
            return;
        }
        const size   = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        // pick a flattering "stadium tour" angle: ~22° elevation, ~32° azimuth
        const elev = Math.PI * 0.12;
        const azim = Math.PI * 0.18;

        const halfFovV = (camera.fov * Math.PI / 180) * 0.5;
        const halfFovH = Math.atan(Math.tan(halfFovV) * Math.max(0.1, camera.aspect));

        // proper fit-to-frustum: project the model footprint and stand far
        // enough back that the worst-case axis (horizontal or vertical) fits.
        // Using only the bounding sphere over-reserved space because stadiums
        // are very flat — vertical headroom was wasted, leaving the model
        // looking small in the frame.
        const footprintR = Math.hypot(size.x, size.z) * 0.5;
        const distH = footprintR / Math.tan(halfFovH);
        const distV = (size.y * 0.5 + footprintR * Math.sin(elev)) / Math.tan(halfFovV);
        const dist  = Math.max(distH, distV, 1) * 1.05;

        const off  = new THREE.Vector3(
            Math.sin(azim) * Math.cos(elev),
            Math.sin(elev),
            Math.cos(azim) * Math.cos(elev),
        ).multiplyScalar(dist);

        controls.target.copy(center);
        camera.position.copy(center).add(off);

        // adapt clipping to the model's scale so we can't accidentally clip
        // tiny models (mm-scale exports) or huge ones (km-scale exports)
        camera.near = Math.max(0.05, dist * 0.005);
        camera.far  = dist * 60;
        camera.updateProjectionMatrix();

        const sphereR = Math.max(size.length() * 0.5, 1);
        controls.minDistance = sphereR * 0.6;
        controls.maxDistance = sphereR * 4.5;
        controls.update();
    }

    function prepareModel(gltf, stadium) {
        const obj = gltf.scene;
        obj.rotation.y = stadium.rotateY ?? 0;

        // The catalog's colorScale exists to blend stadiums into the night-time
        // gameplay scene; in the picker we want them to look vivid, so we skip
        // it and only damp absurd metalness / emissive bakes.
        obj.traverse((c) => {
            if (!c.isMesh) return;
            c.castShadow = false;
            c.receiveShadow = false;
            const mats = Array.isArray(c.material) ? c.material : (c.material ? [c.material] : []);
            mats.forEach(m => {
                if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = 0.55;
                if (m.metalness !== undefined) m.metalness = tameMetalness(m, 0.5);
            });
        });
        return obj;
    }

    function loadStadium(stadium) {
        if (cache.has(stadium.id)) return Promise.resolve(cache.get(stadium.id));
        if (inflight.has(stadium.id)) return inflight.get(stadium.id);
        const p = new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(stadium.file,
                (gltf) => { const o = prepareModel(gltf, stadium); cache.set(stadium.id, o); resolve(o); },
                (ev) => {
                    // real download progress for the "Stadion laden" message
                    if (!host || currentId !== stadium.id) return;
                    if (ev.lengthComputable && ev.total > 0) {
                        host.dataset.progress = Math.round((ev.loaded / ev.total) * 100) + '%';
                    }
                },
                (err) => reject(err)
            );
        });
        inflight.set(stadium.id, p);
        p.finally(() => inflight.delete(stadium.id));
        return p;
    }

    function setModel(obj) {
        if (model && model !== obj) scene.remove(model);
        model = obj;
        if (!scene.children.includes(model)) scene.add(model);
        frameModel(model);
    }

    function show(stadium, slot) {
        ensureRenderer();
        if (!renderer) {
            // OrbitControls / WebGL unavailable — leave the silhouette visible
            slot.classList.add('is-unsupported');
            return;
        }

        // attach the persistent canvas into the new card slot
        if (host !== slot) {
            host = slot;
            if (renderer.domElement.parentNode !== slot) {
                slot.appendChild(renderer.domElement);
            }
            if (resizeObs) resizeObs.disconnect();
            resizeObs = new ResizeObserver(resize);
            resizeObs.observe(slot);
        }
        resize();

        // swap models if the stadium changed
        if (currentId !== stadium.id) {
            currentId = stadium.id;
            slot.classList.add('is-loading');
            slot.classList.remove('is-ready', 'is-failed');
            delete slot.dataset.progress;
            if (model) { scene.remove(model); model = null; }

            loadStadium(stadium)
                .then((obj) => {
                    if (currentId !== stadium.id) return; // user already moved on
                    setModel(obj);
                    slot.classList.remove('is-loading');
                    slot.classList.add('is-ready');
                    delete slot.dataset.progress;
                })
                .catch((err) => {
                    console.warn(`stadium preview "${stadium.id}" failed to load`, err);
                    if (currentId !== stadium.id) return;
                    slot.classList.remove('is-loading');
                    slot.classList.add('is-failed');
                });
        } else if (model) {
            // same stadium re-mounted (after card re-render) — just reframe
            if (!scene.children.includes(model)) scene.add(model);
            slot.classList.add('is-ready');
        }

        // restart the render loop now that we have a host again
        if (!raf) raf = requestAnimationFrame(loop);
    }

    function detach() {
        // stop rendering & let the canvas live off-DOM until next mount
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
        clearTimeout(autoRotateResumeT);
        if (renderer && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        host = null;
    }

    return { show, detach };
})();

// ----------- stadium model -----------
// The match is played on the stadium's own pitch. Each model is turned and
// scaled so the painted lines of its pitch land exactly on the lines the
// game plays by (FIELD_W x FIELD_L around the origin, grass at y = 0). Our
// drawn pitch (buildField in game.js) only shows when there is no usable
// model pitch.
let stadiumLoadToken = 0;

function usesStadiumPitch(stadium) {
    return !!(stadium.file && stadium.pitch && !stadium.pitch.own && typeof THREE.GLTFLoader === 'function');
}

function buildStadium() {
    const stadium = getSelectedStadium();
    const token = ++stadiumLoadToken;
    const ownPitch = scene.getObjectByName('own-pitch');
    if (ownPitch) ownPitch.visible = !usesStadiumPitch(stadium);
    if (!stadium.file || !stadium.pitch || typeof THREE.GLTFLoader !== 'function') {
        buildStadiumFallback();
        return;
    }

    new THREE.GLTFLoader().load(
        stadium.file,
        (gltf) => {
            // a newer match (or leaving the match) makes this load stale
            if (token !== stadiumLoadToken || STATE.screen !== 'playing') return;
            const rig = fitStadiumToPitch(gltf.scene, stadium);
            if (!stadium.pitch.own) levelStadiumPitch(rig);
            dressStadium(rig, stadium);
            rig.userData.tag = 'stadium';
            scene.add(rig);
        },
        undefined,
        (err) => {
            console.warn(`stadium "${stadium.id}" (${stadium.file}) failed to load — using the plain surroundings`, err);
            if (token !== stadiumLoadToken || STATE.screen !== 'playing') return;
            if (ownPitch) ownPitch.visible = true;
            buildStadiumFallback();
        }
    );
}

// Models come in every size and orientation, so each catalog entry says
// where its pitch is (measured once, top-down, in "rough fit" units: longest
// horizontal side scaled to 264, bounding-box centre on the origin, lowest
// point at y = 0):  pitch: { x, z, w, l, angle, y }
//   x, z   centre spot          w, l   goal line to goal line, touchline to touchline
//   angle  direction of the long axis, radians from +x towards +z
//   y      height of the grass
//   own    true: the model's pitch is unusable, w/l describe the green area
//          and our drawn pitch covers it
// Returns the group to add to the scene.
const ROUGH_SPAN = 264;

function fitStadiumToPitch(arena, stadium) {
    const p = stadium.pitch;

    // rough fit, exactly as the measurements were taken
    arena.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(arena);
    const size = box.getSize(new THREE.Vector3());
    arena.scale.multiplyScalar(ROUGH_SPAN / Math.max(size.x, size.z, 0.001));
    arena.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(arena);
    const c = box.getCenter(new THREE.Vector3());
    arena.position.x -= c.x;
    arena.position.y -= box.min.y;
    arena.position.z -= c.z;

    // turn the long axis onto x (our goals) ...
    const turn = new THREE.Group();
    turn.rotation.y = p.angle;
    turn.add(arena);

    // ... then stretch along the pitch axes so its lines meet ours. Real
    // pitches differ a few percent in proportion, so x and z each get their
    // own factor; nobody sees that in the stands.
    let kx = FIELD_W / p.w, kz = FIELD_L / p.l;
    if (p.own) kx = kz = Math.max(kx, kz) * 1.03;
    const ky = (kx + kz) / 2;
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    const rig = new THREE.Group();
    rig.add(turn);
    rig.scale.set(kx, ky, kz);
    rig.position.set(
        -kx * (p.x * cos + p.z * sin),
        -ky * p.y - (p.own ? 0.25 : 0),      // unusable grass sits just under our own
        -kz * (-p.x * sin + p.z * cos)
    );
    rig.updateMatrixWorld(true);

    return rig;
}

// Scanned pitches are lumpy and never exactly at the measured height. Find
// the real grass level from the vertices in the middle of the pitch, put it
// on y = 0 and press the bumps flat, so boots and ball touch the grass.
// Layers keep their order (painted lines stay above the grass).
const PITCH_BAND = 1.6;       // what counts as "pitch surface" around the grass level
const PITCH_SQUASH = 0.03;

function levelStadiumPitch(rig) {
    const meshes = [];
    const seen = new Set();
    rig.traverse((o) => {
        const pos = o.isMesh && o.geometry && o.geometry.attributes.position;
        if (!pos || pos.isInterleavedBufferAttribute || !(pos.array instanceof Float32Array) || seen.has(o.geometry)) return;
        seen.add(o.geometry);
        meshes.push(o);
    });

    // 1 — grass level: the most common height in the middle of the pitch
    const BIN = 0.05, RANGE = 4, bins = new Uint32Array(Math.ceil(RANGE * 2 / BIN));
    const v = new THREE.Vector3();
    meshes.forEach((o) => {
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (Math.abs(v.x) > FIELD_W * 0.4 || Math.abs(v.z) > FIELD_L * 0.4 || Math.abs(v.y) >= RANGE) continue;
            bins[Math.floor((v.y + RANGE) / BIN)]++;
        }
    });
    let best = -1, bestN = 0;
    for (let i = 1; i < bins.length - 1; i++) {
        const n = bins[i - 1] + bins[i] + bins[i + 1];
        if (n > bestN) { bestN = n; best = i; }
    }
    const level = best < 0 ? 0 : (best + 0.5) * BIN - RANGE;
    rig.position.y -= level;
    rig.updateMatrixWorld(true);

    // 2 — flatten everything near that level on and just around the pitch
    const inv = new THREE.Matrix4();
    const maxX = FIELD_W / 2 + 8, maxZ = FIELD_L / 2 + 6;
    meshes.forEach((o) => {
        const pos = o.geometry.attributes.position;
        inv.copy(o.matrixWorld).invert();
        let changed = false;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (Math.abs(v.x) > maxX || Math.abs(v.z) > maxZ || Math.abs(v.y) > PITCH_BAND) continue;
            v.y *= PITCH_SQUASH;
            v.applyMatrix4(inv);
            pos.setXYZ(i, v.x, v.y, v.z);
            changed = true;
        }
        if (changed) pos.needsUpdate = true;
    });
}

// Scans are often exported as "fully metal" (the glTF default when no value
// is written). Without an environment map that renders pitch black, as
// Anfield did. Real metal maps are kept, only capped.
function tameMetalness(m, cap) {
    if (!m.metalnessMap && m.metalness >= 0.9) return 0;
    return Math.min(cap, m.metalness);
}

function dressStadium(arena, stadium) {
    const colorScale = 0.9;
    // Cut a block out of every model: the column above the pitch and
    // everything from there towards the camera. That removes the near stand,
    // roofs and cables over the grass and the model's own goals and boards
    // (ours stand where the game needs them). The grass itself stays, unless
    // the model's pitch is unusable. With clipIntersection a fragment is
    // dropped only when it is on the negative side of all planes, i.e.
    // inside the block.
    const sideX = FIELD_W / 2 + 9;       // behind the goals and end boards
    const farZ = FIELD_L / 2 + 5.5;      // just behind the far board
    const block = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -sideX),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), -sideX),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), -farZ),
    ];
    if (!stadium.pitch.own) block.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.3));
    const seen = new Set();

    arena.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        c.castShadow = false;
        c.receiveShadow = false;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => {
            if (seen.has(m)) return;
            seen.add(m);
            // tame overly emissive baked-in lighting and mirror-like metal
            if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = 0.4;
            if (m.metalness !== undefined) m.metalness = tameMetalness(m, 0.4);
            if (colorScale !== 1 && m.color) m.color.multiplyScalar(colorScale);
            m.clippingPlanes = block;
            m.clipIntersection = true;
            m.needsUpdate = true;
        });
    });
}

function buildStadiumFallback() {
    // a low concrete bowl + tribunes silhouette so the world doesn't feel empty
    const bowlGeo = new THREE.RingGeometry(FIELD_W * 0.85, FIELD_W * 1.6, 64, 1);
    const bowlMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 1.0,
        metalness: 0.0,
    });
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.rotation.x = -Math.PI / 2;
    bowl.position.y = -0.04;
    bowl.receiveShadow = true;
    scene.add(bowl);

    // tribune silhouette as a low torus
    const tribGeo = new THREE.TorusGeometry(FIELD_W * 1.25, 8, 8, 80);
    const tribMat = new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true,
    });
    const tribune = new THREE.Mesh(tribGeo, tribMat);
    tribune.rotation.x = Math.PI / 2;
    tribune.position.y = 4;
    tribune.scale.set(1, 1, 0.55);
    scene.add(tribune);

    // four light pylons at the corners
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.6 });
    const pylonGeo = new THREE.CylinderGeometry(0.6, 0.9, 60, 8);
    [
        [ FIELD_W * 0.85,  FIELD_L * 0.95],
        [-FIELD_W * 0.85,  FIELD_L * 0.95],
        [ FIELD_W * 0.85, -FIELD_L * 0.95],
        [-FIELD_W * 0.85, -FIELD_L * 0.95],
    ].forEach(([x, z]) => {
        const py = new THREE.Mesh(pylonGeo, pylonMat);
        py.position.set(x, 30, z);
        scene.add(py);

        // lamp head
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(6, 1.5, 3),
            new THREE.MeshStandardMaterial({
                color: 0xfff7e0,
                emissive: 0xfff7e0,
                emissiveIntensity: 0.8,
                roughness: 0.5,
            })
        );
        head.position.set(x * 0.92, 60, z * 0.92);
        head.lookAt(0, 4, 0);
        scene.add(head);
    });
}
