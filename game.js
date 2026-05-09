// =====================================================
// PITCH ROYALE — Stadium Nightfall
// Feature + gameplay logic
// =====================================================


function initThree() {
    if (!scene) {
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(COLORS.fogColor, 130, 320);

        camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 1000);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        // cap pixel ratio harder — Retina at 2× quadruples GPU work for marginal gain
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        // Real-time shadows are intentionally OFF. With them on, the corner
        // spotlight projects player + stadium-mesh silhouettes onto the pitch
        // at a low angle, and from the gameplay camera those projections read
        // as fighter-jet outlines on the grass (verified empirically: turning
        // shadowMap on/off flips them on/off). We compensate with a flat dark
        // round shadow blob mounted under each player in makePlayer().
        renderer.shadowMap.enabled = false;
        // Per-material clipping planes (used by stadiums with cameraCutaway:true,
        // e.g., Etihad — see buildStadium where we install a world-space plane
        // in front of the camera-side stand to slice through wrap-around roof
        // meshes that mesh-level visibility toggles can't hide).
        renderer.localClippingEnabled = true;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        $('game-screen').appendChild(renderer.domElement);

        window.addEventListener('resize', onResize);
        // capture: true so focused buttons / iframes can't swallow the keystroke first
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp, { capture: true });
        // if the window loses focus, drop all held keys so the player doesn't drift
        window.addEventListener('blur', clearAllKeys);
        // tab visibility flip ALSO clears, so a held arrow doesn't get stuck on
        // the way back from a switched tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) clearAllKeys();
        });
        // any time a button steals keyboard focus during play, blur it so arrow
        // keys + space go straight to the game instead of activating the button
        document.addEventListener('focusin', (e) => {
            if (STATE.screen !== 'playing') return;
            const tgt = e.target;
            if (tgt && tgt.tagName === 'BUTTON') tgt.blur();
        });
    }

    // clear previous scene contents
    while (scene.children.length) scene.remove(scene.children[0]);

    buildSky();
    buildLights();
    buildField();
    buildGoals();
    buildStadium();        // imports the .glb of the selected stadium
    buildPlayers();
    buildBall();
    positionForKickoff();

    applyGameplayCamera();

    // reset fixed-step bookkeeping
    physicsAccum = 0;
    lastFrameTime = 0;
    // wipe any stale held keys
    clearAllKeys();
    // sync the bot's perception to the real ball at kickoff
    resetBotPerception();

    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(animate);
}

function applyGameplayCamera() {
    const stadium = getSelectedStadium();
    const pos = stadium.cameraPos || [0, 62, 88];
    const look = stadium.cameraLookAt || [0, 4, 0];
    camera.fov = stadium.cameraFov || 54;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    camera.updateProjectionMatrix();
}

function buildSky() {
    const skyGeo = new THREE.SphereGeometry(420, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            top:    { value: new THREE.Color(COLORS.skyTop) },
            mid:    { value: new THREE.Color(COLORS.skyMid) },
            bottom: { value: new THREE.Color(COLORS.skyBottom) },
        },
        vertexShader: `
            varying vec3 vPos;
            void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
            uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
            varying vec3 vPos;
            void main() {
                float h = normalize(vPos).y;
                vec3 col;
                if (h > 0.0) col = mix(mid, top, smoothstep(0.0, 0.7, h));
                else         col = mix(mid, bottom, smoothstep(0.0, 0.6, -h));
                // subtle starfield from a hashed noise — only in the upper half
                float s = fract(sin(dot(vPos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
                float star = step(0.9985, s) * smoothstep(0.0, 0.4, h);
                col += vec3(star) * 0.8;
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function buildLights() {
    scene.add(new THREE.AmbientLight(0x3a3a3a, 0.45));

    // hemisphere wash — neutral above, deep ground below (no blue night-tint)
    const hemi = new THREE.HemisphereLight(0x5a5a5a, 0x0a0a0a, 0.55);
    scene.add(hemi);

    // primary directional fill (replaces the harsher key) — warm white, no blue
    const fill = new THREE.DirectionalLight(0xeae0c8, 0.35);
    fill.position.set(0, 120, 30);
    scene.add(fill);

    // four cinematic stadium spotlights at the corners
    const corners = [
        [ FIELD_W * 0.7,  90,  FIELD_L * 0.85],
        [-FIELD_W * 0.7,  90,  FIELD_L * 0.85],
        [ FIELD_W * 0.7,  90, -FIELD_L * 0.85],
        [-FIELD_W * 0.7,  90, -FIELD_L * 0.85],
    ];
    corners.forEach(([x, y, z], i) => {
        const spot = new THREE.SpotLight(0xfff7e0, 1.3, 260, Math.PI / 4.6, 0.45, 1.4);
        spot.position.set(x, y, z);
        spot.target.position.set(x * 0.15, 0, z * 0.15);
        // shadows on just one for perf
        if (i === 0) {
            spot.castShadow = true;
            spot.shadow.mapSize.width = 1024;
            spot.shadow.mapSize.height = 1024;
            spot.shadow.bias = -0.0003;
            spot.shadow.camera.near = 30;
            spot.shadow.camera.far = 280;
        }
        scene.add(spot);
        scene.add(spot.target);
    });

    // team-coloured rim lights behind each goal
    const redGlow = new THREE.PointLight(COLORS.team1Hot, 1.6, 80, 2.0);
    redGlow.position.set(-FIELD_W/2 - 4, 6, 0);
    scene.add(redGlow);

    const blueGlow = new THREE.PointLight(COLORS.team2Hot, 1.6, 80, 2.0);
    blueGlow.position.set(FIELD_W/2 + 4, 6, 0);
    scene.add(blueGlow);
}

function makeStripeTexture() {
    // higher-resolution canvas for crisper stripes + faint vertical wear marks
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const ctx = c.getContext('2d');
    const lit  = '#' + COLORS.pitch.toString(16).padStart(6, '0');
    const dark = '#' + COLORS.pitchDark.toString(16).padStart(6, '0');
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? lit : dark;
        ctx.fillRect(0, i * 32, 64, 32);
    }
    // subtle noise overlay
    const img = ctx.getImageData(0, 0, 64, 256);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        img.data[i]   = Math.max(0, Math.min(255, img.data[i]   + n));
        img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
        img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 7);
    tex.anisotropy = 4;
    return tex;
}

function buildField() {
    const stadium = getSelectedStadium();
    // When the selected stadium provides its own baked pitch (Camp Nou,
    // Old Trafford, etc.) we don't want to slap our flat green plane on top —
    // that's the "sticker on a stadium" look we just got rid of.  Render only
    // an invisible shadow-receiver so player shadows still land somewhere, and
    // let the imported GLB pitch + line markings shine through.
    if (stadium?.nativePitch) {
        const shadowGeo = new THREE.PlaneGeometry(FIELD_W + 40, FIELD_L + 30);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.32 });
        const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = 0.02;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        // dark concrete plane far outside the stadium so any gap in the import
        // (cutaways, missing back wall) reads as ground instead of black void
        const outerGeo = new THREE.PlaneGeometry(2000, 2000);
        const outerMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1.0, metalness: 0.0 });
        const outer = new THREE.Mesh(outerGeo, outerMat);
        outer.rotation.x = -Math.PI / 2;
        outer.position.y = -0.6;
        scene.add(outer);
        return;
    }

    const stripe = makeStripeTexture();
    const fieldGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_L);
    const fieldMat = new THREE.MeshStandardMaterial({
        map: stripe,
        roughness: 0.92,
        metalness: 0.0,
        color: 0xffffff,
    });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    scene.add(field);

    // surrounding dark border (visual track)
    const borderGeo = new THREE.PlaneGeometry(FIELD_W + 36, FIELD_L + 30);
    const borderMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1.0 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = -0.05;
    border.receiveShadow = true;
    scene.add(border);

    // markings
    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.9 });
    const drawSegs = (pts) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        scene.add(new THREE.Line(g, lineMat));
    };

    // outer boundary
    drawSegs([
        new THREE.Vector3(-FIELD_W/2, 0.05, -FIELD_L/2),
        new THREE.Vector3( FIELD_W/2, 0.05, -FIELD_L/2),
        new THREE.Vector3( FIELD_W/2, 0.05,  FIELD_L/2),
        new THREE.Vector3(-FIELD_W/2, 0.05,  FIELD_L/2),
        new THREE.Vector3(-FIELD_W/2, 0.05, -FIELD_L/2),
    ]);
    // halfway line
    drawSegs([
        new THREE.Vector3(0, 0.05, -FIELD_L/2),
        new THREE.Vector3(0, 0.05,  FIELD_L/2),
    ]);
    // penalty boxes
    const PB_W = 22, PB_D = 14;
    [-1, 1].forEach(side => {
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05, -PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2),         0.05, -PB_W/2),
        ]);
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05,  PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2),         0.05,  PB_W/2),
        ]);
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05, -PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05,  PB_W/2),
        ]);
    });

    // center circle
    const ringGeo = new THREE.RingGeometry(9.6, 10, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.line, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    // center spot
    const spotGeo = new THREE.CircleGeometry(0.6, 24);
    const spot = new THREE.Mesh(spotGeo, ringMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.06;
    scene.add(spot);
}

function buildGoals() {
    if (getSelectedStadium()?.nativePitch) return;

    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.3 });
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });

    [-1, 1].forEach(side => {
        const x = side * FIELD_W / 2;
        // posts
        const postGeo = new THREE.CylinderGeometry(0.18, 0.18, GOAL_H, 12);
        const post1 = new THREE.Mesh(postGeo, postMat);
        post1.position.set(x, GOAL_H/2, -GOAL_W/2);
        post1.castShadow = true;
        scene.add(post1);

        const post2 = new THREE.Mesh(postGeo, postMat);
        post2.position.set(x, GOAL_H/2, GOAL_W/2);
        post2.castShadow = true;
        scene.add(post2);

        // crossbar
        const crossGeo = new THREE.CylinderGeometry(0.18, 0.18, GOAL_W, 12);
        const cross = new THREE.Mesh(crossGeo, postMat);
        cross.rotation.x = Math.PI / 2;
        cross.position.set(x, GOAL_H, 0);
        cross.castShadow = true;
        scene.add(cross);

        // back of goal — net mesh as line grid
        const depth = 5 * side; // points outward
        const netGroup = new THREE.Group();
        const cols = 9, rows = 6;
        for (let i = 0; i <= cols; i++) {
            const t = i / cols;
            const z = -GOAL_W/2 + t * GOAL_W;
            const pts = [
                new THREE.Vector3(x, 0, z),
                new THREE.Vector3(x, GOAL_H, z),
                new THREE.Vector3(x + depth, GOAL_H, z),
                new THREE.Vector3(x + depth, 0, z),
            ];
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            netGroup.add(new THREE.Line(g, netMat));
        }
        for (let j = 0; j <= rows; j++) {
            const t = j / rows;
            const y = t * GOAL_H;
            const pts = [
                new THREE.Vector3(x, y, -GOAL_W/2),
                new THREE.Vector3(x + depth, y, -GOAL_W/2),
                new THREE.Vector3(x + depth, y,  GOAL_W/2),
                new THREE.Vector3(x, y,  GOAL_W/2),
            ];
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            netGroup.add(new THREE.Line(g, netMat));
        }
        scene.add(netGroup);
    });
}


function makePlayer(color, isKeeper, controlled) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.2,
        roughness: 0.55,
        emissive: controlled ? color : 0x000000,
        emissiveIntensity: controlled ? 0.18 : 0,
    });
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(PLAYER_SIZE/2, PLAYER_SIZE/2 + 0.4, PLAYER_SIZE, 16),
        bodyMat
    );
    body.position.y = PLAYER_SIZE/2;
    // No real-time cast shadow — the cylinder + sphere silhouette projected
    // by the corner spotlight produces an elongated capsule-with-cap shape
    // that, viewed from the gameplay camera, reads as a fighter-jet outline
    // on the pitch. We replace it with a simple round dark blob below.
    body.castShadow = false;
    group.add(body);

    const headMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6, metalness: 0.05 });
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(PLAYER_SIZE * 0.35, 16, 12),
        headMat
    );
    head.position.y = PLAYER_SIZE + PLAYER_SIZE * 0.32;
    head.castShadow = false;
    group.add(head);

    // Fake under-foot shadow blob — replaces the real cast shadow. Stays
    // round regardless of camera angle and reads cleanly as a footprint
    // rather than as an aircraft silhouette.
    const shadowBlob = new THREE.Mesh(
        new THREE.CircleGeometry(PLAYER_SIZE * 0.85, 28),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    shadowBlob.rotation.x = -Math.PI / 2;
    shadowBlob.position.y = 0.04;
    group.add(shadowBlob);

    // controlled-player ring under feet
    if (controlled) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.95, 32),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.08;
        group.userData.ring = ring;
        group.add(ring);
    }

    // keeper jersey marker — gold band
    if (isKeeper) {
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(PLAYER_SIZE/2 + 0.05, PLAYER_SIZE/2 + 0.45, 0.6, 16),
            new THREE.MeshStandardMaterial({ color: COLORS.keeperBand, metalness: 0.7, roughness: 0.3 })
        );
        band.position.y = PLAYER_SIZE * 0.7;
        group.add(band);
    }

    group.userData.isKeeper = isKeeper;
    return group;
}

function buildPlayers() {
    team1Players = [];
    team2Players = [];

    // Optional per-stadium VISUAL scale — shrinks the player mesh group
    // (cylinder + head + ring + shadow blob) without touching collision /
    // physics constants. Used by Etihad to bring the on-screen player-to-
    // pitch ratio (PLAYER_SIZE/FIELD_W = 3.1%) closer to the FIFA-broadcast
    // ratio (~1.5%, see 3.png) — pure cosmetic, gameplay distances unchanged.
    const stadium = getSelectedStadium();
    const visualScale = stadium?.visualPlayerScale ?? 1.0;
    const applyScale = (g) => { if (visualScale !== 1.0) g.scale.setScalar(visualScale); };

    // determine which veldspeler is human-controlled per mode
    // Hot-Seat (duo): both veldspelers are human (P1 + P2)
    // CPU mode:       only P1 is human, the other team's veldspeler is the bot
    const isCpu = STATE.mode === 'cpu';

    // RED team
    const redKeeper = makePlayer(COLORS.team1, true, false);
    redKeeper.position.set(-FIELD_W/2 + 5, 0, 0);
    redKeeper.team = 1;
    redKeeper.isKeeper = true;
    redKeeper.homePosition = { x: -FIELD_W/2 + 5, z: 0 };
    applyScale(redKeeper);
    scene.add(redKeeper);
    team1Players.push(redKeeper);

    // is this team's veldspeler human or bot?
    const redIsHuman = isCpu ? STATE.p1.team === 1 : true;
    const redField = makePlayer(COLORS.team1, false, redIsHuman);
    redField.position.set(-25, 0, 0);
    redField.team = 1;
    redField.isKeeper = false;
    redField.homePosition = { x: -25, z: 0 };
    redField.userData.isBot = !redIsHuman;
    applyScale(redField);
    scene.add(redField);
    team1Players.push(redField);

    // BLUE team
    const blueKeeper = makePlayer(COLORS.team2, true, false);
    blueKeeper.position.set(FIELD_W/2 - 5, 0, 0);
    blueKeeper.team = 2;
    blueKeeper.isKeeper = true;
    blueKeeper.homePosition = { x: FIELD_W/2 - 5, z: 0 };
    applyScale(blueKeeper);
    scene.add(blueKeeper);
    team2Players.push(blueKeeper);

    const blueIsHuman = isCpu ? STATE.p1.team === 2 : true;
    const blueField = makePlayer(COLORS.team2, false, blueIsHuman);
    blueField.position.set(25, 0, 0);
    blueField.team = 2;
    blueField.isKeeper = false;
    blueField.homePosition = { x: 25, z: 0 };
    blueField.userData.isBot = !blueIsHuman;
    applyScale(blueField);
    scene.add(blueField);
    team2Players.push(blueField);

    // assign controllers
    controlledP1 = STATE.p1.team === 1 ? redField : blueField;
    if (isCpu) {
        controlledP2 = null; // bot drives the other team
    } else {
        controlledP2 = STATE.p2.team === 1 ? redField : blueField;
    }
}

function buildBall() {
    const geo = new THREE.SphereGeometry(BALL_SIZE, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.05,
        roughness: 0.4,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
    });
    ball = new THREE.Mesh(geo, mat);
    ball.position.set(0, BALL_SIZE, 0);
    ball.castShadow = true;
    ball.velocity = { x: 0, y: 0, z: 0 };
    // Match the player visualPlayerScale so ball + figures stay in proportion.
    const stadium = getSelectedStadium();
    const visualScale = stadium?.visualPlayerScale ?? 1.0;
    if (visualScale !== 1.0) ball.scale.setScalar(visualScale);
    scene.add(ball);
}

function positionForKickoff() {
    ball.position.set(0, BALL_SIZE, 0);
    ball.velocity = { x: 0, y: 0, z: 0 };

    // clear any in-flight keeper holds and player charges
    [...team1Players, ...team2Players].forEach(p => {
        p.userData.holdingBall = false;
        p.userData.holdStart = 0;
        p.userData.charging = false;
        p.userData.chargeStart = 0;
        p.userData.shootHeld = false;
    });

    // home positions
    team1Players[0].position.set(-FIELD_W/2 + 5, 0, 0);   // red keeper
    team2Players[0].position.set( FIELD_W/2 - 5, 0, 0);   // blue keeper

    if (STATE.kickoffTeam === 1) {
        team1Players[1].position.set(-3, 0, 0);
        team2Players[1].position.set( 18, 0, 0);
    } else {
        team1Players[1].position.set(-18, 0, 0);
        team2Players[1].position.set( 3, 0, 0);
    }
}

function onResize() {
    if (!camera || !renderer) return;
    applyGameplayCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------- input -----------
// keys[]        : currently held (level-triggered, used for movement)
// keysPressed[] : just-pressed this tick (edge-triggered, used for shooting)
const keysPressed = {};
const GAME_KEYS = new Set([
    'KeyW','KeyA','KeyS','KeyD',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Space','Enter',
    'KeyQ','ShiftRight','ShiftLeft',     // back-pass keys
]);
// Numpad fallback — when NumLock is off some laptops fire Numpad codes for arrows.
// We map them onto the canonical Arrow* code so movement code only checks one name.
const KEY_ALIASES = {
    'Numpad8': 'ArrowUp',
    'Numpad2': 'ArrowDown',
    'Numpad4': 'ArrowLeft',
    'Numpad6': 'ArrowRight',
};
// e.key fallback for legacy / odd browsers that fail to populate e.code (rare,
// but seen on some virtual keyboards / Bluetooth dongles)
const KEY_FROM_EKEY = {
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    ' ': 'Space', 'Enter': 'Enter',
    'w': 'KeyW', 'W': 'KeyW',
    'a': 'KeyA', 'A': 'KeyA',
    's': 'KeyS', 'S': 'KeyS',
    'd': 'KeyD', 'D': 'KeyD',
    'q': 'KeyQ', 'Q': 'KeyQ',
};
function resolveKeyCode(e) {
    if (e.code && KEY_ALIASES[e.code]) return KEY_ALIASES[e.code];
    if (e.code && GAME_KEYS.has(e.code)) return e.code;
    if (e.key && KEY_FROM_EKEY[e.key]) return KEY_FROM_EKEY[e.key];
    if (e.key === 'Shift') return e.location === 2 ? 'ShiftRight' : 'ShiftLeft';
    return null;
}
function onKeyDown(e) {
    // gate by screen so name inputs / page navigation aren't hijacked
    if (STATE.screen !== 'playing') return;
    const code = resolveKeyCode(e);
    if (!code) return;
    keys[code] = true;
    if (!e.repeat) keysPressed[code] = true;
    e.preventDefault();
}
function onKeyUp(e) {
    // releases always fire — otherwise a key held when leaving the screen
    // would stay 'pressed' forever
    const code = resolveKeyCode(e);
    if (!code) return;
    keys[code] = false;
}
function clearAllKeys() {
    Object.keys(keys).forEach(k => keys[k] = false);
    Object.keys(keysPressed).forEach(k => keysPressed[k] = false);
}


// ----------- fixed-step game loop -----------
// Render runs at the display rate; game logic ticks at exactly 60 Hz so the
// game feels identical on a 60 Hz, 144 Hz or 240 Hz monitor.
const PHYSICS_HZ = 60;
const PHYSICS_STEP = 1 / PHYSICS_HZ;
let physicsAccum = 0;
let lastFrameTime = 0;

// The bot uses a *delayed, smoothed* version of the ball position for strategic
// decisions, so it can't react instantly to the user's input — eliminates the
// "the CPU mirrors me" feel.
const botPerception = { x: 0, z: 0, init: false };
function resetBotPerception() {
    botPerception.x = ball ? ball.position.x : 0;
    botPerception.z = ball ? ball.position.z : 0;
    botPerception.init = true;
}

function animate(now) {
    if (STATE.screen !== 'playing') return;
    animationId = requestAnimationFrame(animate);

    if (lastFrameTime === 0) lastFrameTime = now;
    let frameDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = PHYSICS_STEP;
    if (frameDt > 0.25) frameDt = 0.25;     // tab/sleep recovery cap

    if (!STATE.paused) {
        physicsAccum += frameDt;
        let safety = 5;
        while (physicsAccum >= PHYSICS_STEP && safety-- > 0) {
            physicsAccum -= PHYSICS_STEP;
            gameTick();
        }
        if (safety <= 0) physicsAccum = 0;       // dropped frames — don't spiral
    } else {
        physicsAccum = 0;                          // no catch-up on resume
    }

    updateChargeFx();
    updateTimer();
    renderer.render(scene, camera);
}

// Charge feedback: scale + brighten the controlled-player's underfoot ring,
// so the user can SEE how hard their shot will be.
function updateChargeFx() {
    [controlledP1, controlledP2].forEach(p => {
        if (!p) return;
        const ring = p.userData.ring;
        if (!ring) return;
        let t = 0;
        if (p.userData.charging) {
            const ms = performance.now() - (p.userData.chargeStart || performance.now());
            t = Math.min(1, Math.max(0, (ms - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS)));
        }
        const target = 1 + t * 0.55;
        const cur = ring.scale.x;
        ring.scale.setScalar(cur + (target - cur) * 0.35);
        ring.material.opacity = 0.7 + t * 0.3;
        // also a subtle pulse on the body's emissive when fully charged
        const body = p.children[0];
        if (body && body.material && body.material.emissiveIntensity !== undefined) {
            body.material.emissiveIntensity = 0.18 + t * 0.6;
        }
    });
}

function gameTick() {
    if (STATE.paused) return;
    if (!STATE.inputLocked && !STATE.scoring) {
        if (STATE.mode === 'cpu') {
            movePlayer(controlledP1, {
                up:    ['KeyW', 'ArrowUp'],
                down:  ['KeyS', 'ArrowDown'],
                left:  ['KeyA', 'ArrowLeft'],
                right: ['KeyD', 'ArrowRight'],
            });
            handleShoot(controlledP1, ['Space']);
            handleBackPass(controlledP1, ['KeyQ', 'ShiftLeft', 'ShiftRight']);
        } else {
            movePlayer(controlledP1, {
                up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
            });
            movePlayer(controlledP2, {
                up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
            });
            handleShoot(controlledP1, ['Space']);
            handleShoot(controlledP2, ['Enter']);
            handleBackPass(controlledP1, ['KeyQ']);
            handleBackPass(controlledP2, ['ShiftRight', 'ShiftLeft']);
        }
    }

    updateAI();
    separatePlayers();
    updateBall();

    // Update the bot's perception of the ball: smoothed lerp with ~150 ms lag.
    // Bot AI uses this for strategy, not the raw ball position.
    if (!botPerception.init) resetBotPerception();
    botPerception.x += (ball.position.x - botPerception.x) * 0.10;
    botPerception.z += (ball.position.z - botPerception.z) * 0.10;

    // consume edge-triggered presses so a held key only fires once
    for (const k in keysPressed) keysPressed[k] = false;
}

function pressedOnce(arr) { return arr.some(k => keysPressed[k]); }

// Push overlapping players apart so they can't lock into a single tile.
// Each pair finds the overlap and shoves them along the connecting axis.
function separatePlayers() {
    const all = [...team1Players, ...team2Players];
    const minDist = PLAYER_SIZE * 1.2;        // tighter contact — less wall-feeling
    const minDist2 = minDist * minDist;
    for (let i = 0; i < all.length; i++) {
        const a = all[i];
        for (let j = i + 1; j < all.length; j++) {
            const b = all[j];
            const dx = a.position.x - b.position.x;
            const dz = a.position.z - b.position.z;
            const d2 = dx*dx + dz*dz;
            if (d2 >= minDist2) continue;

            // exact overlap — nudge with a deterministic direction
            let nx, nz, d;
            if (d2 < 0.01) {
                nx = 1; nz = 0; d = 0;
            } else {
                d = Math.sqrt(d2);
                nx = dx / d; nz = dz / d;
            }
            const overlap = (minDist - d) * 0.5 + 0.02;
            // shove rules:
            //   keeper vs field player → only the field player moves
            //   human  vs bot          → bot does most of the dance (90/10)
            //   else                   → 50/50
            const aIsKeeper = a.userData && a.userData.isKeeper;
            const bIsKeeper = b.userData && b.userData.isKeeper;
            const aIsHuman = (a === controlledP1 || a === controlledP2);
            const bIsHuman = (b === controlledP1 || b === controlledP2);
            let aShove, bShove;
            if (aIsKeeper && !bIsKeeper)        { aShove = 0;    bShove = 1; }
            else if (bIsKeeper && !aIsKeeper)   { aShove = 1;    bShove = 0; }
            else if (aIsHuman && !bIsHuman)     { aShove = 0.1;  bShove = 0.9; }
            else if (bIsHuman && !aIsHuman)     { aShove = 0.9;  bShove = 0.1; }
            else                                { aShove = 0.5;  bShove = 0.5; }
            a.position.x += nx * overlap * (aShove * 2);
            a.position.z += nz * overlap * (aShove * 2);
            b.position.x -= nx * overlap * (bShove * 2);
            b.position.z -= nz * overlap * (bShove * 2);

            // clamp both to pitch bounds
            a.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, a.position.x));
            a.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, a.position.z));
            b.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, b.position.x));
            b.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, b.position.z));
        }
    }
}

function pressed(arr) { return arr.some(k => keys[k]); }

function movePlayer(player, k) {
    if (!player) return;

    // collect raw input direction
    let inX = 0, inZ = 0;
    if (pressed(k.up))    inZ -= 1;
    if (pressed(k.down))  inZ += 1;
    if (pressed(k.left))  inX -= 1;
    if (pressed(k.right)) inX += 1;

    const inLen = Math.hypot(inX, inZ);
    if (inLen === 0) return;

    // normalize so diagonal isn't 41% faster than cardinal
    const speed = 0.95;
    let mx = (inX / inLen) * speed;
    let mz = (inZ / inLen) * speed;

    // remember last movement direction so the shoot command can aim with it
    player.userData.aimX = inX / inLen;
    player.userData.aimZ = inZ / inLen;

    // Slide-along-defender: project velocity onto the contact tangent so the
    // player slips around opponents instead of jittering between canX / canZ.
    // The human keeps a small fraction of inward velocity so they can muscle
    // the bot back instead of feeling stuck against a wall.
    const all = [...team1Players, ...team2Players];
    const minDist = PLAYER_SIZE * 1.2;
    const minDist2 = minDist * minDist;
    // Only cancel inward velocity vs the keeper (hard wall — no walking through
    // him into the goal). Vs field players we let the human plough through at
    // full speed; separatePlayers shoves the bot aside afterwards. Result: the
    // arrows always translate to motion, no sticky / laggy feel during a press.
    for (const other of all) {
        if (other === player) continue;
        const otherIsKeeper = other.userData && other.userData.isKeeper;
        if (!otherIsKeeper) continue;
        const ndx = (player.position.x + mx) - other.position.x;
        const ndz = (player.position.z + mz) - other.position.z;
        const nd2 = ndx*ndx + ndz*ndz;
        if (nd2 >= minDist2) continue;
        const nd = Math.sqrt(nd2) || 0.001;
        const nx = ndx / nd;
        const nz = ndz / nd;
        const dot = mx * nx + mz * nz;
        if (dot < 0) {
            mx -= dot * nx;
            mz -= dot * nz;
        }
    }
    player.position.x += mx;
    player.position.z += mz;

    // pitch bounds
    player.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, player.position.x));
    player.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, player.position.z));
}

// charge-shot tuning
const CHARGE_MIN_MS = 0;        // any press counts — even a flick fires
const CHARGE_MAX_MS = 500;      // saturates fast — arcade feel
const POWER_MIN = 3.0;          // tap shot — controllable
const POWER_MAX = 4.8;          // full charge — strong without flying out the stadium

function handleShoot(player, key) {
    if (!player) return;

    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    // sticky-ball follow (independent of shoot input)
    const stickRange = PLAYER_SIZE/2 + BALL_SIZE + 1.4;
    if (dist < PLAYER_SIZE + BALL_SIZE + 2) {
        if (dist > stickRange) {
            ball.position.x = player.position.x + (dx / dist) * stickRange;
            ball.position.z = player.position.z + (dz / dist) * stickRange;
        }
        ball.velocity.x *= 0.25;
        ball.velocity.z *= 0.25;
        if (ball.velocity.y < 0) ball.velocity.y *= 0.4;
    }

    // charge mechanic: press starts a timer, release fires with scaled power
    const isHeld = pressed(key);
    const wasHeld = !!player.userData.shootHeld;

    if (isHeld && !wasHeld) {
        // just-pressed — only start charging if you're near the ball
        if (dist < PLAYER_SIZE + BALL_SIZE + 4) {
            player.userData.charging = true;
            player.userData.chargeStart = performance.now();
        }
    }

    if (!isHeld && wasHeld && player.userData.charging) {
        // released — fire
        const heldMs = performance.now() - (player.userData.chargeStart || 0);
        const clamped = Math.min(CHARGE_MAX_MS, Math.max(CHARGE_MIN_MS, heldMs));
        const t = (clamped - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS);
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * t;
        player.userData.charging = false;
        player.userData.chargeStart = 0;
        fireShot(player, power, t);
    }

    player.userData.shootHeld = isHeld;
}

function fireShot(player, power, charge01) {
    // refuse the kick if the ball has rolled out of reach during the charge
    const rdx = ball.position.x - player.position.x;
    const rdz = ball.position.z - player.position.z;
    const rdist = Math.sqrt(rdx*rdx + rdz*rdz);
    if (rdist > PLAYER_SIZE + BALL_SIZE + 5) return;

    const goalX = player.team === 1 ? FIELD_W/2 : -FIELD_W/2;

    // The shot is ALWAYS directed at the enemy goal — no more sideline kicks.
    // Lateral movement input picks WHICH part of the goal mouth you aim at.
    let aimZ = 0;                                       // default: dead centre
    const inputZ = player.userData.aimZ;
    if (inputZ !== undefined && Math.abs(inputZ) > 0.1) {
        const reach = GOAL_W * 0.48;                    // almost touching the post
        aimZ = Math.max(-reach, Math.min(reach, inputZ * reach));
    }

    const dx = goalX - ball.position.x;
    const dz = aimZ - ball.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;

    // arc: light taps have a tiny lift, full power is a flat laser. Both stay low.
    const arc = 0.28 - charge01 * 0.25;  // 0.28 → 0.03 across the range

    ball.velocity.x = nx * power;
    ball.velocity.z = nz * power;
    ball.velocity.y = arc;
    ball.position.x = player.position.x + nx * (PLAYER_SIZE + BALL_SIZE);
    ball.position.z = player.position.z + nz * (PLAYER_SIZE + BALL_SIZE);
    ball.position.y = BALL_SIZE + 0.3;
}

// One key serves two purposes:
//   * If your keeper is currently HOLDING the ball → he passes to you (ASK FOR BALL)
//   * Otherwise, if you're near the ball              → back-pass to your keeper
function handleBackPass(player, keyArr) {
    if (!player) return;
    if (!pressedOnce(keyArr)) return;

    const keeper = player.team === 1 ? team1Players[0] : team2Players[0];

    // ── CASE A: keeper has the ball — release it to me ──────────────────
    if (keeper && keeper.userData.holdingBall) {
        const px = player.position.x - keeper.position.x;
        const pz = player.position.z - keeper.position.z;
        const plen = Math.hypot(px, pz) || 1;
        const nx = px / plen;
        const nz = pz / plen;
        const power = 2.6;
        ball.velocity.x = nx * power;
        ball.velocity.z = nz * power;
        ball.velocity.y = 0.42;
        ball.position.x = keeper.position.x + nx * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
        ball.position.z = keeper.position.z + nz * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
        ball.position.y = BALL_SIZE + 0.3;
        keeper.userData.holdingBall = false;
        keeper.userData.holdStart = 0;
        return;
    }

    // ── CASE B: I have the ball — pass back to my keeper ───────────────
    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > PLAYER_SIZE + BALL_SIZE + 4) return;
    if (!keeper) return;

    const px = keeper.position.x - ball.position.x;
    const pz = keeper.position.z - ball.position.z;
    const plen = Math.hypot(px, pz) || 1;
    const nx = px / plen;
    const nz = pz / plen;

    const power = 2.6;
    ball.velocity.x = nx * power;
    ball.velocity.z = nz * power;
    ball.velocity.y = 0.32;
    ball.position.x = player.position.x + nx * (PLAYER_SIZE + BALL_SIZE);
    ball.position.z = player.position.z + nz * (PLAYER_SIZE + BALL_SIZE);
    ball.position.y = BALL_SIZE + 0.3;

    if (player.userData.charging) {
        player.userData.charging = false;
        player.userData.chargeStart = 0;
    }
}

// ----------- AI -----------
function updateAI() {
    [...team1Players, ...team2Players].forEach(p => {
        if (p === controlledP1 || p === controlledP2) return;
        if (p.userData.isKeeper) updateKeeper(p);
        else if (p.userData.isBot) updateBotFieldPlayer(p);
    });
}

function updateKeeper(k) {
    const isTeam1 = k.team === 1;
    const goalLineX = isTeam1 ? -FIELD_W/2 : FIELD_W/2;
    const homeX = goalLineX + (isTeam1 ? 4 : -4);    // 4 units in front of the goal line

    // ball is "threatening" only when it's actually in the keeper's defensive third
    const threatX = isTeam1 ? -FIELD_W * 0.20 : FIELD_W * 0.20;
    const ballThreatening = isTeam1 ? ball.position.x < threatX : ball.position.x > threatX;

    let targetX = homeX;
    let targetZ;

    if (!ballThreatening) {
        // ball is far away — keeper does NOT track. Drift back to the center of the goal.
        targetZ = 0;
    } else {
        // ball is in this keeper's third — light lateral tracking, beatable on the corners
        targetZ = ball.position.z * 0.40;

        // step out at most 2 units, only when the ball is right on top of the goal
        const dist = Math.abs(ball.position.x - goalLineX);
        const advance = Math.max(0, 2 - dist / 12);    // 0..2 units
        targetX = homeX + (isTeam1 ? advance : -advance);
    }

    targetZ = Math.max(-GOAL_W/2 + 1, Math.min(GOAL_W/2 - 1, targetZ));

    // sluggish lerp — keeper reacts slowly so a well-aimed shot can beat them
    k.position.x += (targetX - k.position.x) * 0.05;
    k.position.z += (targetZ - k.position.z) * 0.07;

    // hard clamp: keeper never leaves a small box around its goal
    const boxMinX = isTeam1 ? -FIELD_W/2 : FIELD_W/2 - 8;
    const boxMaxX = isTeam1 ? -FIELD_W/2 + 8 : FIELD_W/2;
    k.position.x = Math.max(boxMinX, Math.min(boxMaxX, k.position.x));
    k.position.z = Math.max(-GOAL_W/2 + 0.5, Math.min(GOAL_W/2 - 0.5, k.position.z));

    // catch → hold → release (only when pressured, or after a safety timeout)
    const dx = ball.position.x - k.position.x;
    const dz = ball.position.z - k.position.z;
    const d2 = dx*dx + dz*dz;
    // dual catch radius:
    //   * fast-moving ball (a shot) → wider, easier to grab
    //   * slow ball (sticky to a dribbling attacker) → much smaller — you can dribble in closer
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    const reach = ballSpeed > 0.8
        ? (PLAYER_SIZE/2 + BALL_SIZE) * 0.85
        : (PLAYER_SIZE/2 + BALL_SIZE) * 0.55;

    // begin holding the moment the ball touches the keeper
    if (d2 < reach * reach && !k.userData.holdingBall) {
        k.userData.holdingBall = true;
        k.userData.holdStart = performance.now();
    }

    if (k.userData.holdingBall) {
        // sticky to keeper — bal is in zijn handen
        ball.position.x = k.position.x;
        ball.position.z = k.position.z;
        ball.position.y = BALL_SIZE + 1.6;
        ball.velocity.x = 0;
        ball.velocity.y = 0;
        ball.velocity.z = 0;

        // pressure detection: nearest enemy field player
        const enemyField = isTeam1 ? team2Players[1] : team1Players[1];
        let enemyDist = Infinity;
        if (enemyField) {
            const eDx = enemyField.position.x - k.position.x;
            const eDz = enemyField.position.z - k.position.z;
            enemyDist = Math.hypot(eDx, eDz);
        }

        const heldMs = performance.now() - (k.userData.holdStart || performance.now());
        const minHold = 380;        // brief catch animation — never instant
        const maxHold = 2400;       // safety release so the game doesn't stall
        const pressureRange = 13;   // an enemy this close = panic-pass

        const pressured = enemyDist < pressureRange;
        const release = heldMs > minHold && (pressured || heldMs > maxHold);

        if (release) {
            const teammate = isTeam1 ? team1Players[1] : team2Players[1];
            if (teammate) {
                const px = teammate.position.x - k.position.x;
                const pz = teammate.position.z - k.position.z;
                const plen = Math.hypot(px, pz) || 1;
                const nx = px / plen;
                const nz = pz / plen;
                // pressured pass goes a bit harder/flatter than a calm release
                const power = pressured ? 2.5 : 2.0;
                const arc   = pressured ? 0.25 : 0.36;
                ball.velocity.x = nx * power;
                ball.velocity.z = nz * power;
                ball.velocity.y = arc;
                ball.position.x = k.position.x + nx * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
                ball.position.z = k.position.z + nz * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
                ball.position.y = BALL_SIZE + 0.3;
            } else {
                const dir = isTeam1 ? 1 : -1;
                ball.velocity.x = dir * 1.1;
                ball.velocity.z = (Math.random() - 0.5) * 0.5;
                ball.velocity.y = 0.35;
                ball.position.x = k.position.x + dir * (PLAYER_SIZE/2 + BALL_SIZE + 0.5);
            }
            k.userData.holdingBall = false;
            k.userData.holdStart = 0;
        }
    }
}

// CPU field player — chase / dribble / shoot / defend
function updateBotFieldPlayer(p) {
    if (STATE.inputLocked) return;

    const ownGoalX = p.team === 1 ? -FIELD_W/2 : FIELD_W/2;
    const enemyGoalX = -ownGoalX;
    const goalSign = p.team === 1 ? 1 : -1;

    // contact uses real ball pos (so dribble/tackle still works);
    // strategy uses lagged perception so the bot can't cheat-read your inputs.
    const realDX = ball.position.x - p.position.x;
    const realDZ = ball.position.z - p.position.z;
    const ballDist = Math.sqrt(realDX*realDX + realDZ*realDZ);

    const perX = botPerception.x;
    const perZ = botPerception.z;

    const owner = getBallOwner();
    const haveBall = owner === p;
    const teammateHasBall = owner && owner !== p && owner.team === p.team;
    const enemyHasBall = owner && owner.team !== p.team;

    let targetX, targetZ;

    if (haveBall) {
        // dribble toward enemy goal — use real ball pos because we're carrying it
        targetX = enemyGoalX;
        targetZ = ball.position.z * 0.6 + Math.sin(Date.now() * 0.003) * 8;
    } else if (teammateHasBall) {
        // hang around for a return ball — minimal lateral following
        targetX = (perX + enemyGoalX) / 2;
        targetZ = perZ * 0.25 - Math.sign(p.position.z || 1) * 8;
    } else if (enemyHasBall) {
        // PRESS the ball carrier when they're not yet in our defending third.
        // When they ARE in our third (ready to shoot), drop back to a deep line
        // with a side-bias so we're never exactly on the shooting line.
        const distFromOwnGoal = Math.abs(perX - ownGoalX);
        const inOurDefendingThird = distFromOwnGoal < FIELD_W * 0.30;     // ~33 units

        if (inOurDefendingThird) {
            // shooting range — keep a goal-side line, off the trajectory
            const sideBias = -Math.sign(perZ || 1) * 5;
            targetX = ownGoalX + 8 * goalSign;
            targetZ = perZ * 0.12 + sideBias;
        } else {
            // PRESS — close on the user, staying goal-side and a body-length
            // back so we don't constantly overlap (which would feel like glue
            // sticking to the user). Cap how far we'll chase past midfield.
            targetX = perX - 8 * goalSign;
            targetZ = perZ;
            const maxAdvance = FIELD_W * 0.10;
            const enemySide = -Math.sign(ownGoalX);
            if (Math.sign(targetX) === enemySide && Math.abs(targetX) > maxAdvance) {
                targetX = enemySide * maxAdvance;
            }
        }
    } else {
        // ball is loose — chase the perceived ball position
        targetX = perX;
        targetZ = perZ;
    }

    const tdx = targetX - p.position.x;
    const tdz = targetZ - p.position.z;
    const tdist = Math.sqrt(tdx*tdx + tdz*tdz);
    // press a bit faster than idle so closing the gap actually feels like pressure
    const baseSpeed = 0.74;
    const speed = enemyHasBall ? 0.88 : baseSpeed;
    if (tdist > 0.5) {
        // slide-along collision (same projection trick as the human player)
        let mx = (tdx / tdist) * speed;
        let mz = (tdz / tdist) * speed;
        const all = [...team1Players, ...team2Players];
        const minDist = PLAYER_SIZE * 1.2;
        const minDist2 = minDist * minDist;
        for (let pass = 0; pass < 2; pass++) {
            for (const o of all) {
                if (o === p) continue;
                const ndx = (p.position.x + mx) - o.position.x;
                const ndz = (p.position.z + mz) - o.position.z;
                const nd2 = ndx*ndx + ndz*ndz;
                if (nd2 >= minDist2) continue;
                const nd = Math.sqrt(nd2) || 0.001;
                const nx = ndx / nd;
                const nz = ndz / nd;
                const dot = mx * nx + mz * nz;
                if (dot < 0) {
                    mx -= dot * nx;
                    mz -= dot * nz;
                }
            }
        }
        p.position.x += mx;
        p.position.z += mz;
    }

    // pitch bounds
    p.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, p.position.x));
    p.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, p.position.z));

    // sticky-ball follow when CPU has it
    if (haveBall) {
        const sx = ball.position.x - p.position.x;
        const sz = ball.position.z - p.position.z;
        const sdist = Math.sqrt(sx*sx + sz*sz);
        const stickRange = PLAYER_SIZE/2 + BALL_SIZE + 1.4;
        if (sdist > stickRange) {
            ball.position.x = p.position.x + (sx / sdist) * stickRange;
            ball.position.z = p.position.z + (sz / sdist) * stickRange;
        }
        ball.velocity.x *= 0.3;
        ball.velocity.z *= 0.3;
    }

    // decide to shoot when in shooting range
    const shootRange = (p.team === 1 ? FIELD_W/2 - p.position.x : p.position.x + FIELD_W/2);
    if (haveBall && shootRange < 34 && Math.random() < 0.032) {
        const goalX = enemyGoalX;
        const keeper = (p.team === 1 ? team2Players[0] : team1Players[0]);
        // aim toward the open side of the keeper, plus a chunky human-ish miss spread
        const sidePref = keeper ? Math.sign(-keeper.position.z || 1) * (GOAL_W * 0.32) : 0;
        const miss = (Math.random() - 0.5) * 7;        // ±3.5 units of error
        const aimZ = sidePref + miss;
        const tx = goalX - ball.position.x;
        const tz = aimZ - ball.position.z;
        const len = Math.sqrt(tx*tx + tz*tz);
        if (len > 0) {
            const power = 2.2;
            ball.velocity.x = (tx / len) * power;
            ball.velocity.z = (tz / len) * power;
            ball.velocity.y = 0.38;        // flatter — your body can now block
            ball.position.x = p.position.x + (tx / len) * (PLAYER_SIZE + BALL_SIZE);
            ball.position.z = p.position.z + (tz / len) * (PLAYER_SIZE + BALL_SIZE);
            ball.position.y = BALL_SIZE + 0.3;
        }
    }

    // tackle: if enemy has ball and we're close, sometimes punt it away
    if (enemyHasBall && ballDist < PLAYER_SIZE + BALL_SIZE + 2 && Math.random() < 0.15) {
        const dir = p.team === 1 ? 1 : -1;
        ball.velocity.x = dir * 1.0;
        ball.velocity.z = (Math.random() - 0.5) * 0.7;
        // small horizontal nudge — don't launch the ball into the sky
        ball.velocity.y = ball.position.y > BALL_SIZE + 0.6 ? -0.1 : 0.18;
    }
}

// ball owner: closest player within reach, otherwise null
function getBallOwner() {
    let owner = null;
    let bestD2 = Infinity;
    [...team1Players, ...team2Players].forEach(p => {
        const dx = p.position.x - ball.position.x;
        const dz = p.position.z - ball.position.z;
        const d2 = dx*dx + dz*dz;
        if (d2 < bestD2 && d2 < (PLAYER_SIZE + BALL_SIZE + 1) ** 2) {
            bestD2 = d2;
            owner = p;
        }
    });
    return owner;
}

// ----------- ball physics -----------
function updateBall() {
    // freeze the ball during goal celebrations
    if (STATE.scoring) return;
    // any keeper holding the ball? skip all physics — bal zit in z'n handen
    if (team1Players[0] && team1Players[0].userData.holdingBall) return;
    if (team2Players[0] && team2Players[0].userData.holdingBall) return;

    // gravity (skip if sticky)
    const sticky = isSticky();
    if (!sticky) {
        ball.velocity.y -= 0.022;
        // mild air drag so a hard shot doesn't fly forever and ricochet around
        if (ball.position.y > BALL_SIZE + 0.05) {
            ball.velocity.x *= 0.996;
            ball.velocity.z *= 0.996;
        }
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
        ball.position.z += ball.velocity.z;
    }

    // ceiling
    if (ball.position.y > 9) {
        ball.position.y = 9;
        ball.velocity.y = Math.min(ball.velocity.y, 0);
    }

    // ground
    if (ball.position.y <= BALL_SIZE) {
        ball.position.y = BALL_SIZE;
        const hardLanding = ball.velocity.y < -0.08;
        // less bouncy — ball settles into a roll instead of pogo-sticking
        if (hardLanding) ball.velocity.y = Math.abs(ball.velocity.y) * 0.22;
        else ball.velocity.y = 0;
        // heavy friction on real impact (kills bouncing skips), light friction
        // on rolling so a flat shot keeps travelling toward the goal
        const fric = hardLanding ? 0.85 : 0.985;
        ball.velocity.x *= fric;
        ball.velocity.z *= fric;
        if (Math.abs(ball.velocity.x) < 0.012) ball.velocity.x = 0;
        if (Math.abs(ball.velocity.z) < 0.012) ball.velocity.z = 0;
    }

    // walls (except goal zones)
    if (Math.abs(ball.position.x) > FIELD_W/2) {
        if (Math.abs(ball.position.z) < GOAL_W/2 && ball.position.y < GOAL_H) {
            scoreGoal(ball.position.x > 0 ? 1 : 2);
            return;
        }
        ball.velocity.x *= -0.45;
        ball.position.x = Math.sign(ball.position.x) * FIELD_W/2;
    }
    if (Math.abs(ball.position.z) > FIELD_L/2) {
        ball.velocity.z *= -0.45;
        ball.position.z = Math.sign(ball.position.z) * FIELD_L/2;
    }

    // player collisions — skip the ball owner; only bounce on approach.
    // Lobs above PLAYER_SIZE * 1.5 fly over a player's head (defense can be jumped).
    const owner = getBallOwner();
    const ballOverHead = ball.position.y > PLAYER_SIZE * 1.5;
    [...team1Players, ...team2Players].forEach(p => {
        if (p === owner) return;
        if (ballOverHead) return;

        const dx = ball.position.x - p.position.x;
        const dz = ball.position.z - p.position.z;
        const d2 = dx*dx + dz*dz;
        const r = PLAYER_SIZE/2 + BALL_SIZE;
        if (d2 >= r*r) return;

        const d = Math.sqrt(d2) || 0.001;
        const overlap = r - d + 0.02;
        ball.position.x += (dx / d) * overlap;
        ball.position.z += (dz / d) * overlap;

        const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
        const airborne = ball.position.y > BALL_SIZE + 0.6;

        // TACKLE: if the ball is currently sticking to an enemy (low speed),
        // a collision with this defender is a clean tackle — strong push away
        const tackling = owner && owner.team !== p.team && ballSpeed < 0.35;
        if (tackling) {
            ball.velocity.x = (dx / d) * 1.1;
            ball.velocity.z = (dz / d) * 1.1;
            // airborne tackle = bring ball down; ground tackle = small bump
            ball.velocity.y = airborne ? -0.12 : 0.18;
            return;
        }

        // BLOCK: bounce only when moving toward this player
        const approaching = (ball.velocity.x * dx + ball.velocity.z * dz) < 0;
        if (approaching) {
            const bounce = Math.max(0.18, Math.min(0.7, ballSpeed * 0.55));
            ball.velocity.x = (dx / d) * bounce;
            ball.velocity.z = (dz / d) * bounce;
            // only pull DOWN floaty/slow airborne balls — fast shots keep their arc
            if (airborne && ballSpeed < 1.2) {
                ball.velocity.y = Math.min(ball.velocity.y, -0.15);
            }
        }
    });

    // Anti-float safety: if the ball is hovering high without horizontal
    // momentum (stuck mid-air after a chain of collisions), pull it down hard.
    const horiz = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (ball.position.y > BALL_SIZE + 1.5 && horiz < 0.15 && ball.velocity.y > -0.05) {
        ball.velocity.y -= 0.08;
    }

    // visual rotation
    ball.rotation.x += ball.velocity.z * 0.12;
    ball.rotation.z -= ball.velocity.x * 0.12;
}

function isSticky() {
    if (controlledP1 && near(ball, controlledP1)) return true;
    if (controlledP2 && near(ball, controlledP2)) return true;
    // CPU bot: only stick when it's the actual ball owner (not just adjacent)
    const owner = getBallOwner && getBallOwner();
    if (owner && owner.userData && owner.userData.isBot) return true;
    return false;
}
function near(a, b) {
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;
    return (dx*dx + dz*dz) < (PLAYER_SIZE/2 + BALL_SIZE + 0.6) ** 2;
}

function scoreGoal(scoringTeam) {
    if (STATE.scoring) return;       // already counted, ignore re-entry
    STATE.scoring = true;
    STATE.inputLocked = true;

    if (scoringTeam === 1) STATE.score1++;
    else STATE.score2++;

    $('hud-s1').textContent = STATE.score1;
    $('hud-s2').textContent = STATE.score2;

    // freeze the ball IMMEDIATELY at center so further physics can't re-trigger
    ball.position.set(0, BALL_SIZE, 0);
    ball.velocity.x = 0;
    ball.velocity.y = 0;
    ball.velocity.z = 0;

    // who scored
    const scorer = STATE.p1.team === scoringTeam ? STATE.p1 : STATE.p2;
    $('goal-flash-sub').textContent = scorer.name;

    const flash = $('goal-flash');
    flash.hidden = false;
    flash.style.animation = 'none';
    void flash.offsetWidth;
    flash.style.animation = '';

    setTimeout(() => { flash.hidden = true; }, 1700);

    STATE.kickoffTeam = scoringTeam === 1 ? 2 : 1;
    setTimeout(() => {
        positionForKickoff();
        // also wipe stuck keys so a held shoot button doesn't fire on resume
        Object.keys(keys).forEach(k => keys[k] = false);
        STATE.scoring = false;
        STATE.inputLocked = false;
    }, 1400);
}

function updateTimer() {
    if (STATE.paused) return;
    if (!STATE.gameStartTime) {
        $('hud-timer').textContent = formatTime(STATE.gameDuration);
        return;
    }
    const elapsed = Math.floor((Date.now() - STATE.gameStartTime) / 1000);
    const remaining = Math.max(0, STATE.gameDuration - elapsed);
    $('hud-timer').textContent = formatTime(remaining);
    $('hud-timer').classList.toggle('warning', remaining <= 10 && remaining > 0);
    if (remaining === 0 && STATE.screen === 'playing') {
        endGame();
    }
}
function formatTime(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2,'0')}`;
}

function endGame() {
    STATE.inputLocked = true;

    // populate over screen
    const redPlayer  = STATE.p1.team === 1 ? STATE.p1 : STATE.p2;
    const bluePlayer = STATE.p1.team === 2 ? STATE.p1 : STATE.p2;
    $('over-p1-name').textContent = redPlayer.name;
    $('over-p2-name').textContent = bluePlayer.name;
    $('over-s1').textContent = STATE.score1;
    $('over-s2').textContent = STATE.score2;

    let winner;
    if (STATE.score1 > STATE.score2) winner = `${redPlayer.name} WINT`;
    else if (STATE.score2 > STATE.score1) winner = `${bluePlayer.name} WINT`;
    else winner = '— GELIJKSPEL —';
    $('over-winner').textContent = winner;

    gotoScreen('over');
}

function teardownGame() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    STATE.gameStartTime = null;
    STATE.inputLocked = true;
    STATE.paused = false;
    pauseFreezeStart = 0;
    const overlay = $('pause-overlay');
    if (overlay) overlay.hidden = true;
    $('hud-s1').textContent = '0';
    $('hud-s2').textContent = '0';
    $('hud-timer').textContent = formatTime(STATE.gameDuration);
    $('hud-timer').classList.remove('warning');
}
