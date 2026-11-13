// =====================================================
// PITCH ROYALE — Stadium Nightfall
// Feature + gameplay logic
// =====================================================


function initThree() {
    if (!scene) {
        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(CAM.fov, window.innerWidth / window.innerHeight, 1, 2000);

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
        // Per-material clipping planes: dressStadium() cuts the pitch column
        // and the camera side out of every imported model.
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
    buildBoards();
    buildStadium();        // imports the .glb of the selected stadium as scenery
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

// ----------- camera -----------
// One broadcast camera for every stadium: on the long side, low enough to
// keep the far stand in frame, tracking the ball sideways like a TV main camera.
const CAM = { height: 30, back: 78, lookZ: 0, fov: 38, follow: 0.55, maxX: 24 };
let camX = 0;

function cameraTargetX() {
    if (!ball) return 0;
    return Math.max(-CAM.maxX, Math.min(CAM.maxX, ball.position.x * CAM.follow));
}
function placeCamera() {
    camera.position.set(camX, CAM.height, CAM.back);
    camera.lookAt(camX, 0, CAM.lookZ);
}
function applyGameplayCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    // widen the lens on narrow windows so both touchlines stay in frame
    camera.fov = aspect >= 1.6 ? CAM.fov : Math.min(62, CAM.fov * 1.6 / aspect);
    camera.updateProjectionMatrix();
    camX = cameraTargetX();
    placeCamera();
}
function updateCamera(dt) {
    camX += (cameraTargetX() - camX) * Math.min(1, dt * 3);
    placeCamera();
}

// sRGB hex -> the linear colour the renderer expects (it re-encodes to sRGB
// on output; without this every flat colour comes out washed and pastel)
function srgb(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
}
function litMat(hex) {
    return new THREE.MeshLambertMaterial({ color: srgb(hex) });
}

function buildSky() {
    const skyGeo = new THREE.SphereGeometry(900, 24, 12);
    const skyMat = new THREE.MeshBasicMaterial({ color: srgb(0x0b1220), side: THREE.BackSide, fog: false });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function buildLights() {
    // even floodlight wash: bright from above, soft green bounce from the grass
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4c7a4c, 0.52));
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const key = new THREE.DirectionalLight(0xfff6e6, 0.42);
    key.position.set(-40, 120, 60);
    scene.add(key);
}

// ----------- pitch -----------
// A drawn pitch at the gameplay dimensions. It is the stand-in for stadiums
// without a usable pitch of their own; otherwise the match is played on the
// model's grass and this one is hidden (see buildStadium).
const PITCH_MARGIN = 10;          // grass apron outside the lines
const PEN_DEPTH = 18, PEN_WIDTH = 46;
const BOX_DEPTH = 7,  BOX_WIDTH = 30;
const PEN_SPOT = 13,  CIRCLE_R = 10;

function makePitchTexture() {
    const PX = 16;                                  // pixels per world unit
    const w = (FIELD_W + PITCH_MARGIN * 2) * PX;
    const h = (FIELD_L + PITCH_MARGIN * 2) * PX;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // mowing stripes across the length of the pitch, apron included
    const bands = 14;
    const bandW = FIELD_W / bands * PX;
    ctx.fillStyle = '#4c9440';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#43853a';
    for (let i = -2; i < bands + 2; i += 2) {
        ctx.fillRect(PITCH_MARGIN * PX + i * bandW, 0, bandW, h);
    }

    // fine grain so the grass isn't a flat fill
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 16;
        d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.6;
    }
    ctx.putImageData(img, 0, 0);

    // markings, in world units with the origin on the centre spot
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(PX, PX);
    ctx.strokeStyle = '#f4f6f2';
    ctx.fillStyle = '#f4f6f2';
    ctx.lineWidth = 0.42;
    const W2 = FIELD_W / 2, L2 = FIELD_L / 2;

    ctx.strokeRect(-W2, -L2, FIELD_W, FIELD_L);
    ctx.beginPath(); ctx.moveTo(0, -L2); ctx.lineTo(0, L2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, CIRCLE_R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, Math.PI * 2); ctx.fill();

    [-1, 1].forEach(side => {
        const gx = side * W2;                       // goal line
        ctx.strokeRect(Math.min(gx, gx - side * PEN_DEPTH), -PEN_WIDTH / 2, PEN_DEPTH, PEN_WIDTH);
        ctx.strokeRect(Math.min(gx, gx - side * BOX_DEPTH), -BOX_WIDTH / 2, BOX_DEPTH, BOX_WIDTH);
        const sx = gx - side * PEN_SPOT;
        ctx.beginPath(); ctx.arc(sx, 0, 0.5, 0, Math.PI * 2); ctx.fill();
        // the "D": only the part of the circle outside the penalty area
        const a = Math.acos((PEN_DEPTH - PEN_SPOT) / CIRCLE_R);
        ctx.beginPath();
        if (side < 0) ctx.arc(sx, 0, CIRCLE_R, -a, a);
        else          ctx.arc(sx, 0, CIRCLE_R, Math.PI - a, Math.PI + a);
        ctx.stroke();
    });
    // corner arcs
    [[-W2, -L2, 0], [W2, -L2, Math.PI / 2], [W2, L2, Math.PI], [-W2, L2, -Math.PI / 2]].forEach(([x, y, start]) => {
        ctx.beginPath(); ctx.arc(x, y, 1.6, start, start + Math.PI / 2); ctx.stroke();
    });
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

function buildField() {
    const pitch = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD_W + PITCH_MARGIN * 2, FIELD_L + PITCH_MARGIN * 2),
        new THREE.MeshLambertMaterial({ map: makePitchTexture() })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.name = 'own-pitch';                 // hidden when the stadium brings its own
    scene.add(pitch);

    // plain grass just under the stadium's pitch: scans have cracks and holes
    const under = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD_W + PITCH_MARGIN * 2, FIELD_L + PITCH_MARGIN * 2),
        new THREE.MeshLambertMaterial({ color: srgb(0x3a6a2c) })
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.12;
    scene.add(under);

    // plain turf far beyond the stadium so gaps in a model never show a void
    const outer = new THREE.Mesh(
        new THREE.PlaneGeometry(3000, 3000),
        new THREE.MeshLambertMaterial({ color: srgb(0x1c2a1f) })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -1.2;
    scene.add(outer);
}

// ----------- goals -----------
const GOAL_DEPTH = 4.5;

function makeNetTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function buildGoals() {
    const postMat = litMat(0xffffff);
    const baseNet = makeNetTexture();
    const netPanel = (wUnits, hUnits) => {
        const tex = baseNet.clone();
        tex.needsUpdate = true;
        tex.repeat.set(wUnits / 0.9, hUnits / 0.9);   // one mesh square ≈ 0.9 units
        return new THREE.Mesh(
            new THREE.PlaneGeometry(wUnits, hUnits),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
        );
    };
    const R = 0.24;

    [-1, 1].forEach(side => {
        const x = side * FIELD_W / 2;
        const back = x + side * GOAL_DEPTH;

        [-1, 1].forEach(zs => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GOAL_H, 12), postMat);
            post.position.set(x, GOAL_H / 2, zs * GOAL_W / 2);
            scene.add(post);
        });
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GOAL_W + R * 2, 12), postMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(x, GOAL_H, 0);
        scene.add(bar);

        const rear = netPanel(GOAL_W, GOAL_H);
        rear.rotation.y = Math.PI / 2;
        rear.position.set(back, GOAL_H / 2, 0);
        scene.add(rear);

        const roof = netPanel(GOAL_DEPTH, GOAL_W);
        roof.rotation.x = -Math.PI / 2;
        roof.rotation.z = Math.PI / 2;
        roof.position.set(x + side * GOAL_DEPTH / 2, GOAL_H, 0);
        scene.add(roof);

        [-1, 1].forEach(zs => {
            const flank = netPanel(GOAL_DEPTH, GOAL_H);
            flank.position.set(x + side * GOAL_DEPTH / 2, GOAL_H / 2, zs * GOAL_W / 2);
            scene.add(flank);
        });
    });
}

// ----------- advertising boards -----------
// Far touchline and behind both goals; the camera side stays open.
function makeBoardTexture(lines) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 64;
    const ctx = c.getContext('2d');
    const panelW = c.width / lines.length;
    lines.forEach((text, i) => {
        const dark = i % 2 === 0;
        ctx.fillStyle = dark ? '#121512' : '#ffffff';
        ctx.fillRect(i * panelW, 0, panelW, 64);
        ctx.fillStyle = dark ? '#ffffff' : '#121512';
        ctx.font = '800 44px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text.toUpperCase(), i * panelW + panelW / 2, 35, panelW - 40);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

function buildBoards() {
    const stadium = getSelectedStadium();
    const base = makeBoardTexture(['Pitch Royale', stadium.name]);
    const H = 1.9, T = 0.5;
    const blank = new THREE.MeshLambertMaterial({ color: srgb(0x1a1d1a) });
    const board = (length) => {
        const tex = base.clone();
        tex.needsUpdate = true;
        tex.repeat.x = Math.max(1, Math.round(length / 34));
        const face = new THREE.MeshBasicMaterial({ map: tex });
        // BoxGeometry faces: +x, -x, +y, -y, +z, -z — only +z carries the print
        return new THREE.Mesh(new THREE.BoxGeometry(length, H, T), [blank, blank, blank, blank, face, blank]);
    };

    const far = board(FIELD_W + 16);
    far.position.set(0, H / 2, -(FIELD_L / 2 + 4.5));
    scene.add(far);

    [-1, 1].forEach(side => {
        const end = board(FIELD_L + 12);
        end.rotation.y = -side * Math.PI / 2;        // printed face towards the pitch
        end.position.set(side * (FIELD_W / 2 + GOAL_DEPTH + 3.5), H / 2, 0);
        scene.add(end);
    });
}

// ----------- players -----------
const KIT = {
    1: { shirt: COLORS.team1, shorts: 0xffffff, socks: COLORS.team1, keeper: 0xf2c230 },
    2: { shirt: COLORS.team2, shorts: 0x10214f, socks: COLORS.team2, keeper: 0x2fb463 },
};
const SKIN_TONES = [0xe2c39a, 0xc68e5e, 0x8a5a3b, 0xf0d2b0];
const HAIR_TONES = [0x1c1612, 0x4a2f1b, 0x111111, 0xb08a4a];

// A small footballer built from primitives: boots, socks, legs, shorts,
// shirt with sleeves, arms, head and hair. Legs and arms hang from pivots
// so animatePlayers() can swing them. The figure faces local +z.
function makePlayer(team, isKeeper, controlled, look) {
    const kit = KIT[team];
    const shirtHex = isKeeper ? kit.keeper : kit.shirt;
    const shirt  = litMat(shirtHex);
    const shorts = litMat(isKeeper ? 0x161616 : kit.shorts);
    const socks  = litMat(isKeeper ? shirtHex : kit.socks);
    const skin   = litMat(SKIN_TONES[look % SKIN_TONES.length]);
    const hair   = litMat(HAIR_TONES[look % HAIR_TONES.length]);
    const boot   = litMat(0x141414);

    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);

    const cyl = (rTop, rBot, len, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 12), mat);

    const HIP = 2.75;
    const makeLeg = (x) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, HIP, 0);
        const thigh = cyl(0.36, 0.28, 1.5, skin);  thigh.position.y = -0.75;
        const sock  = cyl(0.3, 0.26, 1.1, socks);  sock.position.y = -1.95;
        const shoe  = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 1.05), boot);
        shoe.position.set(0, -2.57, 0.22);
        pivot.add(thigh, sock, shoe);
        body.add(pivot);
        return pivot;
    };
    const legL = makeLeg(-0.42);
    const legR = makeLeg(0.42);

    const pants = cyl(0.8, 0.86, 1.0, shorts);
    pants.position.y = HIP + 0.05;
    pants.scale.z = 0.7;
    body.add(pants);

    const torso = cyl(0.98, 0.78, 2.0, shirt);
    torso.position.y = HIP + 1.5;
    torso.scale.z = 0.62;
    body.add(torso);

    const SHOULDER = HIP + 2.3;
    const makeArm = (x) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, SHOULDER, 0);
        const sleeve  = cyl(0.3, 0.27, 0.9, shirt);  sleeve.position.y = -0.4;
        const forearm = cyl(0.22, 0.19, 1.25, skin); forearm.position.y = -1.4;
        const hand = new THREE.Mesh(new THREE.SphereGeometry(isKeeper ? 0.34 : 0.22, 10, 8), isKeeper ? litMat(0xffffff) : skin);
        hand.position.y = -2.1;
        pivot.add(sleeve, forearm, hand);
        pivot.rotation.z = x < 0 ? -0.12 : 0.12;
        body.add(pivot);
        return pivot;
    };
    const armL = makeArm(-1.12);
    const armR = makeArm(1.12);

    const neck = cyl(0.26, 0.3, 0.4, skin);
    neck.position.y = SHOULDER + 0.35;
    body.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), skin);
    head.position.y = SHOULDER + 1.0;
    body.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.66, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.set(0, SHOULDER + 1.04, -0.06);
    body.add(cap);

    // soft contact shadow; real shadow maps are off (see initThree)
    const shadowBlob = new THREE.Mesh(
        new THREE.CircleGeometry(2.0, 24),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    );
    shadowBlob.rotation.x = -Math.PI / 2;
    shadowBlob.position.y = 0.05;
    group.add(shadowBlob);

    // ring under the player you control; it grows while a shot is charging
    if (controlled) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(2.4, 2.9, 40),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        group.userData.ring = ring;
        group.add(ring);
    }

    body.scale.setScalar(1.25);      // a little larger than life so they read from the stand
    group.userData.isKeeper = isKeeper;
    group.userData.rig = { body, legL, legR, armL, armR };
    group.userData.stride = 0;
    body.rotation.y = team === 1 ? Math.PI / 2 : -Math.PI / 2;   // face the opponent's goal
    return group;
}

function buildPlayers() {
    team1Players = [];
    team2Players = [];

    // Hot-Seat (duo): both veldspelers are human (P1 + P2)
    // CPU mode:       only P1 is human, the other team's veldspeler is the bot
    const isCpu = STATE.mode === 'cpu';
    const add = (team, isKeeper, human, x, look) => {
        const p = makePlayer(team, isKeeper, human, look);
        p.position.set(x, 0, 0);
        p.team = team;
        p.isKeeper = isKeeper;
        p.homePosition = { x, z: 0 };
        if (!isKeeper) p.userData.isBot = !human;
        scene.add(p);
        (team === 1 ? team1Players : team2Players).push(p);
        return p;
    };

    const redIsHuman  = isCpu ? STATE.p1.team === 1 : true;
    const blueIsHuman = isCpu ? STATE.p1.team === 2 : true;

    add(1, true, false, -FIELD_W / 2 + 5, 0);
    const redField = add(1, false, redIsHuman, -25, 1);
    add(2, true, false, FIELD_W / 2 - 5, 2);
    const blueField = add(2, false, blueIsHuman, 25, 3);
    // every side gets a computer teammate: [keeper, main player, teammate]
    add(1, false, false, -22, 2);
    add(2, false, false, 22, 0);

    controlledP1 = STATE.p1.team === 1 ? redField : blueField;
    controlledP2 = isCpu ? null : (STATE.p2.team === 1 ? redField : blueField);
    [controlledP1, controlledP2].forEach(p => p && addStaminaBar(p));
}

// ----------- sprint and stamina -----------
// Sprinting is 35% faster and empties the stamina bar in about three seconds;
// it refills in five. Run it dry and you have to wait for a quarter of it.
const SPRINT_MULT   = 1.35;
const STAMINA_DRAIN = 1 / (3.2 * 60);
const STAMINA_REGEN = 1 / (5 * 60);
const STAMINA_MIN   = 0.25;

// Returns whether p sprints this tick, and spends or refills his stamina.
function sprintFor(p, wanted) {
    const u = p.userData;
    if (u.stamina === undefined) u.stamina = 1;
    if (u.tired && u.stamina >= STAMINA_MIN) u.tired = false;
    const on = !!wanted && !u.tired && u.stamina > 0;
    if (on) {
        u.stamina = Math.max(0, u.stamina - STAMINA_DRAIN);
        if (u.stamina === 0) u.tired = true;
    } else {
        u.stamina = Math.min(1, u.stamina + STAMINA_REGEN);
    }
    u.sprinting = on;
    return on;
}

// A small bar over the head of each human player; shown while it isn't full.
function addStaminaBar(p) {
    const flat = (hex, opacity) => new THREE.MeshBasicMaterial({
        // both transparent, so renderOrder puts the fill over the background
        color: srgb(hex), transparent: true, opacity, depthTest: false, depthWrite: false,
    });
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.95), flat(0x121512, 0.85));
    const fgGeo = new THREE.PlaneGeometry(5.0, 0.5);
    fgGeo.translate(2.5, 0, 0);                       // grows from its left end
    const fg = new THREE.Mesh(fgGeo, flat(0xffd60a, 1));
    fg.position.set(-2.5, 0, 0.01);
    bg.renderOrder = 20;
    fg.renderOrder = 21;
    bar.add(bg, fg);
    bar.position.y = 9.3;
    bar.visible = false;
    p.add(bar);
    p.userData.staminaBar = { bar, fg };
}
const STAMINA_COLOR = srgb(0xffd60a);
const TIRED_COLOR   = srgb(0xd91e36);

function updateStaminaBars() {
    [controlledP1, controlledP2].forEach(p => {
        const sb = p && p.userData.staminaBar;
        if (!sb) return;
        const st = p.userData.stamina ?? 1;
        sb.bar.visible = st < 0.995;
        sb.fg.scale.x = Math.max(0.001, st);
        sb.fg.material.color.copy(p.userData.tired ? TIRED_COLOR : STAMINA_COLOR);
        sb.bar.quaternion.copy(camera.quaternion);   // always face the camera
    });
    // the Sprint button on phones shows the same stamina as a ring
    const btn = typeof IS_TOUCH !== 'undefined' && IS_TOUCH ? $('touch-sprint') : null;
    if (btn && controlledP1) {
        btn.style.setProperty('--stamina', (controlledP1.userData.stamina ?? 1).toFixed(3));
        btn.classList.toggle('is-tired', !!controlledP1.userData.tired);
    }
}

// Turn each figure towards where it is running and swing its limbs.
// Purely cosmetic: reads positions, never writes them.
function animatePlayers(dt) {
    if (dt <= 0) return;
    [...team1Players, ...team2Players].forEach(p => {
        const u = p.userData;
        const rig = u.rig;
        if (!rig) return;
        const dx = p.position.x - (u.lastX ?? p.position.x);
        const dz = p.position.z - (u.lastZ ?? p.position.z);
        u.lastX = p.position.x;
        u.lastZ = p.position.z;
        const speed = Math.min(80, Math.hypot(dx, dz) / dt);     // units per second

        // heading: direction of travel, or towards the ball when standing
        let target = null;
        // keepers shuffle sideways facing the ball; outfield players face where they run
        if (speed > 4 && !u.isKeeper) target = Math.atan2(dx, dz);
        else if (ball) target = Math.atan2(ball.position.x - p.position.x, ball.position.z - p.position.z);
        if (target !== null) {
            let diff = target - rig.body.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // shortest way round
            rig.body.rotation.y += diff * Math.min(1, dt * (speed > 4 ? 14 : 5));
        }

        // stride: ease in and out so stopping doesn't snap the legs straight
        const want = Math.min(1, speed / 35);
        u.stride += (want - u.stride) * Math.min(1, dt * 10);
        u.phase = (u.phase || 0) + dt * (6 + speed * 0.22);
        const swing = Math.sin(u.phase) * 0.95 * u.stride;
        rig.legL.rotation.x = swing;
        rig.legR.rotation.x = -swing;
        rig.armL.rotation.x = -swing * 0.8;
        rig.armR.rotation.x = swing * 0.8;
        rig.body.position.y = Math.abs(Math.cos(u.phase)) * 0.12 * u.stride;
        rig.body.rotation.x = 0.16 * u.stride;                    // lean into the run

        // a kick: the right leg swings back, then through the ball
        if (u.kickT > 0) {
            u.kickT = Math.max(0, u.kickT - dt);
            const k = 1 - u.kickT / 0.28;                         // 0 → 1
            rig.legR.rotation.x = k < 0.35 ? (k / 0.35) * 0.9 : 0.9 - (k - 0.35) / 0.65 * 2.1;
            rig.armL.rotation.x = -0.6 * Math.sin(k * Math.PI);
        }

        // a keeper's dive: the whole body tips over towards the ball and drops
        rig.body.rotation.order = 'YXZ';
        let rollWant = 0;
        if (u.diveT > 0) {
            u.diveT = Math.max(0, u.diveT - dt);
            const yaw = rig.body.rotation.y;
            const side = Math.sign(-Math.cos(yaw) * (u.diveX || 0) + Math.sin(yaw) * (u.diveZ || 0)) || 1;
            rollWant = side * 1.3 * Math.min(1, u.diveT / 0.18);
            rig.armL.rotation.x = rig.armR.rotation.x = -2.6;     // both arms up and out
        }
        // quick to go down, slower to get back up
        u.roll = (u.roll || 0) + (rollWant - (u.roll || 0)) * Math.min(1, dt * (rollWant ? 18 : 7));
        rig.body.rotation.z = u.roll;
        rig.body.position.y -= Math.abs(u.roll) * 0.9;
    });
}

// ----------- ball -----------
const BALL_VISUAL_R = 0.78;      // drawn smaller than the physics radius (BALL_SIZE)

function makeBallTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#1a1a1a';
    // staggered dark patches so you can see the ball roll
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
            const x = (col + (row % 2 ? 0.5 : 0)) * (256 / 6);
            const y = 24 + row * 40;
            ctx.beginPath();
            ctx.ellipse(x, y, 12, 11, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function buildBall() {
    // `ball` carries position + velocity for the physics; the visible sphere
    // sits lower inside it so it rests on the grass instead of hovering.
    ball = new THREE.Group();
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_VISUAL_R, 24, 16),
        new THREE.MeshLambertMaterial({ map: makeBallTexture() })
    );
    mesh.position.y = BALL_VISUAL_R - BALL_SIZE;
    ball.add(mesh);
    ball.userData.mesh = mesh;

    const blob = new THREE.Mesh(
        new THREE.CircleGeometry(BALL_VISUAL_R * 1.05, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    ball.userData.shadow = blob;
    scene.add(blob);

    ball.position.set(0, BALL_SIZE, 0);
    ball.velocity = { x: 0, y: 0, z: 0 };
    scene.add(ball);
}

// keep the ball's ground shadow under it; it shrinks as the ball rises
function updateBallShadow() {
    const blob = ball && ball.userData.shadow;
    if (!blob) return;
    const lift = Math.max(0, ball.position.y - BALL_SIZE);
    blob.position.set(ball.position.x, 0.06, ball.position.z);
    blob.scale.setScalar(Math.max(0.45, 1 - lift * 0.07));
    blob.material.opacity = Math.max(0.1, 0.3 - lift * 0.02);
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
        p.userData.vx = 0;
        p.userData.vz = 0;
        p.userData.cooldown = 0;
        p.userData.diveT = 0;
        p.userData.react = 0;
        p.userData.aimX = p.team === 1 ? 1 : -1;      // facing the other goal
        p.userData.aimZ = 0;
        p.userData.stamina = 1;
        p.userData.tired = false;
        p.userData.sprinting = false;
    });
    carrier = null;
    passTarget = null;
    curl = null;
    lastKick = null;

    // home positions
    team1Players[0].position.set(-FIELD_W/2 + 5, 0, 0);   // red keeper
    team2Players[0].position.set( FIELD_W/2 - 5, 0, 0);   // blue keeper

    // the side kicking off stands at the ball; the teammates start wide
    if (STATE.kickoffTeam === 1) {
        team1Players[1].position.set(-3, 0, 0);
        team2Players[1].position.set( 18, 0, 0);
        team1Players[2]?.position.set(-16, 0, 14);
        team2Players[2]?.position.set( 22, 0, -14);
    } else {
        team1Players[1].position.set(-18, 0, 0);
        team2Players[1].position.set( 3, 0, 0);
        team1Players[2]?.position.set(-22, 0, 14);
        team2Players[2]?.position.set( 16, 0, -14);
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
    'KeyQ','ShiftRight','ShiftLeft',     // pass (Q, right Shift) and sprint (left Shift)
    'AltRight','Slash',                  // player 2 sprints with right Alt/Option or /
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

    if (!STATE.paused) animatePlayers(frameDt);
    updateBallShadow();
    updateCamera(frameDt);
    updateChargeFx();
    updateStaminaBars();
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
                sprint: ['ShiftLeft', 'ShiftRight'],
            });
            handleShoot(controlledP1, ['Space']);
            handlePass(controlledP1, ['KeyQ']);
        } else {
            movePlayer(controlledP1, {
                up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'],
            });
            movePlayer(controlledP2, {
                up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
                sprint: ['AltRight', 'Slash'],
            });
            handleShoot(controlledP1, ['Space']);
            handleShoot(controlledP2, ['Enter']);
            handlePass(controlledP1, ['KeyQ']);
            handlePass(controlledP2, ['ShiftRight']);
        }
    }

    updateAI();
    separatePlayers();
    updateCarry();
    applyCurl();
    updateBall();

    // Update the bot's perception of the ball: smoothed lerp with ~150 ms lag.
    // Bot AI uses this for strategy, not the raw ball position.
    if (!botPerception.init) resetBotPerception();
    const read = aiLevel().read;
    botPerception.x += (ball.position.x - botPerception.x) * read;
    botPerception.z += (ball.position.z - botPerception.z) * read;

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

// ----------- movement -----------
// Everything below is in world units per physics tick (60 per second).
// Players have a velocity that eases towards where the stick points, so they
// start, turn and stop like footballers instead of teleporting a step a frame.
const RUN_SPEED     = 0.50;   // ~30 units/s: the pitch (110) in under four seconds
const DRIBBLE_SPEED = 0.43;   // a touch slower with the ball at your feet
const RUN_ACCEL     = 0.065;  // full speed in about a sixth of a second
const RUN_BRAKE     = 0.09;

// Ease a player's velocity towards (wantX, wantZ), at most `rate` per tick.
function steer(p, wantX, wantZ, rate) {
    const u = p.userData;
    u.vx = u.vx || 0;
    u.vz = u.vz || 0;
    const dx = wantX - u.vx, dz = wantZ - u.vz;
    const d = Math.hypot(dx, dz);
    if (d <= rate) { u.vx = wantX; u.vz = wantZ; }
    else { u.vx += dx / d * rate; u.vz += dz / d * rate; }
}

function movePlayer(player, k) {
    if (!player) return;

    // collect raw input direction
    let inX = 0, inZ = 0;
    if (pressed(k.up))    inZ -= 1;
    if (pressed(k.down))  inZ += 1;
    if (pressed(k.left))  inX -= 1;
    if (pressed(k.right)) inX += 1;

    // the on-screen stick (phones) is analogue: a small push walks, a full one runs
    let analog = 1;
    if (player === controlledP1 && typeof touchMove !== 'undefined' && touchMove.active) {
        inX = touchMove.x;
        inZ = touchMove.z;
        analog = Math.min(1, Math.max(0.4, (Math.hypot(inX, inZ) - 0.18) / 0.55));
    }

    const inLen = Math.hypot(inX, inZ);
    // up/down as it is held right now, for curling a shot after it is hit
    player.userData.inZ = Math.abs(inZ) > 0.35 ? Math.sign(inZ) : 0;
    let top = (carrier === player ? DRIBBLE_SPEED : RUN_SPEED) * analog;
    if (sprintFor(player, pressed(k.sprint || []) && inLen > 0)) top *= SPRINT_MULT;
    if (player.userData.charging && carrier === player) top *= 0.6;   // set yourself for the shot
    if (inLen > 0) {
        // remember the direction faced, for dribbling and aiming
        player.userData.aimX = inX / inLen;
        player.userData.aimZ = inZ / inLen;
        steer(player, inX / inLen * top, inZ / inLen * top, RUN_ACCEL);
    } else {
        steer(player, 0, 0, RUN_BRAKE);
    }
    let mx = player.userData.vx;
    let mz = player.userData.vz;
    if (mx === 0 && mz === 0) return;

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
    // the wall check above may have taken some speed off
    player.userData.vx = mx;
    player.userData.vz = mz;
    player.position.x += mx;
    player.position.z += mz;

    // pitch bounds
    player.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, player.position.x));
    player.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, player.position.z));
}

// ----------- the ball at your feet -----------
// One field player at a time carries the ball. It rolls just in front of him,
// in the direction he faces, and keeps its speed when he passes or shoots.
let carrier = null;
const CARRY_REACH = PLAYER_SIZE / 2 + BALL_SIZE + 1.1;   // how close you must get to take it
const CARRY_DIST  = PLAYER_SIZE / 2 + BALL_SIZE + 0.45;  // where it sits in front of you
const STEAL_REACH = PLAYER_SIZE / 2 + BALL_SIZE + 0.5;   // a challenger this close takes it

function facingOf(p) {
    const u = p.userData;
    if (u.aimX !== undefined && (u.aimX || u.aimZ)) return { x: u.aimX, z: u.aimZ };
    return { x: p.team === 1 ? 1 : -1, z: 0 };
}
function ballDistTo(p) {
    return Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z);
}
function knockBall(dirX, dirZ, power, lift) {
    ball.velocity.x = dirX * power;
    ball.velocity.z = dirZ * power;
    ball.velocity.y = lift;
}

function updateCarry() {
    const field = [...team1Players, ...team2Players].filter(p => !p.userData.isKeeper);
    if (passTarget && --passTarget.t <= 0) passTarget = null;
    field.forEach(p => {
        if (p.userData.cooldown > 0) p.userData.cooldown--;
        if (p.userData.shield > 0) p.userData.shield--;
    });

    const keeperHolds = team1Players[0]?.userData.holdingBall || team2Players[0]?.userData.holdingBall;
    if (keeperHolds || STATE.scoring) { carrier = null; return; }

    const low = ball.position.y < BALL_SIZE + 1.4;
    const free = (p) => !(p.userData.cooldown > 0);

    // a challenger from the other side who keeps his foot in takes it: on
    // average after about a fifth of a second of contact, and never straight
    // back from someone who has only just won it
    if (carrier && !(carrier.userData.shield > 0)) {
        for (const rival of field) {
            if (rival.team === carrier.team || !free(rival) || ballDistTo(rival) >= STEAL_REACH) continue;
            const human = rival === controlledP1 || rival === controlledP2;
            if (Math.random() < (human ? 0.09 : aiLevel().steal)) {
                carrier.userData.cooldown = 36;
                carrier = rival;
                rival.userData.shield = 45;
                break;
            }
        }
    }

    // keep the ball, unless it got away (a shot, a block, a tackle)
    if (carrier && (!free(carrier) || !low || ballDistTo(carrier) > CARRY_REACH + 0.8)) carrier = null;

    // a loose ball goes to whoever reaches it first. A ball travelling fast
    // has to come close to be controlled; a shot can't be stopped by the
    // shooter's own teammate, and a pass is easiest for the one it is meant for.
    if (!carrier && low) {
        const fast = Math.hypot(ball.velocity.x, ball.velocity.z) > 1.2;
        let best = null, bestD = Infinity;
        field.forEach(p => {
            if (!free(p)) return;
            let reach = CARRY_REACH;
            if (fast && lastKick) {
                if (lastKick.kind === 'shot' && p.team === lastKick.team) return;
                if (!(lastKick.kind === 'pass' && lastKick.to === p)) reach = CARRY_REACH * 0.6;
            }
            const d = ballDistTo(p);
            if (d < reach && d < bestD) { bestD = d; best = p; }
        });
        carrier = best;
        if (carrier) { passTarget = null; lastKick = null; }
    }

    if (!carrier) return;
    const f = facingOf(carrier);
    const tx = carrier.position.x + f.x * CARRY_DIST;
    const tz = carrier.position.z + f.z * CARRY_DIST;
    // glide to the spot in front, so turning swings the ball round smoothly
    ball.position.x += (tx - ball.position.x) * 0.35;
    ball.position.z += (tz - ball.position.z) * 0.35;
    ball.position.y = BALL_SIZE;
    ball.velocity.x = carrier.userData.vx || 0;
    ball.velocity.z = carrier.userData.vz || 0;
    ball.velocity.y = 0;
}

// charge-shot tuning
const CHARGE_MIN_MS = 0;        // any press counts, even a flick fires
const CHARGE_MAX_MS = 650;      // hold this long for a full-power shot
const POWER_MIN = 1.35;         // a tap: a pass or a placed shot (~80 units/s)
const POWER_MAX = 2.55;         // full charge: hard, but a keeper can still get there

function handleShoot(player, key) {
    if (!player) return;

    // charge mechanic: press starts a timer, release fires with scaled power
    const isHeld = pressed(key);
    const wasHeld = !!player.userData.shootHeld;

    if (isHeld && !wasHeld) {
        player.userData.charging = true;
        player.userData.chargeStart = performance.now();
    }

    if (!isHeld && wasHeld && player.userData.charging) {
        // released: fire, if the ball is at your feet
        const heldMs = performance.now() - (player.userData.chargeStart || 0);
        const clamped = Math.min(CHARGE_MAX_MS, Math.max(CHARGE_MIN_MS, heldMs));
        const t = (clamped - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS);
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * t;
        player.userData.charging = false;
        player.userData.chargeStart = 0;
        if (carrier === player || ballDistTo(player) < CARRY_REACH + 0.6) fireShot(player, power, t);
    }

    player.userData.shootHeld = isHeld;
}

// Every shot goes at the other goal, wherever you face. Up or down (held, or
// the last way you ran) picks that corner; otherwise it goes low towards the
// middle, on your side of it.
function fireShot(player, power, charge01) {
    const f = facingOf(player);
    const goalX = player.team === 1 ? FIELD_W / 2 : -FIELD_W / 2;
    const reach = GOAL_W * 0.45;                               // just inside the post
    const aimZ = Math.abs(f.z) > 0.3
        ? Math.sign(f.z) * reach
        : Math.max(-reach * 0.5, Math.min(reach * 0.5, ball.position.z * 0.5));
    const dx = goalX - ball.position.x, dz = aimZ - ball.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;

    // a tap lifts a little, a full shot stays low and flat
    knockBall(nx, nz, power, 0.2 - charge01 * 0.12);
    ball.position.x = player.position.x + nx * CARRY_DIST;
    ball.position.z = player.position.z + nz * CARRY_DIST;
    ball.position.y = BALL_SIZE + 0.2;
    player.userData.cooldown = 14;          // don't take it straight back off your own boot
    player.userData.kickT = 0.28;           // swing the leg (animatePlayers)
    if (carrier === player) carrier = null;
    passTarget = null;
    lastKick = { by: player, team: player.team, kind: 'shot' };
    // aftertouch: what is held now aimed the shot, a fresh up/down curls it
    curl = { by: player, t: CURL_TICKS, z0: player.userData.inZ || 0, curled: false };
}

// ----------- curl (aftertouch) -----------
// Right after your shot, press up or down (W/S, the arrows, or the stick) and
// the ball bends towards that corner of the goal; it stops bending once it is
// heading for the corner, so holding longer never takes it wide. The direction
// you were already holding when you shot only aims; let go and press again to
// curl that way too. A keeper who has already dived can't follow it.
const CURL_TICKS = 40;
const CURL_RATE = 0.065;         // most the flight turns per tick (radians)
let curl = null;

function applyCurl() {
    if (!curl) return;
    const held = team1Players[0]?.userData.holdingBall || team2Players[0]?.userData.holdingBall;
    if (carrier || held || STATE.scoring || curl.t <= 0) { curl = null; return; }
    curl.t--;
    const s = curl.by.userData.inZ || 0;
    if (s === 0) { curl.z0 = 0; return; }        // released: the next press curls
    if (s === curl.z0) return;                   // still the key that aimed it
    const vx = ball.velocity.x, vz = ball.velocity.z;
    if (Math.hypot(vx, vz) < 0.6) return;
    // turn towards the pressed corner of the goal being shot at, no further
    const goalX = curl.by.team === 1 ? FIELD_W / 2 : -FIELD_W / 2;
    const want = Math.atan2(s * GOAL_W * 0.42 - ball.position.z, goalX - ball.position.x);
    let diff = want - Math.atan2(vz, vx);
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < 0.004) return;
    const a = Math.sign(diff) * Math.min(Math.abs(diff), CURL_RATE);
    const c = Math.cos(a), sn = Math.sin(a);
    ball.velocity.x = vx * c - vz * sn;
    ball.velocity.z = vx * sn + vz * c;
    curl.curled = true;
    curl.spin = s;
}

// ----------- passing -----------
// The pass key (Q, right Shift, or Pass on a phone):
//   * your keeper or your computer teammate has the ball → they give it to you
//   * you have it → to the teammate you are facing; usually the outfield one,
//     your keeper when you face your own goal
// A pass is weighted for the distance and played into the receiver's run.
let passTarget = null;           // { to, t }: the receiver moves to meet the ball
let lastKick = null;             // { by, team, kind: 'shot' | 'pass' }

function handlePass(player, keyArr) {
    if (!player) return;
    if (!pressedOnce(keyArr)) return;

    const side = player.team === 1 ? team1Players : team2Players;
    const keeper = side[0];
    if (keeper && keeper.userData.holdingBall) { passBall(keeper, player); return; }
    if (carrier && carrier !== player && carrier.team === player.team) { passBall(carrier, player); return; }

    if (carrier !== player && ballDistTo(player) > CARRY_REACH + 0.6) return;
    const f = facingOf(player);
    let best = null, bestScore = -Infinity;
    side.forEach(m => {
        if (m === player) return;
        const dx = m.position.x - player.position.x, dz = m.position.z - player.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const score = (dx * f.x + dz * f.z) / d - d / 140 + (m.userData.isKeeper ? 0 : 0.45);
        if (score > bestScore) { bestScore = score; best = m; }
    });
    if (best) passBall(player, best);
    if (player.userData.charging) {
        player.userData.charging = false;
        player.userData.chargeStart = 0;
    }
}

function passBall(from, to) {
    const fromKeeper = !!from.userData.isKeeper;
    const startX = from.position.x, startZ = from.position.z;
    let tx = to.position.x, tz = to.position.z;
    const d0 = Math.hypot(tx - startX, tz - startZ);
    const power = Math.min(1.9, 0.85 + d0 * 0.022);
    // into his stride: where he will be when it gets there
    const lead = (d0 / power) * 0.8;
    tx += (to.userData.vx || 0) * lead;
    tz += (to.userData.vz || 0) * lead;
    tx = Math.max(-FIELD_W / 2 + 2, Math.min(FIELD_W / 2 - 2, tx));
    tz = Math.max(-FIELD_L / 2 + 2, Math.min(FIELD_L / 2 - 2, tz));
    const dx = tx - startX, dz = tz - startZ;
    const d = Math.hypot(dx, dz) || 1;
    knockBall(dx / d, dz / d, power, fromKeeper ? 0.28 : 0.1);
    const off = fromKeeper ? PLAYER_SIZE / 2 + BALL_SIZE + 0.9 : CARRY_DIST;
    ball.position.x = startX + dx / d * off;
    ball.position.z = startZ + dz / d * off;
    ball.position.y = BALL_SIZE + 0.2;
    if (fromKeeper) {
        from.userData.holdingBall = false;
        from.userData.holdStart = 0;
    } else {
        from.userData.cooldown = 14;
        from.userData.kickT = 0.28;
    }
    if (carrier === from) carrier = null;
    passTarget = { to, t: 90 };
    lastKick = { by: from, team: from.team, kind: 'pass', to };
    curl = null;
}

// ----------- AI -----------
function updateAI() {
    [...team1Players, ...team2Players].forEach(p => {
        if (p === controlledP1 || p === controlledP2) return;
        if (p.userData.isKeeper) updateKeeper(p);
        else if (p.userData.isBot) updateBotFieldPlayer(p);
    });
}

// Keeper tuning, in units per tick. A keeper always stands between the ball and
// the middle of his goal and shuffles along with it. When a shot comes he
// reads where it will cross his line, reacts after a beat and dives for it:
// soft and medium shots are saved, a hard one into a corner goes in.
// How quick, far and fast he goes comes from LEVELS (game.core.js): the
// computer's keeper plays at the chosen level, every other keeper at medium.
const KEEPER_REACH = PLAYER_SIZE / 2 + BALL_SIZE + 0.2;   // hands, standing

function keeperSkill(k) {
    const cpuSide = STATE.mode === 'cpu' && k.team !== STATE.p1.team;
    return (cpuSide ? getLevel() : LEVELS.medium).keeper;
}

function updateKeeper(k) {
    const u = k.userData;
    const skill = keeperSkill(k);
    const isTeam1 = k.team === 1;
    const goalLineX = isTeam1 ? -FIELD_W/2 : FIELD_W/2;
    const out = isTeam1 ? 1 : -1;                     // direction from the goal into the pitch
    const lineX = goalLineX + out * 3.5;

    if (u.holdingBall) {
        steer(k, 0, 0, 0.08);
    } else {
        // 1 — is a shot coming? where will it cross my line?
        const vx = ball.velocity.x, vz = ball.velocity.z;
        const incoming = -vx * out > 0.6 && carrier === null;
        let shotZ = null;
        if (incoming) {
            const t = (k.position.x - ball.position.x) / vx;
            if (t > 0 && t < 70) shotZ = ball.position.z + vz * t;
        }

        let targetX, targetZ, top;
        if (shotZ !== null && Math.abs(shotZ) < GOAL_W / 2 + 3) {
            u.react = (u.react || 0) + 1;
            // no keeper reads every shot equally well: a tick quicker or up to
            // two slower than his level, decided when he first sees it
            if (u.react === 1) u.reactAt = skill.react - 1 + Math.floor(Math.random() * 4);
            targetX = k.position.x;
            // once he has dived he is committed: a ball that curls late beats him
            targetZ = u.diveT > 0 && u.diveAt !== undefined ? u.diveAt : shotZ;
            top = u.react > u.reactAt ? skill.lunge : 0;
            // he goes down for anything that isn't straight at him, as soon as
            // he has read it; whether he gets there depends on his level
            const gap = shotZ - k.position.z;
            if (u.react >= 4 && Math.abs(gap) > 1.4 && !(u.diveT > 0)) {
                u.diveT = 0.6;
                u.diveAt = shotZ;
                u.diveX = 0;
                u.diveZ = Math.sign(gap);
            }
        } else {
            u.react = 0;
            // 2 — narrow the angle: on the line between ball and goal centre,
            // further across and a little further out as the ball gets closer
            const dist = Math.abs(ball.position.x - goalLineX);
            const near = Math.max(0, Math.min(1, 1 - (dist - 10) / 45));
            targetZ = ball.position.z * (0.2 + 0.4 * near);
            targetX = lineX + out * 3 * near;
            top = skill.shuffle;
        }
        // positioning stays inside the posts; only a dive goes past them
        const lim = top === skill.shuffle ? GOAL_W / 2 - 1.5 : GOAL_W / 2 + 1;
        targetZ = Math.max(-lim, Math.min(lim, targetZ));

        const dx = targetX - k.position.x, dz = targetZ - k.position.z;
        const d = Math.hypot(dx, dz);
        // slow into the spot instead of overshooting it
        const want = Math.min(top, d * 0.25);
        if (d > 0.05) steer(k, dx / d * want, dz / d * want, top === skill.lunge ? 0.2 : 0.05);
        else steer(k, 0, 0, 0.05);
    }

    k.position.x += u.vx || 0;
    k.position.z += u.vz || 0;

    // he stays in his own six-yard area
    const minX = isTeam1 ? goalLineX + 1.2 : goalLineX - 9;
    const maxX = isTeam1 ? goalLineX + 9 : goalLineX - 1.2;
    k.position.x = Math.max(minX, Math.min(maxX, k.position.x));
    k.position.z = Math.max(-GOAL_W / 2 - 1, Math.min(GOAL_W / 2 + 1, k.position.z));

    // catch → hold → release (only when pressured, or after a safety timeout)
    const dx = ball.position.x - k.position.x;
    const dz = ball.position.z - k.position.z;
    const d2 = dx*dx + dz*dz;
    // a dive stretches the reach; an attacker dribbling in close is only
    // robbed when he walks right into the keeper
    const reach = carrier
        ? KEEPER_REACH * 0.7
        : KEEPER_REACH + (u.diveT > 0 && u.react > u.reactAt ? skill.dive : 0);
    const catchable = ball.position.y < GOAL_H * 0.75;

    // a hard shot taken at full stretch is pushed away, not held
    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (catchable && !carrier && !u.holdingBall && d2 < reach * reach && d2 > KEEPER_REACH * KEEPER_REACH && speed > 1.7) {
        const side = Math.sign(dz) || 1;
        knockBall(out * 0.35, side * 0.9, Math.min(1.2, speed * 0.45), 0.3);
        ball.position.x = k.position.x + out * 1.5;
        u.parryT = 20;
        curl = null;
        lastKick = null;
        return;
    }
    if (u.parryT > 0) { u.parryT--; return; }      // let the parried ball get away

    // begin holding the moment the ball touches the keeper
    if (catchable && d2 < reach * reach && !u.holdingBall) {
        if (carrier) carrier.userData.cooldown = 40;
        carrier = null;
        u.holdingBall = true;
        u.holdStart = performance.now();
    }

    if (k.userData.holdingBall) {
        // sticky to keeper — bal is in zijn handen
        ball.position.x = k.position.x;
        ball.position.z = k.position.z;
        ball.position.y = BALL_SIZE + 1.6;
        ball.velocity.x = 0;
        ball.velocity.y = 0;
        ball.velocity.z = 0;

        // pressure: the nearest attacker
        const enemies = (isTeam1 ? team2Players : team1Players).filter(p => !p.userData.isKeeper);
        const enemyDist = nearestTo(enemies, k.position.x, k.position.z).d;

        const heldMs = performance.now() - (k.userData.holdStart || performance.now());
        const minHold = 380;        // brief catch animation — never instant
        const maxHold = 2400;       // safety release so the game doesn't stall
        const pressureRange = 13;   // an enemy this close = panic-pass

        const pressured = enemyDist < pressureRange;
        const release = heldMs > minHold && (pressured || heldMs > maxHold);

        if (release) {
            // to the teammate with the most room; a human gets it when he is free
            const mates = (isTeam1 ? team1Players : team2Players).filter(p => !p.userData.isKeeper);
            let best = null, bestRoom = -Infinity;
            mates.forEach(m => {
                const human = m === controlledP1 || m === controlledP2;
                const room = nearestTo(enemies, m.position.x, m.position.z).d + (human ? 6 : 0);
                if (room > bestRoom) { bestRoom = room; best = m; }
            });
            if (best) { passBall(k, best); return; }
            k.userData.holdingBall = false;
            k.userData.holdStart = 0;
        }
    }
}

// ----------- computer outfield players -----------
// With two outfield players a side, the computer's players share the work:
//   * the one of his side nearest the ball goes for it (a loose ball, or
//     pressing the man on the ball); a human teammate counts as "his side"
//   * the other marks the opponent without the ball, goal-side of him
//   * when his own side has the ball he runs ahead and wide, to be passed to
//   * with the ball he dribbles at goal, shoots in range, and passes to a
//     teammate who is free and further forward
// How fast, sharp and clever he is comes from aiLevel() (game.core.js).

function nearestTo(list, x, z) {
    let best = null, d = Infinity;
    list.forEach(p => {
        const dd = Math.hypot(p.position.x - x, p.position.z - z);
        if (dd < d) { d = dd; best = p; }
    });
    return { p: best, d };
}

function updateBotFieldPlayer(p) {
    if (STATE.inputLocked) return;
    const lvl = aiLevel();
    const u = p.userData;

    const ownGoalX = p.team === 1 ? -FIELD_W/2 : FIELD_W/2;
    const enemyGoalX = -ownGoalX;
    const goalSign = p.team === 1 ? 1 : -1;
    const perX = botPerception.x;
    const perZ = botPerception.z;

    const side = p.team === 1 ? team1Players : team2Players;
    const mates = side.filter(m => m !== p && !m.userData.isKeeper);
    const enemies = (p.team === 1 ? team2Players : team1Players).filter(m => !m.userData.isKeeper);

    const owner = carrier;
    const haveBall = owner === p;
    const mateHasBall = owner && owner !== p && owner.team === p.team;
    const enemyHasBall = owner && owner.team !== p.team;

    // am I the one who goes for the ball? (a small margin stops two players swapping every tick)
    const myD = Math.hypot(perX - p.position.x, perZ - p.position.z);
    const iAmFirst = mates.every(m => Math.hypot(perX - m.position.x, perZ - m.position.z) > myD - 1.5);

    let targetX, targetZ, chasing = false;

    if (passTarget && passTarget.to === p) {
        // a pass is on its way to me: meet it
        targetX = ball.position.x + ball.velocity.x * 6;
        targetZ = ball.position.z + ball.velocity.z * 6;
        chasing = true;
    } else if (haveBall) {
        // dribble at goal, weaving a little
        targetX = enemyGoalX;
        targetZ = ball.position.z * 0.6 + Math.sin(Date.now() * 0.003 + p.team) * 8;
    } else if (mateHasBall) {
        // offer a pass: ahead of the ball and on the other side of the pitch
        const ahead = owner.position.x + 16 * goalSign;
        const limit = enemyGoalX - 14 * goalSign;
        targetX = goalSign > 0 ? Math.min(ahead, limit) : Math.max(ahead, limit);
        targetZ = -Math.sign(owner.position.z || (p.team === 1 ? -1 : 1)) * 15;
    } else if (iAmFirst) {
        if (enemyHasBall) {
            const distFromOwnGoal = Math.abs(perX - ownGoalX);
            const inOurDefendingThird = distFromOwnGoal < FIELD_W * 0.30;
            if (myD < lvl.press) {
                // close enough to win it: get goal-side of the ball and put a foot in
                targetX = perX - 1.5 * goalSign;
                targetZ = perZ;
                chasing = true;
            } else if (inOurDefendingThird) {
                targetX = ownGoalX + 8 * goalSign;
                targetZ = perZ * 0.12 - Math.sign(perZ || 1) * 5;
            } else {
                targetX = perX - 8 * goalSign;
                targetZ = perZ;
            }
        } else {
            // loose ball: go and get it
            targetX = perX;
            targetZ = perZ;
            chasing = true;
        }
    } else {
        // cover: mark the opponent who doesn't have the ball, from his goal side
        const free = enemies.filter(e => e !== owner);
        const mark = free.length ? nearestTo(free, ownGoalX, 0).p : null;
        if (mark) {
            targetX = mark.position.x + (ownGoalX - mark.position.x) * 0.22;
            targetZ = mark.position.z * 0.8;
        } else {
            targetX = ownGoalX + (perX - ownGoalX) * 0.4;
            targetZ = perZ * 0.4;
        }
    }

    const tdx = targetX - p.position.x;
    const tdz = targetZ - p.position.z;
    const tdist = Math.sqrt(tdx*tdx + tdz*tdz);
    let top = lvl.run * (haveBall ? DRIBBLE_SPEED * 0.92 : ((enemyHasBall || chasing) ? RUN_SPEED * 0.96 : RUN_SPEED * 0.85));
    // sprint after the ball when it is far, if the level allows it
    if (sprintFor(p, lvl.sprint > 0 && (chasing || mateHasBall) && tdist > 9)) top *= 1 + 0.35 * lvl.sprint;
    if (tdist > 0.5) {
        const want = Math.min(top, tdist * 0.2);
        steer(p, tdx / tdist * want, tdz / tdist * want, RUN_ACCEL);
        u.aimX = tdx / tdist;
        u.aimZ = tdz / tdist;
    } else {
        steer(p, 0, 0, RUN_BRAKE);
    }
    if (u.vx || u.vz) {
        // slide-along collision (same projection trick as the human player)
        let mx = u.vx;
        let mz = u.vz;
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
        u.vx = mx;
        u.vz = mz;
        p.position.x += mx;
        p.position.z += mz;
    }

    // pitch bounds
    p.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, p.position.x));
    p.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, p.position.z));

    if (!haveBall) return;

    // shoot when in range
    const shootRange = Math.abs(enemyGoalX - p.position.x);
    if (shootRange < lvl.shootFrom && Math.random() < lvl.shootChance) {
        const keeper = (p.team === 1 ? team2Players[0] : team1Players[0]);
        // aim for the side the keeper isn't, with a human-sized miss
        const sideZ = keeper ? Math.sign(-keeper.position.z || (Math.random() - 0.5)) : 1;
        const aimZ = sideZ * GOAL_W * lvl.aim + (Math.random() - 0.5) * lvl.miss;
        const tx = enemyGoalX - ball.position.x;
        const tz = aimZ - ball.position.z;
        const len = Math.hypot(tx, tz) || 1;
        u.aimX = tx / len;
        u.aimZ = tz / len;
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * (lvl.power[0] + Math.random() * (lvl.power[1] - lvl.power[0]));
        knockBall(tx / len, tz / len, power, 0.14);
        ball.position.x = p.position.x + (tx / len) * CARRY_DIST;
        ball.position.z = p.position.z + (tz / len) * CARRY_DIST;
        ball.position.y = BALL_SIZE + 0.2;
        u.cooldown = 14;
        u.kickT = 0.28;
        carrier = null;
        passTarget = null;
        curl = null;
        lastKick = { by: p, team: p.team, kind: 'shot' };
        return;
    }

    // pass to a teammate who is free and further forward (more often under pressure)
    const pressure = nearestTo(enemies, p.position.x, p.position.z).d;
    const myToGoal = Math.abs(enemyGoalX - p.position.x);
    for (const m of mates) {
        const room = nearestTo(enemies, m.position.x, m.position.z).d;
        const forward = Math.abs(enemyGoalX - m.position.x) < myToGoal - 6;
        if (room > 7 && (forward || pressure < 5) && Math.random() < lvl.pass * (pressure < 5 ? 2.5 : 1)) {
            passBall(p, m);
            return;
        }
    }
}

// who has the ball: the carrier, else nobody
function getBallOwner() {
    return carrier;
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
    // a carried ball is handled by updateCarry (tackles included)
    if (!sticky) [...team1Players, ...team2Players].forEach(p => {
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
            curl = null;
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
    const ballMesh = ball.userData.mesh;
    ballMesh.rotation.x += ball.velocity.z * 0.16;
    ballMesh.rotation.z -= ball.velocity.x * 0.16;
    if (curl && curl.curled) ballMesh.rotation.y += 0.45 * (curl.spin || 0);   // side spin
}

// the carried ball is placed by updateCarry, not by the physics
function isSticky() {
    return carrier !== null;
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
    flash.dataset.team = scoringTeam === 1 ? 'red' : 'blue';   // band takes the scorer's colour
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
    if (!Number.isFinite(s)) return '∞';
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
    if (STATE.score1 > STATE.score2) winner = `${redPlayer.name} wint`;
    else if (STATE.score2 > STATE.score1) winner = `${bluePlayer.name} wint`;
    else winner = 'Gelijkspel';
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
