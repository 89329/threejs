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

    controlledP1 = STATE.p1.team === 1 ? redField : blueField;
    controlledP2 = isCpu ? null : (STATE.p2.team === 1 ? redField : blueField);
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
        if (speed > 4) target = Math.atan2(dx, dz);
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
            rollWant = side * 1.15 * Math.min(1, u.diveT / 0.15);
            rig.armL.rotation.x = rig.armR.rotation.x = -2.6;     // both arms up and out
        }
        u.roll = (u.roll || 0) + (rollWant - (u.roll || 0)) * Math.min(1, dt * 16);
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
    });
    carrier = null;

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

    if (!STATE.paused) animatePlayers(frameDt);
    updateBallShadow();
    updateCamera(frameDt);
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
    updateCarry();
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

    const inLen = Math.hypot(inX, inZ);
    let top = carrier === player ? DRIBBLE_SPEED : RUN_SPEED;
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
    const field = [team1Players[1], team2Players[1]].filter(Boolean);
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
        const rival = field.find(p => p !== carrier && p.team !== carrier.team);
        if (rival && free(rival) && ballDistTo(rival) < STEAL_REACH) {
            const human = rival === controlledP1 || rival === controlledP2;
            if (Math.random() < (human ? 0.09 : 0.05)) {
                carrier.userData.cooldown = 36;
                carrier = rival;
                rival.userData.shield = 45;
            }
        }
    }

    // keep the ball, unless it got away (a shot, a block, a tackle)
    if (carrier && (!free(carrier) || !low || ballDistTo(carrier) > CARRY_REACH + 0.8)) carrier = null;

    // a loose ball goes to whoever reaches it first
    if (!carrier && low) {
        let best = null, bestD = CARRY_REACH;
        field.forEach(p => {
            if (!free(p)) return;
            const d = ballDistTo(p);
            if (d < bestD) { bestD = d; best = p; }
        });
        carrier = best;
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

// The ball goes where you face. Facing roughly at the goal, it is steered into
// the goal mouth on the side you lean to, so a shot on goal stays on target.
function fireShot(player, power, charge01) {
    const f = facingOf(player);
    const goalX = player.team === 1 ? FIELD_W / 2 : -FIELD_W / 2;
    const toGoal = Math.sign(goalX - ball.position.x);
    let nx = f.x, nz = f.z;

    if (f.x * toGoal > 0.35) {
        // leaning up or down picks that corner; straight on shoots where you face
        const run = Math.abs(goalX - ball.position.x);
        const reach = GOAL_W * 0.45;                           // just inside the post
        const aimZ = Math.abs(f.z) > 0.3
            ? Math.sign(f.z) * reach
            : Math.max(-reach, Math.min(reach, ball.position.z + (f.z / Math.abs(f.x)) * run));
        const dx = goalX - ball.position.x, dz = aimZ - ball.position.z;
        const len = Math.hypot(dx, dz) || 1;
        nx = dx / len; nz = dz / len;
    }

    // a tap lifts a little, a full shot stays low and flat
    knockBall(nx, nz, power, 0.2 - charge01 * 0.12);
    ball.position.x = player.position.x + nx * CARRY_DIST;
    ball.position.z = player.position.z + nz * CARRY_DIST;
    ball.position.y = BALL_SIZE + 0.2;
    player.userData.cooldown = 14;          // don't take it straight back off your own boot
    player.userData.kickT = 0.28;           // swing the leg (animatePlayers)
    if (carrier === player) carrier = null;
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
        const power = Math.min(1.8, 0.9 + plen * 0.025);
        ball.velocity.x = nx * power;
        ball.velocity.z = nz * power;
        ball.velocity.y = 0.3;
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
    if (carrier !== player && dist > CARRY_REACH + 0.6) return;
    if (!keeper) return;

    const px = keeper.position.x - ball.position.x;
    const pz = keeper.position.z - ball.position.z;
    const plen = Math.hypot(px, pz) || 1;
    const nx = px / plen;
    const nz = pz / plen;

    // weighted to arrive: harder over a long distance, soft when close
    const power = Math.min(1.9, 0.8 + plen * 0.022);
    ball.velocity.x = nx * power;
    ball.velocity.z = nz * power;
    ball.velocity.y = 0.12;
    ball.position.x = player.position.x + nx * CARRY_DIST;
    ball.position.z = player.position.z + nz * CARRY_DIST;
    ball.position.y = BALL_SIZE + 0.2;
    player.userData.cooldown = 14;
    player.userData.kickT = 0.28;
    if (carrier === player) carrier = null;

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

// Keeper tuning, in units per tick. A keeper always stands between the ball and
// the middle of his goal and shuffles along with it. When a shot comes he
// reads where it will cross his line, reacts after a beat and dives for it:
// soft and medium shots are saved, a hard one into a corner goes in.
const KEEPER_SHUFFLE  = 0.30;  // positioning speed (~18 units/s)
const KEEPER_LUNGE    = 0.55;  // speed during a dive
const KEEPER_REACT    = 9;     // ticks before he moves on a shot (~0.12 s)
const KEEPER_REACH    = PLAYER_SIZE / 2 + BALL_SIZE + 0.2;   // hands, standing
const KEEPER_DIVE_ADD = 1.1;   // extra reach at full stretch

function updateKeeper(k) {
    const u = k.userData;
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
            targetX = k.position.x;
            targetZ = shotZ;
            top = u.react > KEEPER_REACT ? KEEPER_LUNGE : 0;
            // dive when it is past arm's length
            const gap = shotZ - k.position.z;
            if (u.react > KEEPER_REACT && Math.abs(gap) > KEEPER_REACH && !(u.diveT > 0)) {
                u.diveT = 0.55;
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
            top = KEEPER_SHUFFLE;
        }
        // positioning stays inside the posts; only a dive goes past them
        const lim = top === KEEPER_SHUFFLE ? GOAL_W / 2 - 1.5 : GOAL_W / 2 + 1;
        targetZ = Math.max(-lim, Math.min(lim, targetZ));

        const dx = targetX - k.position.x, dz = targetZ - k.position.z;
        const d = Math.hypot(dx, dz);
        // slow into the spot instead of overshooting it
        const want = Math.min(top, d * 0.25);
        if (d > 0.05) steer(k, dx / d * want, dz / d * want, top === KEEPER_LUNGE ? 0.2 : 0.05);
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
        : KEEPER_REACH + (u.diveT > 0 ? KEEPER_DIVE_ADD : 0);
    const catchable = ball.position.y < GOAL_H * 0.75;

    // a hard shot taken at full stretch is pushed away, not held
    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (catchable && !carrier && !u.holdingBall && d2 < reach * reach && d2 > KEEPER_REACH * KEEPER_REACH && speed > 1.7) {
        const side = Math.sign(dz) || 1;
        knockBall(out * 0.35, side * 0.9, Math.min(1.2, speed * 0.45), 0.3);
        ball.position.x = k.position.x + out * 1.5;
        u.parryT = 20;
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
                // weighted to reach him; pressured goes a bit harder and flatter
                const power = Math.min(pressured ? 1.9 : 1.6, 0.8 + plen * 0.02);
                const arc   = pressured ? 0.2 : 0.3;
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
        const closeToBall = Math.hypot(perX - p.position.x, perZ - p.position.z) < 16;

        if (closeToBall) {
            // close enough to win it: get goal-side of the ball and put a foot in
            targetX = perX - 1.5 * goalSign;
            targetZ = perZ;
        } else if (inOurDefendingThird) {
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
    // same legs as a human: a little slower with the ball, a little quicker pressing
    const top = haveBall ? DRIBBLE_SPEED * 0.92 : (enemyHasBall ? RUN_SPEED * 0.96 : RUN_SPEED * 0.85);
    if (tdist > 0.5) {
        const want = Math.min(top, tdist * 0.2);
        steer(p, tdx / tdist * want, tdz / tdist * want, RUN_ACCEL);
        p.userData.aimX = tdx / tdist;
        p.userData.aimZ = tdz / tdist;
    } else {
        steer(p, 0, 0, RUN_BRAKE);
    }
    if (p.userData.vx || p.userData.vz) {
        // slide-along collision (same projection trick as the human player)
        let mx = p.userData.vx;
        let mz = p.userData.vz;
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
        p.userData.vx = mx;
        p.userData.vz = mz;
        p.position.x += mx;
        p.position.z += mz;
    }

    // pitch bounds
    p.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, p.position.x));
    p.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, p.position.z));

    // decide to shoot when in shooting range (about twice a second once there)
    const shootRange = (p.team === 1 ? FIELD_W/2 - p.position.x : p.position.x + FIELD_W/2);
    if (haveBall && shootRange < 30 && Math.random() < 0.025) {
        const keeper = (p.team === 1 ? team2Players[0] : team1Players[0]);
        // aim for the side the keeper isn't, with a human-sized miss
        const side = keeper ? Math.sign(-keeper.position.z || (Math.random() - 0.5)) : 1;
        const aimZ = side * GOAL_W * 0.24 + (Math.random() - 0.5) * 9;   // often within the keeper's reach
        const tx = enemyGoalX - ball.position.x;
        const tz = aimZ - ball.position.z;
        const len = Math.hypot(tx, tz) || 1;
        p.userData.aimX = tx / len;
        p.userData.aimZ = tz / len;
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * (0.15 + Math.random() * 0.5);
        knockBall(tx / len, tz / len, power, 0.14);
        ball.position.x = p.position.x + (tx / len) * CARRY_DIST;
        ball.position.z = p.position.z + (tz / len) * CARRY_DIST;
        ball.position.y = BALL_SIZE + 0.2;
        p.userData.cooldown = 14;
        p.userData.kickT = 0.28;
        carrier = null;
    }
    // tackles go through updateCarry, which gives the bot a fair chance per tick
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
