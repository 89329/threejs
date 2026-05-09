// =====================================================
// PITCH ROYALE — Stadium systems
// Stadium picker, preview and imported stadium rendering
// =====================================================

// ----------- STADIUM PICKER -----------
let stadiumPickerIdx = 0;

function bindStadium() {
    const prev    = $('stadium-prev');
    const next    = $('stadium-next');
    const back    = $('stadium-back');
    const confirm = $('stadium-confirm');

    prev?.addEventListener('click',    (e) => { e.currentTarget.blur(); navigateStadium(-1); });
    next?.addEventListener('click',    (e) => { e.currentTarget.blur(); navigateStadium(+1); });
    back?.addEventListener('click',    (e) => { e.currentTarget.blur(); history.back(); });
    confirm?.addEventListener('click', (e) => {
        e.currentTarget.blur();
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
        if (e.code === 'ArrowLeft')                       { e.preventDefault(); navigateStadium(-1); }
        else if (e.code === 'ArrowRight')                 { e.preventDefault(); navigateStadium(+1); }
        else if (e.code === 'Enter' || e.code === 'Space'){ e.preventDefault(); confirm?.click(); }
        else if (e.code === 'Escape')                     { e.preventDefault(); history.back(); }
    });
}

function openStadiumPicker() {
    const sel = getSelectedStadium();
    stadiumPickerIdx = STADIUMS.findIndex(s => s.id === sel.id);
    if (stadiumPickerIdx < 0) stadiumPickerIdx = 0;
    // Show the screen first so the card has real dimensions when the 3D viewer
    // measures itself; otherwise getBoundingClientRect would return 0×0.
    gotoScreen('stadium');
    ensureStadiumPickerScaffold();
    const total = $('stadium-pagetotal');
    if (total) total.textContent = String(STADIUMS.length).padStart(2, '0');
    renderStadiumCard(stadiumPickerIdx, 0);
    renderStadiumDots();
    refreshStadiumArrows();
    startTimecode();
}

function navigateStadium(delta) {
    if (STADIUMS.length <= 1) return;
    stadiumPickerIdx = (stadiumPickerIdx + delta + STADIUMS.length) % STADIUMS.length;
    renderStadiumCard(stadiumPickerIdx, delta);
    renderStadiumDots();
}

function refreshStadiumArrows() {
    const single = STADIUMS.length <= 1;
    const prev = $('stadium-prev');
    const next = $('stadium-next');
    if (prev) prev.disabled = single;
    if (next) next.disabled = single;
}

function renderStadiumDots() {
    const dots = $('stadium-dots');
    if (!dots) return;
    dots.innerHTML = STADIUMS.map((s, i) =>
        `<button class="stadium-dot${i === stadiumPickerIdx ? ' is-active' : ''}" `
        + `data-idx="${i}" aria-label="${s.name}" style="--accent-card: ${s.accent};"></button>`
    ).join('');
    dots.querySelectorAll('.stadium-dot').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const idx = parseInt(btn.dataset.idx, 10);
            const dir = idx > stadiumPickerIdx ? 1 : -1;
            stadiumPickerIdx = idx;
            renderStadiumCard(stadiumPickerIdx, dir);
            renderStadiumDots();
        });
    });
}

// Build the persistent viewer slot inside #stadium-card exactly once. The
// 3D preview reattaches its canvas here every navigation, so we don't want to
// nuke its DOM with an innerHTML reset.
function ensureStadiumPickerScaffold() {
    const card = $('stadium-card');
    if (!card || card.querySelector('.stadium-card__viewer')) return;
    card.innerHTML = `
        <div class="stadium-card__viewer" id="stadium-viewer">
            <div class="stadium-card__viewer-fallback" id="stadium-fallback"></div>
        </div>
    `;
}

// Stadium "code" — first 3 letters of each of the first two words (CAM·NOU).
function stadiumCode(stadium) {
    return stadium.name.split(/\s+/).slice(0, 2)
        .map(w => w.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase())
        .filter(Boolean).join('·') || stadium.id.toUpperCase();
}

// Stable faux-occupancy percentage so each stadium has its own "pulse" number
// without polluting the catalog with invented data.
function stadiumPulsePct(stadium) {
    let h = 0;
    for (const c of stadium.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 64 + (h % 32); // 64..95
}

function setText(id, value) {
    const el = $(id);
    if (el && el.textContent !== value) el.textContent = value;
}

// Animate the dossier name with a directional fade-and-blur swap.
function flipStadiumName(newName, dir) {
    const wrap = document.querySelector('#stadium-name .stadium-dossier__namewrap');
    if (!wrap) return;
    if (wrap.textContent === newName && !dir) { wrap.textContent = newName; return; }
    const sign = dir < 0 ? -1 : 1;
    wrap.style.setProperty('--flip-sign', sign);
    wrap.classList.remove('is-flipping-in');
    wrap.classList.add('is-flipping-out');
    setTimeout(() => {
        wrap.textContent = newName;
        wrap.classList.remove('is-flipping-out');
        wrap.classList.add('is-flipping-in');
        setTimeout(() => wrap.classList.remove('is-flipping-in'), 380);
    }, 200);
}

function renderStadiumCard(idx, dir) {
    const card = $('stadium-card');
    if (!card) return;
    const stage   = document.querySelector('#stadium-screen .stadium-stage');
    const stadium = STADIUMS[idx];
    const selectedId = getSelectedStadium().id;
    const isCurrent  = stadium.id === selectedId;
    const hasModel   = !!stadium.file && typeof THREE.GLTFLoader === 'function';

    // accent variable cascades to floodlight, dossier, chips, etc.
    if (stage) stage.style.setProperty('--accent-card', stadium.accent);
    card.style.setProperty('--accent-card', stadium.accent);
    card.dataset.silhouette = stadium.silhouette || 'bowl';
    card.classList.toggle('is-selected', isCurrent);

    // refresh silhouette fallback (sits behind the canvas for load/error states)
    const fallback = $('stadium-fallback');
    if (fallback) fallback.innerHTML = stadiumSilhouetteSVG(stadium);

    // dossier text
    flipStadiumName(stadium.name.toUpperCase(), dir);
    setText('stadium-sub',      stadium.sub);
    setText('stadium-num',      String(idx + 1).padStart(2, '0'));
    setText('stadium-page',     String(idx + 1).padStart(2, '0'));
    setText('stadium-cam',      String(idx + 1).padStart(2, '0'));
    setText('stadium-code',     stadiumCode(stadium));
    setText('stadium-stat-cap', stadium.capacity);
    setText('stadium-stat-mood', stadium.mood);
    setText('stadium-stat-type', (stadium.silhouette || 'bowl').toUpperCase());
    setText('stadium-stat-status', isCurrent ? 'GESELECTEERD' : 'OPTIE');

    // tagline (italic serif, with quotes)
    const tag = $('stadium-tagline');
    if (tag) tag.innerHTML = `<em>&ldquo;${stadium.tagline}&rdquo;</em>`;

    // chips: split sub on · and add silhouette as final chip
    const chips = $('stadium-chips');
    if (chips) {
        const parts = (stadium.sub || '').split('·').map(s => s.trim()).filter(Boolean);
        parts.push((stadium.silhouette || 'bowl').toUpperCase());
        chips.innerHTML = parts.map((p, i) =>
            `<span class="stadium-chip${i === 0 ? ' stadium-chip--lead' : ''}">${p}</span>`
        ).join('');
    }

    // expected-occupancy pulse
    const pct = stadiumPulsePct(stadium);
    const fill = $('stadium-pulse-fill');
    if (fill) fill.style.setProperty('--pct', pct + '%');
    setText('stadium-pulse-pct', pct + '%');

    // prev/next preview labels in the footer nav
    const total = STADIUMS.length;
    const prevS = STADIUMS[(idx - 1 + total) % total];
    const nextS = STADIUMS[(idx + 1) % total];
    setText('stadium-nav-prev-name', prevS.name);
    setText('stadium-nav-next-name', nextS.name);

    // re-trigger broadside slide animation directionally
    if (stage) {
        stage.classList.remove('is-flipping-l', 'is-flipping-r');
        void stage.offsetWidth;
        if (dir > 0)      stage.classList.add('is-flipping-r');
        else if (dir < 0) stage.classList.add('is-flipping-l');
    }

    // mount or swap the 3D preview
    if (hasModel) {
        const slot = $('stadium-viewer');
        if (slot) STADIUM_PREVIEW.show(stadium, slot);
    } else {
        STADIUM_PREVIEW.detach();
    }
}

// ----------- timecode ticker (cinematic chrome on the viewer) -----------
let timecodeRaf = 0;
let timecodeStart = 0;
function startTimecode() {
    if (timecodeRaf) return;
    timecodeStart = performance.now();
    const el = $('stadium-tc');
    if (!el) return;
    const tick = () => {
        if (STATE.screen !== 'stadium') { timecodeRaf = 0; return; }
        const t = (performance.now() - timecodeStart) / 1000;
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        const f = Math.floor((t * 24) % 24).toString().padStart(2, '0');
        el.textContent = `00:${m}:${s}:${f}`;
        timecodeRaf = requestAnimationFrame(tick);
    };
    timecodeRaf = requestAnimationFrame(tick);
}
function stopTimecode() {
    if (timecodeRaf) cancelAnimationFrame(timecodeRaf);
    timecodeRaf = 0;
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
                if (m.metalness !== undefined) m.metalness = Math.min(0.5, m.metalness);
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
                undefined,
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
            slot.classList.remove('is-ready');
            if (model) { scene.remove(model); model = null; }

            loadStadium(stadium)
                .then((obj) => {
                    if (currentId !== stadium.id) return; // user already moved on
                    setModel(obj);
                    slot.classList.remove('is-loading');
                    slot.classList.add('is-ready');
                })
                .catch((err) => {
                    console.warn(`stadium preview "${stadium.id}" failed to load`, err);
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

function stadiumSilhouetteSVG(stadium) {
    const acc = stadium.accent;
    const sil = stadium.silhouette || 'bowl';
    const initial = (stadium.name[0] || 'A').toUpperCase();
    const gradId = `silTurf-${stadium.id}`;

    // outer shell varies by silhouette type
    let shell;
    if (sil === 'rect') {
        shell = `<path d="M 30 165 L 30 105 L 330 105 L 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    } else if (sil === 'classic') {
        shell = `<path d="M 30 165 Q 30 95 180 88 Q 330 95 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    } else { // bowl
        shell = `<path d="M 30 165 Q 30 110 90 110 L 270 110 Q 330 110 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    }

    return `
    <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="${acc}" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="${acc}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <ellipse cx="180" cy="65" rx="170" ry="42" fill="url(#${gradId})"/>
        ${shell}
        <ellipse cx="180" cy="142" rx="120" ry="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
        <line x1="180" y1="122" x2="180" y2="162" stroke="rgba(255,255,255,0.22)" stroke-width="0.9"/>
        <ellipse cx="180" cy="142" rx="14" ry="4.5" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.9"/>
        <g stroke="${acc}" stroke-width="1.4" opacity="0.9">
            <line x1="50"  y1="105" x2="50"  y2="55"/>
            <line x1="310" y1="105" x2="310" y2="55"/>
            <circle cx="50"  cy="50" r="6" fill="${acc}"/>
            <circle cx="310" cy="50" r="6" fill="${acc}"/>
        </g>
        <text x="180" y="84" text-anchor="middle"
              fill="${acc}" opacity="0.16"
              style="font-family: Anton, Impact, sans-serif; font-size: 80px; letter-spacing: -3px;">${initial}</text>
    </svg>`;
}
// ----------- stadium model -----------
let stadiumLoaded = false;
function buildStadium() {
    const stadium = getSelectedStadium();
    // procedural-only entry, or loader unavailable
    if (!stadium.file || typeof THREE.GLTFLoader !== 'function') {
        buildStadiumFallback();
        return;
    }

    // per-stadium tuning (defaults preserve the old behaviour for arena.glb)
    const scaleMul   = stadium.scaleMul   ?? 1.0;        // multiplies auto-fit
    const offsetY    = stadium.offsetY    ?? 0;          // lift / lower after fit
    const colorScale = stadium.colorScale ?? 1.0;        // <1 = darken textures
    const rotateY    = stadium.rotateY    ?? 0;          // radians, useful when pitch is rotated 90°
    const sinkY      = stadium.sinkY      ?? 0;          // lower imports below our gameplay field
    const fieldCutout = stadium.fieldCutout === true;    // hide imported pitch/flat centre meshes
    const pitchBlur = stadium.pitchBlur ?? 0;            // CSS-blur radius (px) applied to GLB pitch textures
    const cutawayFrontZ = stadium.cutawayFrontZ ?? null; // hide near-side GLB pieces in camera corridor
    const nativePitch = stadium.nativePitch === true;    // use the GLB's own pitch (no dimming)
    const pitchBrighten = stadium.pitchBrighten ?? 1.0;  // extra multiplier on pitch base color
    const gameplayScale = stadium.gameplayScale ?? 1.0;  // make imported stadiums feel larger in-game

    const loader = new THREE.GLTFLoader();
    loader.load(
        stadium.file,
        (gltf) => {
            const arena = gltf.scene;
            arena.rotation.y = rotateY;

            // Step 1 — rough auto-fit so the longest horizontal span of the
            // import covers ~2.4× our gameplay width. Gets us into the right
            // ballpark for stadiums that don't use nativePitch.
            arena.updateMatrixWorld(true);
            const bbox = new THREE.Box3().setFromObject(arena);
            const size = bbox.getSize(new THREE.Vector3());
            const targetSpan = FIELD_W * 2.4;
            const span = Math.max(size.x, size.z);
            const initialScale = (span > 0.01 ? targetSpan / span : 1) * scaleMul;
            arena.scale.setScalar(initialScale);

            // Step 2 — when the GLB's own pitch IS the gameplay surface,
            // refine the scale so the imported pitch matches FIELD_W × FIELD_L
            // (with a small margin), then recenter on the *pitch* center and
            // park the grass surface at world y ≈ 0. Without this the players
            // and goals end up as figurines floating in the middle of a much
            // larger imported pitch.
            let pitchBox = nativePitch ? findGLBPitchBox(arena) : null;
            // Last-resort fallback: if both strict + relaxed passes failed,
            // pick the LARGEST flat-low mesh in the lower 50% of the model
            // and treat IT as the pitch. Pure geometry — no offCenter / ratio
            // gates, just "biggest grass-shaped slab near the floor". This
            // catches stadiums (Etihad's solar-canopy bbox skew, etc.) where
            // the heuristic gates all reject the real pitch.
            if (nativePitch && !pitchBox) {
                pitchBox = findLargestFlatLowMesh(arena);
                if (pitchBox) {
                    const sz = pitchBox.getSize(new THREE.Vector3());
                    console.log(`[pitch-largest] ${stadium.id}: using largest-flat-low fallback, size ${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)}`);
                }
            }
            if (pitchBox) {
                const ps = pitchBox.getSize(new THREE.Vector3());
                const targetPitchW = FIELD_W * 1.05;
                const targetPitchL = FIELD_L * 1.05;
                const correction = Math.min(targetPitchW / ps.x, targetPitchL / ps.z);
                if (Number.isFinite(correction) && correction > 0 && Math.abs(correction - 1) > 0.02) {
                    arena.scale.multiplyScalar(correction);
                    arena.updateMatrixWorld(true);
                    pitchBox = findGLBPitchBox(arena); // refresh after rescale
                }
            }

            // Step 3 — recenter & place
            arena.updateMatrixWorld(true);
            if (nativePitch && pitchBox) {
                const pcenter = pitchBox.getCenter(new THREE.Vector3());
                arena.position.x -= pcenter.x;
                arena.position.z -= pcenter.z;
                arena.position.y -= pitchBox.max.y; // pitch top surface sits at y ≈ 0
            } else {
                const fitted = new THREE.Box3().setFromObject(arena);
                const center = fitted.getCenter(new THREE.Vector3());
                arena.position.x -= center.x;
                arena.position.z -= center.z;
                arena.position.y -= fitted.min.y;
            }
            arena.position.y += offsetY;
            arena.position.y -= sinkY;
            if (gameplayScale !== 1.0) {
                arena.scale.multiplyScalar(gameplayScale);
                arena.position.multiplyScalar(gameplayScale);
            }

            // CRITICAL: refresh world matrices before any setFromObject() call
            // in the traverse. We just changed arena.position above, and without
            // this every Box3 we compute uses stale matrixWorld -> meshes appear
            // at the wrong y/x/z and fail the "low/flat/near-pitch" predicates.
            arena.updateMatrixWorld(true);

            // Safety net for nativePitch — even after y-tiebreak picks the
            // upper of two similar candidates, a fundering or below-grass
            // slab can still slip through and place the visible Etihad
            // grass several units above world y=0, leaving the players
            // buried (10.png — pitch markings clean, no figures visible).
            // We raycast straight down from y=200 at the pitch centre and
            // sample 8 surrounding spots; the median hit y is the true
            // pitch surface. If it's significantly above 0, lower the
            // arena so the grass lands at y=0 — players walk on top.
            if (nativePitch) {
                const probes = [
                    [0, 0], [10, 10], [-10, -10], [10, -10], [-10, 10],
                    [25, 0], [-25, 0], [0, 15], [0, -15],
                ];
                const hitsY = [];
                const ray = new THREE.Raycaster();
                ray.firstHitOnly = false;
                for (const [px, pz] of probes) {
                    ray.set(new THREE.Vector3(px, 200, pz), new THREE.Vector3(0, -1, 0));
                    const intersections = ray.intersectObject(arena, true);
                    // Take the LOWEST hit at this xz — the highest hit is
                    // typically the roof; pitch is the lowest visible
                    // surface from above (everything below pitch is
                    // covered by the pitch mesh).
                    if (intersections.length) {
                        // sort hits by y ascending — pick the lowest above
                        // the floor (>-1) and below typical roof height (<25)
                        const valid = intersections
                            .map(h => h.point.y)
                            .filter(y => y > -2 && y < 25)
                            .sort((a, b) => a - b);
                        if (valid.length) hitsY.push(valid[0]);
                    }
                }
                if (hitsY.length >= 5) {
                    hitsY.sort((a, b) => a - b);
                    const medianY = hitsY[Math.floor(hitsY.length / 2)];
                    if (Math.abs(medianY) > 0.4) {
                        console.log(`[pitch-correction] ${stadium.id}: visible pitch surface measured at y=${medianY.toFixed(2)} via raycast (${hitsY.length} hits) — lowering arena by that amount so grass lands at y=0`);
                        arena.position.y -= medianY;
                        arena.updateMatrixWorld(true);
                    } else {
                        console.log(`[pitch-correction] ${stadium.id}: visible pitch surface @ y=${medianY.toFixed(2)} — within tolerance, no correction needed`);
                    }
                } else {
                    console.log(`[pitch-correction] ${stadium.id}: only ${hitsY.length}/9 raycast hits — skipping (probably hit the void or roof only)`);
                }
            }

            let _pitchMeshHits = 0;
            const _flatLowMeshes = [];
            const _allMeshes = [];
            // Shared across the traverse so we don't dark-lift the same diffuse
            // texture twice when multiple meshes share a material.
            const _processedMaps = new WeakSet();
            arena.traverse((c) => {
                if (!c.isMesh) return;
                const isPitchMesh = looksLikePitchMesh(c);
                if (isPitchMesh) _pitchMeshHits++;
                // collect every flat-low candidate so we can report what we
                // saw if the dark-lift didn't fire on the right mesh, AND so
                // we know which meshes to apply the (safe, green-gated) lift to
                let isFlatLowCandidate = false;
                if (nativePitch) {
                    const b = new THREE.Box3().setFromObject(c);
                    if (!b.isEmpty()) {
                        const sz = b.getSize(new THREE.Vector3());
                        const hasMap = !!(c.material && (Array.isArray(c.material) ? c.material[0]?.map : c.material.map));
                        // log every mesh with a diffuse map so if detection still
                        // fails we can pick the pitch out by hand from the dump
                        if (hasMap) {
                            _allMeshes.push({
                                name: c.name || '(unnamed)',
                                size: { x: +sz.x.toFixed(2), y: +sz.y.toFixed(2), z: +sz.z.toFixed(2) },
                                yMin: +b.min.y.toFixed(2),
                                yMax: +b.max.y.toFixed(2),
                                xCenter: +((b.min.x + b.max.x) / 2).toFixed(2),
                                zCenter: +((b.min.z + b.max.z) / 2).toFixed(2),
                                isPitchMesh,
                            });
                        }
                        // Generous flat-low gate: we'd rather catch too much
                        // (the green-dominance gate inside dark-lift will skip
                        // non-grass textures anyway) than miss the actual pitch
                        // because of a slightly weird centering.
                        if (sz.y < 8 && b.min.y < 30 && Math.max(sz.x, sz.z) > FIELD_W * 0.18) {
                            isFlatLowCandidate = true;
                            _flatLowMeshes.push({
                                name: c.name || '(unnamed)',
                                isPitchMesh,
                                size: { x: +sz.x.toFixed(2), y: +sz.y.toFixed(2), z: +sz.z.toFixed(2) },
                                yMin: +b.min.y.toFixed(2),
                                hasMap,
                                transparent: Array.isArray(c.material) ? c.material[0]?.transparent : c.material?.transparent,
                            });
                        }
                    }
                }

                // hide unwanted meshes:
                //  - if fieldCutout is on (legacy: replace GLB pitch with our own)
                //  - if cutawayFrontZ removes near-side stands blocking camera
                if (
                    (fieldCutout && isPitchMesh) ||
                    shouldHideImportedFrontMesh(c, cutawayFrontZ) ||
                    shouldHideCameraSideMesh(c, stadium) ||
                    shouldHideImportedUndersideBar(c, stadium)
                ) {
                    c.visible = false;
                    return;
                }

                // Shadow-decal detection: a flat-low mesh whose texture has
                // both clearly-dark patches AND clearly-bright background is
                // the airplane/roof overlay (works whether the mesh is
                // transparent OR opaque — Old Trafford's airplane mesh is
                // opaque with a sand-colored BG, and was previously skipped by
                // the transparency-only check). Real grass meshes are mid-
                // luminance everywhere → they fail this signature → preserved.
                if (nativePitch && isFlatLowCandidate) {
                    const matRef = Array.isArray(c.material) ? c.material[0] : c.material;
                    if (matRef && matRef.map) {
                        const cls = classifyOverlayTexture(matRef.map, `${stadium.id}:${c.name || 'unnamed'}`);
                        if (cls.ok && cls.isShadowDecal) {
                            console.log(`[overlay] HIDING shadow-decal mesh "${c.name || 'unnamed'}"`);
                            c.visible = false;
                            return;
                        }
                    }
                }

                c.receiveShadow = true;
                c.castShadow = false;
                if (!c.material) return;

                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(m => {
                    // tame overly emissive baked-in lighting (sun, daylight)
                    if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = 0.4;
                    if (m.metalness !== undefined) m.metalness = Math.min(0.4, m.metalness);

                    const isOfficialPitch = nativePitch && isPitchMesh;
                    // Treat ANY flat-low candidate as a pitch material for the
                    // "kill baked daylight shadows" pass. The strict
                    // looksLikePitchMesh test misses Old Trafford's pitch (0
                    // hits in console), so the lightmap + AO + emissive zeros
                    // never fired and roof-shadow silhouettes survived. This
                    // bypass guarantees the channels get switched off on the
                    // actual grass mesh, regardless of how oddly it's shaped.
                    const isPitchLike = isOfficialPitch || (nativePitch && isFlatLowCandidate);

                    if (isPitchLike) {
                        if (pitchBrighten !== 1.0 && m.color) m.color.multiplyScalar(pitchBrighten);
                        m.roughness = Math.max(0.85, m.roughness ?? 1);
                        // kill baked-in daylight shadows (lightmap + AO + emissive)
                        // — this is what was missing for Old Trafford. Roof &
                        // catwalk shadows are typically baked into the lightmap
                        // channel of the pitch material, NOT the diffuse map, so
                        // no amount of pixel-tweaking on m.map could remove them.
                        const beforeLM = m.lightMapIntensity;
                        const beforeAO = m.aoMapIntensity;
                        const beforeEM = m.emissiveIntensity;
                        if (m.lightMap) m.lightMapIntensity = 0;
                        if (m.aoMap) m.aoMapIntensity = 0;
                        if (m.emissive) m.emissiveIntensity = 0;
                        m.needsUpdate = true;
                        console.log(`[pitch-channels] ${stadium.id}:${c.name || 'unnamed'}: lightMap=${!!m.lightMap}(${beforeLM}→0) aoMap=${!!m.aoMap}(${beforeAO}→0) emissive=${beforeEM}→0`);
                    }

                    // v15: REPLACE the diffuse map outright with our procedural
                    // stripe texture. Pixel-level dark-lift (v9) and spatial
                    // blob-killing (v11) both failed because the airplane
                    // silhouettes baked into Old Trafford's GLB pitch share
                    // the exact dark-green colour of the natural mowing
                    // stripes — no colour, channel, or shape filter could
                    // separate them. Replacing the entire map is the only
                    // remaining option that's guaranteed to remove them.
                    // Heavy gaussian blur on the pitch's diffuse texture.
                    // This smears the baked airplane-shaped shadows into the
                    // surrounding grass without breaking the GLB's per-mesh
                    // UV mapping (which is what wrecked v15's stripe replace).
                    // Mowing stripes are large continuous bands so they
                    // soften but stay readable; airplane silhouettes are
                    // bordered on all sides by green grass and dissolve into
                    // it under enough blur radius.
                    if (isPitchLike && pitchBlur > 0 && m.map && !_processedMaps.has(m.map)) {
                        _processedMaps.add(m.map);
                        const blurred = blurPitchTexture(m.map, pitchBlur, `${stadium.id}:${c.name || 'unnamed'}`);
                        if (blurred) {
                            _processedMaps.add(blurred);
                            m.map = blurred;
                            m.needsUpdate = true;
                        }
                    }

                    if (isPitchLike) return;

                    // dim stands / roof / signage to match our night atmosphere
                    if (m.emissive && colorScale < 1) m.emissive.multiplyScalar(colorScale);
                    if (colorScale < 1 && m.color) m.color.multiplyScalar(colorScale);
                });
            });

            if (nativePitch) {
                console.log(`[pitch] ${stadium.id}: ${_pitchMeshHits} mesh(es) passed looksLikePitchMesh(), ${_flatLowMeshes.length} flat-low candidate(s), ${_allMeshes.length} mesh(es) with diffuse map`);
                if (_flatLowMeshes.length) {
                    console.log(`[pitch] ${stadium.id}: flat-low candidates:`, _flatLowMeshes);
                }
                if (_allMeshes.length) {
                    // sort by area (x*z) descending — pitch is typically among the
                    // largest mapped meshes, so it'll be near the top of this list
                    _allMeshes.sort((a, b) => (b.size.x * b.size.z) - (a.size.x * a.size.z));
                    console.log(`[pitch] ${stadium.id}: top 12 mapped meshes by footprint:`, _allMeshes.slice(0, 12));
                }
            }

            // World-space clipping plane for stadiums whose roof/canopy mesh
            // wraps around BOTH sides — shouldHideCameraSideMesh checks mesh
            // center.z and shouldHideImportedFrontMesh checks box.min.z, but a
            // single mesh that spans z=[-60..+60] (Etihad's solar-panel
            // canopy) has center.z = 0 and min.z = -60 → fails both gates,
            // even though half the mesh sits between the camera and the
            // pitch. A clip plane slices through the world geometry, so the
            // half on the camera side disappears regardless of mesh boundaries.
            if (stadium.cameraCutaway && stadium.cameraPos) {
                const camPos = new THREE.Vector3(stadium.cameraPos[0], 0, stadium.cameraPos[2]);
                const lookAt = new THREE.Vector3(
                    stadium.cameraLookAt?.[0] || 0, 0,
                    stadium.cameraLookAt?.[2] || 0
                );
                const camDir = lookAt.clone().sub(camPos);
                if (camDir.lengthSq() > 0.001) {
                    camDir.normalize();
                    // Plane sits offsetDist on the camera side of lookAt, with its
                    // normal pointing INTO the pitch (away from camera). Three.js
                    // clips the side where signedDistance < 0 → that's the camera side.
                    const offsetDist = FIELD_L * 0.5 + 6;
                    const planePoint = lookAt.clone().add(camDir.clone().multiplyScalar(-offsetDist));
                    const clipPlane = new THREE.Plane();
                    clipPlane.setFromNormalAndCoplanarPoint(camDir, planePoint);

                    let clipped = 0;
                    arena.traverse((c) => {
                        if (!c.isMesh || !c.material) return;
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        mats.forEach((m) => {
                            m.clippingPlanes = [clipPlane];
                            m.clipShadows = true;
                            m.needsUpdate = true;
                        });
                        clipped++;
                    });
                    console.log(`[cameraCutaway] ${stadium.id}: clip plane @ ${planePoint.x.toFixed(1)},${planePoint.y.toFixed(1)},${planePoint.z.toFixed(1)} normal ${camDir.x.toFixed(2)},${camDir.y.toFixed(2)},${camDir.z.toFixed(2)} — applied to ${clipped} mesh(es)`);
                }
            }

            arena.userData.tag = 'stadium';
            scene.add(arena);
            stadiumLoaded = true;
        },
        undefined,
        (err) => {
            console.warn(`stadium "${stadium.id}" (${stadium.file}) failed to load — falling back to procedural surroundings`, err);
            buildStadiumFallback();
        }
    );

    // always render the fallback bowl too — it sits below the imported model
    // so we always have *something* if the GLB is small/transparent in spots.
    buildStadiumFallback();
}

// Translation-invariant pitch finder — used during auto-fit when the GLB
// hasn't been recentered yet. We score every flat-low candidate mesh and
// pick the SINGLE best one. The previous version unioned everything that
// looked vaguely pitch-y, which on Camp Nou ate the entire stadium floor
// and shrunk the model to a miniature.
//
// Scoring favours:
//  - meshes whose name actually contains pitch/field/grass/turf
//  - meshes whose width:length ratio is football-like (~1.5)
//  - meshes that are roughly centred in the stadium footprint
//  - moderate size (not vanishingly small, not bigger than a real pitch)
function findGLBPitchBox(arena) {
    arena.updateMatrixWorld(true);
    const importBbox = new THREE.Box3().setFromObject(arena);
    if (importBbox.isEmpty()) return null;
    const importHeight = Math.max(0.001, importBbox.max.y - importBbox.min.y);
    const importSize = importBbox.getSize(new THREE.Vector3());
    const importCenter = importBbox.getCenter(new THREE.Vector3());
    const importSpan = Math.max(importSize.x, importSize.z) || 1;

    // Two-pass collector: strict thresholds first (so well-formed GLBs like
    // Camp Nou / Old Trafford keep behaving exactly as before), then a relaxed
    // pass for outliers like Etihad whose pitch fails offCenter/yFromBottom
    // (rooftop solar panels skew the bbox so the pitch ends up "high" and
    // off-centre relative to the bbox-based reference frame).
    const collect = ({ maxOff, maxYFrac, maxRatio, label }) => {
        const out = [];
        arena.traverse((c) => {
            if (!c.isMesh) return;
            const b = new THREE.Box3().setFromObject(c);
            if (b.isEmpty()) return;
            const s = b.getSize(new THREE.Vector3());
            if (s.x < 20 || s.z < 20) return;
            if (s.y > Math.max(4, Math.min(s.x, s.z) * 0.08)) return; // not flat
            const yFromBottom = b.min.y - importBbox.min.y;
            if (yFromBottom > importHeight * maxYFrac) return; // not low

            const longer  = Math.max(s.x, s.z);
            const shorter = Math.min(s.x, s.z);
            const ratio   = longer / shorter;
            if (ratio > maxRatio) return;

            const center = b.getCenter(new THREE.Vector3());
            const offX = (center.x - importCenter.x) / importSize.x;
            const offZ = (center.z - importCenter.z) / importSize.z;
            const offCenter = Math.hypot(offX, offZ);
            if (offCenter > maxOff) return;

            const namedAsPitch = /(^|[_\s\-/])(pitch|field|grass|turf)([_\s\-/]|$)/i.test(c.name || '');
            const sizeFrac = longer / importSpan;

            let score = 0;
            score += namedAsPitch ? 0 : 100;          // huge bonus for name match
            score += Math.abs(ratio - 1.54) * 40;     // football ratio target
            score += offCenter * 30;                  // central preference
            score += Math.abs(sizeFrac - 0.42) * 25;  // expected ~42% of stadium span
            out.push({ box: b.clone(), score, namedAsPitch, ratio, sizeFrac, label });
        });
        return out;
    };

    // strict pass — exactly the pre-fallback gate
    let candidates = collect({ maxOff: 0.20, maxYFrac: 0.22, maxRatio: 1.95, label: 'strict' });
    // relaxed pass — only used when the strict pass returned nothing. The
    // scoring still rewards central + football-shaped meshes, so a parking
    // lot can't hijack the pick from a real pitch.
    if (!candidates.length) {
        candidates = collect({ maxOff: 0.40, maxYFrac: 0.50, maxRatio: 2.4, label: 'relaxed' });
        if (candidates.length) {
            console.log(`[pitch-fallback] strict pass found 0; relaxed pass found ${candidates.length} candidate(s)`);
        }
    }

    if (!candidates.length) {
        console.log('[findGLBPitchBox] returning null — no candidates passed strict OR relaxed pass');
        return null;
    }

    // strongest signal: an explicit pitch/field/grass/turf name. If any
    // candidate has it, only consider those — geometry voodoo can't beat a
    // model that already knows what it is.
    const named = candidates.filter(c => c.namedAsPitch);
    const pool  = named.length ? named : candidates;
    pool.sort((a, b) => a.score - b.score);
    // Y-tiebreak: among candidates within 30 score-points of the best,
    // prefer the HIGHEST one. This stops a flat foundation slab from being
    // picked when the actual grass mesh sits a few units on top of it
    // (Etihad in 10.png — players got buried under a visible pitch that
    // was higher than the picked "pitch" in world coords).
    const bestScore = pool[0].score;
    const closeToBest = pool.filter(c => c.score <= bestScore + 30);
    closeToBest.sort((a, b) => b.box.min.y - a.box.min.y);
    const pick = closeToBest[0];
    const sz = pick.box.getSize(new THREE.Vector3());
    const ctr = pick.box.getCenter(new THREE.Vector3());
    console.log(`[findGLBPitchBox] picked (${pick.label}): size=${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)} center=(${ctr.x.toFixed(1)},${ctr.y.toFixed(1)},${ctr.z.toFixed(1)}) ratio=${pick.ratio.toFixed(2)} score=${pick.score.toFixed(1)} named=${pick.namedAsPitch}`);
    if (closeToBest.length > 1) {
        console.log(`[findGLBPitchBox] y-tiebreak considered ${closeToBest.length} similar candidates:`, closeToBest.map(c => ({ score: +c.score.toFixed(1), yMin: +c.box.min.y.toFixed(2), yMax: +c.box.max.y.toFixed(2) })));
    }
    return pick.box.clone();
}

// Last-resort pitch finder — used when both strict and relaxed passes of
// findGLBPitchBox come up empty.  Scores all flat-low meshes by how
// pitch-shaped they are (xz-ratio close to 1.55, footprint between 5-35%
// of the stadium plan, name-as-pitch bonus), so a wide flat parking lot
// or huge plaza floor mesh can't outrank the actual grass.
function findLargestFlatLowMesh(arena) {
    arena.updateMatrixWorld(true);
    const importBbox = new THREE.Box3().setFromObject(arena);
    if (importBbox.isEmpty()) return null;
    const importSize = importBbox.getSize(new THREE.Vector3());
    const importFootprint = (importSize.x * importSize.z) || 1;
    const importHeight = Math.max(0.001, importBbox.max.y - importBbox.min.y);

    const candidates = [];
    arena.traverse((c) => {
        if (!c.isMesh) return;
        const b = new THREE.Box3().setFromObject(c);
        if (b.isEmpty()) return;
        const s = b.getSize(new THREE.Vector3());
        if (s.x < 25 || s.z < 25) return;
        const longer = Math.max(s.x, s.z);
        const shorter = Math.min(s.x, s.z);
        if (s.y > longer * 0.15) return; // not flat
        const yFromBottom = b.min.y - importBbox.min.y;
        if (yFromBottom > importHeight * 0.65) return; // not low
        const ratio = longer / shorter;
        if (ratio > 3.5) return; // way too elongated to be a pitch

        const area = s.x * s.z;
        const footprintFrac = area / importFootprint;
        const namedAsPitch = /(^|[_\s\-/])(pitch|field|grass|turf|ground)([_\s\-/]|$)/i.test(c.name || '');

        let score = 0;
        // football pitch ratio target
        score += Math.abs(ratio - 1.55) * 35;
        // pitches typically take 8-30% of stadium plan; penalise outside that band
        if (footprintFrac < 0.06) score += 90;       // suspiciously small
        else if (footprintFrac > 0.40) score += 90;  // suspiciously large (plaza/whole floor)
        else score += Math.abs(footprintFrac - 0.18) * 30; // sweet-spot ~18%
        // strong bonus if the mesh names itself as a pitch
        if (namedAsPitch) score -= 250;

        candidates.push({ box: b.clone(), score, area, footprintFrac, ratio, namedAsPitch, name: c.name || '(unnamed)' });
    });

    if (!candidates.length) {
        console.log('[findLargestFlatLowMesh] no flat-low candidates at all');
        return null;
    }
    candidates.sort((a, b) => a.score - b.score);
    // Y-tiebreak: among candidates within 30 score-points of the best,
    // prefer the highest mesh. Catches the "foundation below the grass"
    // case where both meshes look pitch-shaped but only the upper one
    // is the actual playable surface.
    const bestScore = candidates[0].score;
    const closeToBest = candidates.filter(c => c.score <= bestScore + 30);
    closeToBest.sort((a, b) => b.box.min.y - a.box.min.y);
    const pick = closeToBest[0];
    const sz = pick.box.getSize(new THREE.Vector3());
    const ctr = pick.box.getCenter(new THREE.Vector3());
    console.log(`[findLargestFlatLowMesh] picked "${pick.name}" score=${pick.score.toFixed(0)} ratio=${pick.ratio.toFixed(2)} footprintFrac=${(pick.footprintFrac*100).toFixed(1)}% size=${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)} center=(${ctr.x.toFixed(1)},${ctr.y.toFixed(1)},${ctr.z.toFixed(1)}) named=${pick.namedAsPitch}`);
    if (closeToBest.length > 1) {
        console.log(`[findLargestFlatLowMesh] y-tiebreak considered ${closeToBest.length} similar candidates:`, closeToBest.map(c => ({ name: c.name, score: +c.score.toFixed(0), yMin: +c.box.min.y.toFixed(2), yMax: +c.box.max.y.toFixed(2) })));
    }
    return pick.box.clone();
}

// Detect whether a mesh inside the imported GLB looks like the stadium pitch
// (broad, low to the ground, near the gameplay rectangle, or simply named like
// a pitch).  Used both to hide the import-pitch when we want our procedural
// rectangle, and to keep the import-pitch bright when we use it as the
// gameplay surface.  Assumes the GLB is already recentered around the origin.
// Inspects the diffuse texture of a flat-low candidate to decide whether it
// is a "shadow decal" — a plane sitting on/above the pitch with dark
// airplane/roof-shadow shapes painted on a brighter background. Works for
// both alpha-blended decals AND opaque meshes whose texture has the same
// signature (Old Trafford's airplane mesh is opaque with avg RGB
// (170, 175, 119) — bright sand background, dark airplane silhouettes).
//
// Heuristic: a shadow-decal texture has BOTH a substantial dark-pixel
// population (the airplanes themselves) AND a substantial bright-pixel
// population (the surrounding background). Genuine grass textures have
// neither — they're mid-luminance. Line-marking decals have bright pixels
// but few dark ones, so they survive.
function classifyOverlayTexture(srcTex, label) {
    const img = srcTex && srcTex.image;
    if (!img || !img.width || !img.height) return { ok: false };
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try { ctx.drawImage(img, 0, 0); } catch { return { ok: false }; }
    let id;
    try { id = ctx.getImageData(0, 0, w, h); } catch { return { ok: false }; }
    const data = id.data;
    const stepX = Math.max(1, (w / 64) | 0);
    const stepY = Math.max(1, (h / 64) | 0);
    let visSum = 0, visCount = 0, totalCount = 0, darkCount = 0, brightCount = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    for (let y = 0; y < h; y += stepY) {
        for (let x = 0; x < w; x += stepX) {
            const i = (y * w + x) * 4;
            totalCount++;
            if (data[i + 3] < 128) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            sumR += r; sumG += g; sumB += b;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            visSum += lum;
            visCount++;
            if (lum < 60) darkCount++;
            else if (lum > 170) brightCount++;
        }
    }
    const visiblePct = visCount / totalCount;
    const visAvgLum = visCount ? visSum / visCount : 0;
    const darkPct   = visCount ? darkCount   / visCount : 0;
    const brightPct = visCount ? brightCount / visCount : 0;
    const avgR = visCount ? sumR / visCount : 0;
    const avgG = visCount ? sumG / visCount : 0;
    const avgB = visCount ? sumB / visCount : 0;
    const greenLead = avgG - Math.max(avgR, avgB);
    const isGreenDom = greenLead > 8 && avgG > 25 && avgG < 200;

    // Shadow-decal signature: NOT green-dominant (so it's not a grass mesh)
    // AND has a meaningful population of dark pixels (the silhouettes). Real
    // grass meshes have green-dominant averages → preserved + dark-lifted.
    // Pure-bright meshes (line-marking decals) have darkPct near zero →
    // preserved untouched.
    const isShadowDecal = !isGreenDom && darkPct > 0.02 && darkPct < 0.6;
    console.log(`[overlay] ${label}: avgRGB(${avgR|0},${avgG|0},${avgB|0}) greenLead=${greenLead.toFixed(0)} green=${isGreenDom} lum=${visAvgLum.toFixed(0)} dark=${(darkPct*100).toFixed(1)}% bright=${(brightPct*100).toFixed(1)}% → shadowDecal=${isShadowDecal}`);
    return { ok: true, isShadowDecal, isGreenDom, visAvgLum, visiblePct, darkPct, brightPct };
}

// Returns a fresh CanvasTexture that is the source texture passed through a
// canvas blur(Npx) filter. Used to smear baked dark "airplane" shapes into
// the surrounding grass while leaving the GLB's UV transform intact.
function blurPitchTexture(srcTex, radiusPx, label) {
    const img = srcTex && srcTex.image;
    if (!img || !img.width || !img.height) return null;
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try {
        // Three passes of the canvas filter approximate a stronger gaussian,
        // which is what we need to fully dissolve the airplane silhouettes
        // (a single pass at radius 12 leaves visible "ghost" outlines).
        ctx.filter = `blur(${radiusPx}px)`;
        ctx.drawImage(img, 0, 0);
        ctx.drawImage(c, 0, 0);
        ctx.drawImage(c, 0, 0);
        ctx.filter = 'none';
    } catch (e) {
        console.warn(`[pitch-blur] ${label}: drawImage/filter failed`, e);
        return null;
    }
    console.log(`[pitch-blur] ${label}: applied blur(${radiusPx}px) ×3 to ${w}×${h} texture`);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = srcTex.wrapS;
    tex.wrapT = srcTex.wrapT;
    if (srcTex.repeat) tex.repeat.copy(srcTex.repeat);
    if (srcTex.offset) tex.offset.copy(srcTex.offset);
    if (srcTex.center && tex.center) tex.center.copy(srcTex.center);
    tex.rotation = srcTex.rotation || 0;
    tex.encoding = srcTex.encoding;
    tex.flipY = srcTex.flipY;
    tex.anisotropy = srcTex.anisotropy;
    tex.minFilter = srcTex.minFilter;
    tex.magFilter = srcTex.magFilter;
    tex.needsUpdate = true;
    return tex;
}

// One-shot CPU pixel pass on the pitch's diffuse texture: any pixel whose
// brightest channel is below `threshold` (0-255) is blended toward grass-green
// by `lift` (0-1). Used to fade out roof/structure shadow shapes that the
// stadium GLB had baked into the pitch's base color map at daylight render
// time. Returns a fresh CanvasTexture the material can swap in for `m.map`,
// or null if the source image isn't readable yet (e.g. CORS-tainted).
function liftDarkPatchesTexture(srcTex, threshold, lift, stadiumId) {
    const img = srcTex && srcTex.image;
    if (!img || !img.width || !img.height) {
        console.warn(`[pitch] ${stadiumId}: pitch texture has no readable image yet`, srcTex);
        return null;
    }
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try {
        ctx.drawImage(img, 0, 0);
    } catch (e) {
        console.warn(`[pitch] ${stadiumId}: drawImage failed`, e);
        return null;
    }
    let id;
    try {
        id = ctx.getImageData(0, 0, w, h);
    } catch (e) {
        console.warn(`[pitch] ${stadiumId}: getImageData failed (CORS?)`, e);
        return null;
    }
    const data = id.data;

    // Quick green-dominance sanity check on a 32×32 grid spanning the whole
    // texture, so we can safely run dark-lift on *any* flat-low mesh without
    // wrecking non-grass textures (concrete, wood, signage). If the texture
    // isn't grass-dominant, bail and leave the original m.map alone.
    {
        let sumR = 0, sumG = 0, sumB = 0, samples = 0;
        const stepX = Math.max(1, (w / 32) | 0);
        const stepY = Math.max(1, (h / 32) | 0);
        for (let y = 0; y < h; y += stepY) {
            for (let x = 0; x < w; x += stepX) {
                const i = (y * w + x) * 4;
                sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
                samples++;
            }
        }
        const avgR = sumR / samples, avgG = sumG / samples, avgB = sumB / samples;
        const greenLead = avgG - Math.max(avgR, avgB);
        const isGrass = greenLead > 8 && avgG > 25 && avgG < 200;
        console.log(`[pitch] ${stadiumId}: avg RGB (${avgR | 0}, ${avgG | 0}, ${avgB | 0}) → grass=${isGrass}`);
        if (!isGrass) return null;
    }

    // Conservative chromaticity lift: only gray-dark pixels (achromatic
    // baked roof shadows) get nudged toward grass. Dark green stripes are
    // preserved. This is back to the v9 behaviour after v11's blob-killer
    // turned out to flatten the entire pitch into a uniform dark green
    // (because the airplane "silhouettes" weren't in the texture at all —
    // they were real-time player shadows from the corner spotlight).
    const grass = [40, 76, 30];
    const grayMaxDelta = 25;
    let liftedCount = 0, skippedAsGreen = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const maxChan = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (maxChan >= threshold) continue;
        const minChan = r < g ? (r < b ? r : b) : (g < b ? g : b);
        if (maxChan - minChan > grayMaxDelta) { skippedAsGreen++; continue; }
        const t = 1 - (maxChan / threshold);
        const a = Math.min(1, t * lift);
        data[i]     = r + (grass[0] - r) * a;
        data[i + 1] = g + (grass[1] - g) * a;
        data[i + 2] = b + (grass[2] - b) * a;
        liftedCount++;
    }
    ctx.putImageData(id, 0, 0);
    console.log(`[pitch] ${stadiumId}: lifted ${liftedCount} gray-dark pixels, skipped ${skippedAsGreen} chromatic-dark pixels (threshold ${threshold}, lift ${lift})`);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = srcTex.wrapS;
    tex.wrapT = srcTex.wrapT;
    tex.repeat.copy(srcTex.repeat);
    tex.offset.copy(srcTex.offset);
    if (srcTex.center && tex.center) tex.center.copy(srcTex.center);
    tex.rotation = srcTex.rotation || 0;
    tex.encoding = srcTex.encoding;
    tex.flipY = srcTex.flipY;
    tex.anisotropy = srcTex.anisotropy;
    tex.minFilter = srcTex.minFilter;
    tex.magFilter = srcTex.magFilter;
    tex.needsUpdate = true;
    return tex;
}

function looksLikePitchMesh(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return false;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const overlapsPitch =
        box.max.x > -FIELD_W / 2 - 6 &&
        box.min.x <  FIELD_W / 2 + 6 &&
        box.max.z > -FIELD_L / 2 - 6 &&
        box.min.z <  FIELD_L / 2 + 6;
    if (!overlapsPitch) return false;

    const lowToGround = box.min.y < 5 && center.y < 8;
    const broadFlat = size.y < 3 && size.x > FIELD_W * 0.18 && size.z > FIELD_L * 0.18;
    const namedAsPitch = /pitch|field|grass|turf|ground|plane/i.test(mesh.name || '');

    return lowToGround && (broadFlat || namedAsPitch);
}

function shouldHideImportedFrontMesh(mesh, cutawayFrontZ) {
    if (cutawayFrontZ === null) return false;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return false;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const inFrontOfPitch = box.min.z > cutawayFrontZ;
    const overlapsBroadcastFrame =
        box.max.x > -FIELD_W / 2 - 35 &&
        box.min.x <  FIELD_W / 2 + 35;
    const lowOrMassiveEnoughToBlockPlay = box.min.y < 80 && center.y < 95;
    const notTinyDetail = Math.max(size.x, size.z) > 6;

    return inFrontOfPitch && overlapsBroadcastFrame && lowOrMassiveEnoughToBlockPlay && notTinyDetail;
}

function shouldHideCameraSideMesh(mesh, stadium) {
    if (!stadium.cameraCutaway || !stadium.cameraPos) return false;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return false;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const cam = new THREE.Vector3(stadium.cameraPos[0], 0, stadium.cameraPos[2]);
    if (cam.lengthSq() < 1) return false;
    const dir = cam.normalize();

    const cameraSide = center.x * dir.x + center.z * dir.z;
    const blocksFieldView = cameraSide > FIELD_L * 0.42;
    const lowOrHuge = box.min.y < 95 && center.y < 115;
    const largeEnough = Math.max(size.x, size.z) > 10;
    const notPitch = !looksLikePitchMesh(mesh);

    return blocksFieldView && lowOrHuge && largeEnough && notPitch;
}

function shouldHideImportedUndersideBar(mesh, stadium) {
    if (!stadium.nativePitch || !stadium.cameraPos) return false;
    if (looksLikePitchMesh(mesh)) return false;

    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return false;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const cam = new THREE.Vector3(stadium.cameraPos[0], 0, stadium.cameraPos[2]);
    if (cam.lengthSq() < 1) return false;
    const dir = cam.normalize();
    const cameraSide = center.x * dir.x + center.z * dir.z;

    const isLongBar = Math.max(size.x, size.z) > FIELD_W * 0.55 && Math.min(size.x, size.z) > 3;
    const sitsUnderGameplay = box.min.y < 2 && center.y < 28;
    const onCameraHalf = cameraSide > 0;

    return isLongBar && sitsUnderGameplay && onCameraHalf;
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
