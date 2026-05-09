// =====================================================
// PITCH ROYALE — Stadium Nightfall
// Local 2-player football game
// =====================================================

// Cache-bust marker: bump GAME_BUILD on every change so we can verify
// the live site is actually serving the latest game.js. If this string
// doesn't show up in DevTools console after a refresh, the browser /
// GitHub Pages CDN is still serving an older cached copy.
const GAME_BUILD = 'v31-rotate-glb-90 (2026-05-06)';
console.log(`%c[GAME] build: ${GAME_BUILD}`,
    'background:#16a34a;color:#000;font-weight:bold;padding:3px 8px;border-radius:3px');

// ----------- state -----------
const STATE = {
    screen: 'loading',         // loading | launch | setup | coin | playing | over
    mode: 'duo',               // duo (Hot-Seat) | cpu
    p1: { name: 'Speler 1', team: 1 },   // team: 1 = red, 2 = blue
    p2: { name: 'Speler 2', team: 2 },
    callerSide: 'p1',          // who calls heads/tails
    kickoffTeam: 1,
    score1: 0,
    score2: 0,
    gameDuration: 90,          // seconds
    gameStartTime: null,
    inputLocked: true,         // unlocked after kickoff countdown
    scoring: false,            // true during the goal-celebration freeze
    paused: false,             // true while the pause overlay is up
};

// ----------- in-game color palette (Stadium Nightfall) -----------
const COLORS = {
    pitch:        0x0e6a3a,
    pitchDark:    0x094f29,
    line:         0xe7e2d2,
    ground:       0x080a14,
    team1:        0xe0203a,    // crimson
    team1Hot:     0xff5b6e,
    team2:        0x1f5dff,    // cobalt
    team2Hot:     0x6da4ff,
    skin:         0xe2c39a,
    keeperBand:   0xf0c14a,
    skyTop:       0x000000,
    skyMid:       0x040406,
    skyBottom:    0x000000,
    fogColor:     0x000000,
};

// ----------- field constants -----------
const FIELD_W = 110;
const FIELD_L = 70;
const GOAL_W = 22;
const GOAL_H = 10;
const PLAYER_SIZE = 3.4;
const BALL_SIZE = 1.05;

// ----------- stadium catalog -----------
// Voeg je eigen stadions toe: drop een .glb in media/stadiums/ (of media/models/),
// kopieer een entry hieronder en pas de waarden aan. De `id` is uniek en wordt
// in localStorage opgeslagen — hergebruik nooit een id van een stadion dat al
// eerder is uitgekozen door iemand anders, anders krijgen ze een ander stadion
// dan ze hadden gekozen.
//
//   id          — slug, uniek, wordt in localStorage gezet
//   name        — display naam (Anton-cap)
//   sub         — kleine subtitle op de kaart (mono, ALL CAPS)
//   tagline     — sfeerregel onder de naam
//   file        — pad naar .glb (of null = procedureel veld zonder model)
//   accent      — accent-kleur voor kaart-glow + dot
//   capacity    — vrije tekst (vb '60.000', 'INTIEM', 'TBD')
//   mood        — vrije tekst (vb 'NACHT', 'AVONDLICHT')
//   silhouette  — 'bowl' | 'rect' | 'classic'  (welke kaart-illustratie)
//
// Optionele tuning-velden (default = 1.0 of 0):
//   scaleMul    — multiplier op de auto-fit schaal (kleiner = stadion dichter
//                 om het veld; groter = stadion verder weg)
//   offsetY     — handmatige y-verschuiving in scene units (positief = stadion
//                 omhoog, negatief = omlaag). Gebruik om interne pitch-hoogte
//                 te laten matchen met y=0
//   colorScale  — multiplier op alle base/emissive kleuren (vb 0.55 = ~half
//                 zo licht). Goed voor day-textures die je als nacht wil
//   rotateY     — extra y-rotatie in radians (vb Math.PI/2) als de pitch in
//                 het model 90° gedraaid staat
//   fieldCutout  — gameplay-only: verberg lage GLB-meshes in het speelveld,
//                 zodat ons eigen veld/spelers zichtbaar blijven zoals bij
//                 de procedurele arena
//   sinkY       — gameplay-only: laat de import iets onder het speelvlak zakken
//   cutawayFrontZ — gameplay-only: verberg voorste import-delen die tussen de
//                 vaste camera en het speelveld zitten
//   nativePitch — gameplay-only: gebruik het veld uit de .glb zelf in plaats
//                 van onze procedurele groene rechthoek. Verbergt automatisch
//                 onze plaat/border/lijnen en brengt de pitch-meshes in de
//                 GLB op vol kleur (geen colorScale-dimming) zodat het echte
//                 stadiongras zichtbaar is.
//   pitchBrighten — gameplay-only: extra multiplier op de pitch-mesh kleur
//                 (default 1.0). Handig als de GLB-pitch erg donker is.
//   gameplayScale — extra gameplay-only schaal na pitch-fit; >1 maakt het
//                 geïmporteerde stadion groter en dramatischer in beeld
//   cameraPos/cameraLookAt/cameraFov — gameplay camera per stadion
//   cameraCutaway — gameplay-only: verberg import-meshes aan de camerakant
//                 zodat een dak/tribune niet voor het speelveld hangt
const STADIUMS = [
    {
        id: 'camp-nou',
        name: 'Camp Nou',
        sub: 'HOME · BLAUGRANA',
        tagline: 'Més que un club.',
        file: 'media/models/stadiums/camp_nou_stadium.glb',
        accent: '#a50044',
        capacity: '99.354',
        mood: 'AVOND',
        silhouette: 'bowl',
        // tuning — daylight-baked textures; dim ~50% to match night atmosphere
        // and shrink slightly so the model's interior pitch lines up with FIELD_W.
        // We show the *real* baked pitch from the GLB instead of stamping our
        // flat green plane on top — the procedural rectangle was reading as a
        // sticker glued onto the stadium.
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
        nativePitch: true,
        pitchBrighten: 1.9,
        cutawayFrontZ: null,
        gameplayScale: 1.0,
        cameraPos: [0, 72, 78],
        cameraLookAt: [0, 0, 0],
        cameraFov: 58,
        cameraCutaway: false,
    },
    {
        id: 'old-trafford',
        name: 'Old Trafford',
        sub: 'HOME · RED DEVILS',
        tagline: 'The Theatre of Dreams.',
        file: 'media/models/stadiums/old_trafford.glb',
        accent: '#da291c',
        capacity: '74.310',
        mood: 'AVOND',
        silhouette: 'classic',
        // same pipeline as Camp Nou: native imported pitch, dimmed stands.
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
        nativePitch: true,
        pitchBrighten: 1.9,
        cutawayFrontZ: null,
        gameplayScale: 1.0,
        // Old Trafford GLB's pitch ends up offset ~15 units to the right of
        // world origin after auto-fit, so we shift the broadcast cam left to
        // re-frame: pitch lands centered, both goals stay in view.
        cameraPos: [-15, 72, 78],
        cameraLookAt: [-15, 0, 0],
        cameraFov: 58,
        cameraCutaway: false,
    },
    // Anfield tijdelijk uit de catalogus gehaald — uncomment om weer aan te zetten.
    // {
    //     id: 'anfield',
    //     name: 'Anfield',
    //     sub: 'HOME · THE KOP',
    //     tagline: "You'll Never Walk Alone.",
    //     file: 'media/models/stadiums/ANFIELD STADIUM.glb',
    //     accent: '#c8102e',
    //     capacity: '54.074',
    //     mood: 'NACHT',
    //     silhouette: 'classic',
    //     // same pipeline as Camp Nou / Old Trafford: native imported pitch,
    //     // dimmed stands, no front-mesh cutaway.
    //     scaleMul: 0.78,
    //     colorScale: 0.55,
    //     offsetY: 0,
    //     nativePitch: true,
    //     pitchBrighten: 1.9,
    //     cutawayFrontZ: null,
    //     gameplayScale: 1.0,
    //     cameraPos: [0, 72, 78],
    //     cameraLookAt: [0, 0, 0],
    //     cameraFov: 58,
    //     cameraCutaway: false,
    // },
    {
        id: 'etihad',
        name: 'Etihad Stadium',
        sub: 'HOME · CITIZENS',
        tagline: 'Welcome to the new home of City.',
        file: 'media/models/stadiums/ETIHAD STADIUM.glb',
        accent: '#6cabdd',
        capacity: '53.400',
        mood: 'AVOND',
        silhouette: 'bowl',
        // v26 — terug naar `nativePitch: true`: gebruik de écht Etihad-pitch
        // (mét "ETIHAD" tekst en eigen doelen die in de GLB zitten gebakken)
        // als speelveld i.p.v. onze procedurale gestreepte plaat.  In 8.png
        // werd de procedurale pitch op y=0 gerenderd ÓNDER de Etihad-pitch
        // (die zit op y≈15-20 in de GLB) — twee velden boven elkaar, spelers
        // op de verkeerde.  findGLBPitchBox + v22's soepele fallback +
        // nieuwe "grootste-platte-mesh" laatste-redmiddel fallback zorgen
        // ervoor dat de Etihad-pitch wél gedetecteerd wordt en step-3 zijn
        // bovenkant op y=0 plaatst — spelers staan dan ÓP het Etihad-veld.
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
        nativePitch: true,
        pitchBrighten: 1.9,
        cutawayFrontZ: FIELD_L / 2 + 2,
        // gameplayScale terug naar 1.0 — boost was nodig in v29/v30 omdat de
        // GLB-pitch verkeerd geörienteerd was; step-2 schaalde verkeerde as
        // → zichtbaar gras werd te smal in x → spelers extended off-pitch.
        // Met rotateY (zie hieronder) klopt step-2 nu vanzelf.
        gameplayScale: 1.0,
        // visualPlayerScale fixes a structural mismatch:
        // PLAYER_SIZE (3.4) / FIELD_W (110) = 3.1%, but real FIFA-broadcast
        // ratio (3.png) is ~1.5%. Scaling the player GROUP visually (mesh
        // transforms only, geen gameplay/collision change) brengt de
        // on-screen ratio in de 3.png-buurt: 0.55 × 3.1% ≈ 1.7%.
        visualPlayerScale: 0.55,
        // 90° rotatie — DE belangrijkste fix.  De Etihad GLB heeft zijn
        // pitch met de lange as langs z (doel-tot-doel = z), korte langs x.
        // Onze gameplay verwacht het omgekeerd (FIELD_W langs x, FIELD_L
        // langs z).  Zonder rotatie zat de camera op [0, 25, 70] = z=70
        // voorbij de korte as = ACHTER een GLB-doel in plaats van langs de
        // sideline (zie 4.png — pitch foreshortens dramatisch in de verte
        // omdat we langs de lengte kijken).  rotateY(π/2) draait de GLB 90°
        // zodat z↔x verwisselen → step-2 correction wordt min(115/110,
        // 73/68) = 1.045 → visible pitch 115×71 ≈ FIELD_W × FIELD_L → camera
        // op z=70 staat nu écht voorbij de sideline → beide doelen
        // zichtbaar aan canvas links/rechts (3.png-stijl).
        rotateY: Math.PI / 2,
        cameraPos: [0, 25, 70],
        cameraLookAt: [0, 0, 0],
        cameraFov: 55,
        cameraCutaway: true,
    },
    // ↓ Voeg hier nieuwe stadions toe ↓
];

const STADIUM_STORAGE_KEY = 'pitchRoyale.stadium';
function getSelectedStadium() {
    let id = null;
    try { id = localStorage.getItem(STADIUM_STORAGE_KEY); } catch (_) {}
    return STADIUMS.find(s => s.id === id) || STADIUMS[0];
}
function setSelectedStadium(id) {
    if (!STADIUMS.find(s => s.id === id)) return;
    try { localStorage.setItem(STADIUM_STORAGE_KEY, id); } catch (_) {}
}

// ----------- DOM helpers -----------
const $ = (id) => document.getElementById(id);
const screens = ['loading-screen','launch-screen','setup-screen','coin-screen','game-screen','over-screen','stadium-screen'];
const SCREEN_TO_DOM = {
    loading: 'loading-screen',
    launch:  'launch-screen',
    setup:   'setup-screen',
    coin:    'coin-screen',
    playing: 'game-screen',
    over:    'over-screen',
    stadium: 'stadium-screen',
};
function showScreen(id) {
    screens.forEach(s => $(s)?.classList.toggle('active', s === id));
}

// History-API navigation. Each forward call pushes a state so the browser
// back button can walk back through screens. We deliberately do NOT change
// the URL — passing '' to {push,replace}State keeps the URL clean (no
// '#screen' fragment) while still recording a navigation entry that
// popstate can read via e.state.screen.
function gotoScreen(target, { replace = false } = {}) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    if (STATE.screen === 'stadium' && target !== 'stadium') { STADIUM_PREVIEW?.detach(); stopTimecode(); }
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
    const stateObj = { screen: target };
    // Explicitly pass the path-without-hash so Chrome strips an existing
    // '#launch' / '#game' fragment instead of preserving it (the empty-string
    // shortcut keeps the base URL's fragment).
    const cleanUrl = location.pathname + location.search;
    if (replace) history.replaceState(stateObj, '', cleanUrl);
    else         history.pushState(stateObj, '', cleanUrl);
}

function navigateToFromPopState(target) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    if (STATE.screen === 'stadium' && target !== 'stadium') { STADIUM_PREVIEW?.detach(); stopTimecode(); }
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
}

// ----------- screen flow -----------
document.addEventListener('DOMContentLoaded', () => {
    bindLaunch();
    bindSetup();
    bindCoin();
    bindOver();
    bindPause();
    bindStadium();
    updateLaunchStadiumLabel();
    window.addEventListener('keydown', (e) => {
        if (STATE.screen === 'launch' && (e.code === 'Space' || e.code === 'Enter')) {
            goToSetup();
        }
    });

    // loading screen → launch after the rolling-ball animation has played a full cycle
    setTimeout(() => {
        if (STATE.screen === 'loading') {
            // 'launch' becomes the base history state — pressing back from any
            // future screen eventually lands here, then exits the page.
            gotoScreen('launch', { replace: true });
        }
    }, 2200);

    // initial history entry so popstate has somewhere to land — also actively
    // strips any '#launch' / '#game' fragment the user may have arrived with
    // (bookmark, hand-typed URL, or the previous hash-based version of the app).
    history.replaceState({ screen: 'loading' }, '', location.pathname + location.search);

    // browser back / forward → navigate to the recorded screen
    window.addEventListener('popstate', (e) => {
        const target = (e.state && e.state.screen) || 'launch';
        navigateToFromPopState(target);
    });
});

// ----------- LAUNCH -----------
function bindLaunch() {
    // the entire poster is one big call-to-action — click anywhere to enter…
    $('launch-screen').addEventListener('click', () => {
        if (STATE.screen === 'launch') goToSetup();
    });
    // …except clicks on the Stadion meta-block, which open the picker instead
    const pick = $('launch-stadium-pick');
    pick?.addEventListener('click', (e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        openStadiumPicker();
    });
}
function updateLaunchStadiumLabel() {
    const lbl = $('launch-stadium-name');
    if (lbl) lbl.textContent = getSelectedStadium().name;
}
function goToSetup() {
    gotoScreen('setup');
}

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

// ----------- SETUP -----------
function bindSetup() {
    const p1Input = $('p1-name');
    const p2Input = $('p2-name');
    const submit = $('to-coin');

    const refreshSubmit = () => {
        submit.disabled = false;
    };
    // toggle a `has-value` class on the wrapper for browsers without :has()
    const reflectValue = (inp) => {
        const wrap = inp.closest('.field__wrap');
        if (wrap) wrap.classList.toggle('has-value', inp.value.length > 0);
    };
    [p1Input, p2Input].forEach(inp => {
        inp.addEventListener('input', () => { reflectValue(inp); refreshSubmit(); });
        reflectValue(inp);
    });

    // mode toggle ---------------------------------------
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const mode = btn.dataset.mode;
            STATE.mode = mode;
            document.querySelectorAll('.mode-tab').forEach(b => {
                const on = b.dataset.mode === mode;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            applyMode();
            refreshSubmit();
        });
    });

    // delete / clear buttons ----------------------------
    document.querySelectorAll('.field__clear').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const target = $(btn.dataset.target);
            if (!target) return;
            target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.focus();
        });
    });

    $('swap-teams').addEventListener('click', () => {
        const tmp = STATE.p1.team;
        STATE.p1.team = STATE.p2.team;
        STATE.p2.team = tmp;
        renderRosterColors();
    });

    submit.addEventListener('click', () => {
        STATE.p1.name = (p1Input.value.trim() || 'SPELER 1').toUpperCase().slice(0, 14);
        if (STATE.mode === 'cpu') {
            STATE.p2.name = 'CPU.NOCTURNE';
        } else {
            STATE.p2.name = (p2Input.value.trim() || 'SPELER 2').toUpperCase().slice(0, 14);
        }
        // CPU never wins the toss randomly — keep it human-friendly: human always calls
        STATE.callerSide = STATE.mode === 'cpu' ? 'p1' : (Math.random() < 0.5 ? 'p1' : 'p2');
        goToCoin();
    });
}

function applyMode() {
    const cpuCard = document.querySelector('.roster-card[data-slot="p2"]');
    const cpuPanel = cpuCard?.querySelector('.roster-card__cpu');
    const p2Field = cpuCard?.querySelector('.field');
    if (!cpuCard) return;

    if (STATE.mode === 'cpu') {
        cpuCard.classList.add('is-cpu');
        if (cpuPanel) cpuPanel.hidden = false;
        // also update the "Controls" meta line to read CPU
        const metaCtrl = cpuCard.querySelectorAll('.roster-card__meta .v')[1];
        if (metaCtrl) metaCtrl.textContent = 'AUTONOMOUS';
    } else {
        cpuCard.classList.remove('is-cpu');
        if (cpuPanel) cpuPanel.hidden = true;
        const metaCtrl = cpuCard.querySelectorAll('.roster-card__meta .v')[1];
        if (metaCtrl) metaCtrl.textContent = 'PIJLEN · ENTER';
    }
}

function renderRosterColors() {
    // re-skin the two cards to reflect current team assignments
    const cardP1 = document.querySelector('#setup-screen .roster-card:nth-of-type(1)');
    const cardP2 = document.querySelector('#setup-screen .roster-card:nth-of-type(3)');
    // p1 is always the LEFT card; just toggle red/blue class
    cardP1.classList.toggle('roster-card--red', STATE.p1.team === 1);
    cardP1.classList.toggle('roster-card--blue', STATE.p1.team === 2);
    cardP2.classList.toggle('roster-card--red', STATE.p2.team === 1);
    cardP2.classList.toggle('roster-card--blue', STATE.p2.team === 2);

    // update labels too
    const labelP1 = cardP1.querySelector('.roster-card__meta .v');
    const labelP2 = cardP2.querySelector('.roster-card__meta .v');
    if (labelP1) labelP1.textContent = STATE.p1.team === 1 ? 'Rood' : 'Blauw';
    if (labelP2) labelP2.textContent = STATE.p2.team === 1 ? 'Rood' : 'Blauw';

    const crestP1 = cardP1.querySelector('.roster-card__crest span');
    const crestP2 = cardP2.querySelector('.roster-card__crest span');
    if (crestP1) crestP1.textContent = STATE.p1.team === 1 ? 'R' : 'B';
    if (crestP2) crestP2.textContent = STATE.p2.team === 1 ? 'R' : 'B';

    const tagP1 = cardP1.querySelector('.roster-card__tag');
    const tagP2 = cardP2.querySelector('.roster-card__tag');
    if (tagP1) tagP1.textContent = STATE.p1.team === 1 ? 'THUIS' : 'UIT';
    if (tagP2) tagP2.textContent = STATE.p2.team === 1 ? 'THUIS' : 'UIT';
}

// ----------- COIN -----------
function bindCoin() {
    $('pick-heads').addEventListener('click', () => callCoin('heads'));
    $('pick-tails').addEventListener('click', () => callCoin('tails'));
    $('kickoff-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });
}

function goToCoin() {
    // reset coin UI
    const callerEl = $('coin-caller-name');
    callerEl.textContent = STATE.callerSide === 'p1' ? STATE.p1.name : STATE.p2.name;

    const coin = $('coin3d');
    coin.classList.remove('flipping','land-heads','land-tails');
    coin.style.removeProperty('--final-rot');
    $('coin-result').classList.remove('show');
    $('coin-result').querySelector('.coin-result__line').textContent = '';
    $('coin-result').querySelector('.coin-result__text').textContent = '';
    $('kickoff-btn').hidden = true;
    document.querySelectorAll('.pick-btn').forEach(b => {
        b.disabled = false;
        b.classList.remove('chosen');
    });

    gotoScreen('coin');
}

function tossCoin() {
    // Use crypto when available — every flip is a fresh, unbiased bit.
    if (window.crypto && window.crypto.getRandomValues) {
        const buf = new Uint8Array(1);
        window.crypto.getRandomValues(buf);
        return (buf[0] & 1) === 0 ? 'heads' : 'tails';
    }
    return Math.random() < 0.5 ? 'heads' : 'tails';
}

function callCoin(choice) {
    const result = tossCoin();
    const won = choice === result;

    const buttons = document.querySelectorAll('.pick-btn');
    buttons.forEach(b => b.disabled = true);
    document.getElementById(choice === 'heads' ? 'pick-heads' : 'pick-tails').classList.add('chosen');

    const coin = $('coin3d');
    coin.style.setProperty('--final-rot', result === 'heads' ? '3600deg' : '3780deg');
    coin.classList.add('flipping');

    setTimeout(() => {
        coin.classList.remove('flipping');
        coin.classList.add(result === 'heads' ? 'land-heads' : 'land-tails');

        const resultEl = $('coin-result');
        const callerName = STATE.callerSide === 'p1' ? STATE.p1.name : STATE.p2.name;
        const otherName  = STATE.callerSide === 'p1' ? STATE.p2.name : STATE.p1.name;
        const winnerName = won ? callerName : otherName;
        const choiceLabel = choice === 'heads' ? 'KOP' : 'MUNT';
        const resultLabel = result === 'heads' ? 'KOP' : 'MUNT';

        resultEl.querySelector('.coin-result__line').textContent =
            `JIJ KOOS ${choiceLabel} · UITKOMST ${resultLabel}`;
        resultEl.querySelector('.coin-result__text').textContent =
            `${winnerName} krijgt de aftrap`;
        resultEl.classList.add('show');

        if (won) {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p1.team : STATE.p2.team;
        } else {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p2.team : STATE.p1.team;
        }

        $('kickoff-btn').hidden = false;
    }, 3000);
}

// ----------- GAME OVER -----------
function bindOver() {
    $('play-again').addEventListener('click', (e) => {
        e.currentTarget.blur();
        teardownGame();
        STATE.score1 = 0; STATE.score2 = 0;
        STATE.callerSide = STATE.mode === 'cpu' ? 'p1' : (Math.random() < 0.5 ? 'p1' : 'p2');
        goToCoin();
    });
    $('back-home').addEventListener('click', (e) => {
        e.currentTarget.blur();
        teardownGame();
        STATE.score1 = 0; STATE.score2 = 0;
        // collapse the history stack — going back from launch leaves the page
        gotoScreen('launch', { replace: true });
    });
}

// =====================================================
// THREE.JS GAME
// =====================================================
let scene, camera, renderer, animationId;
let team1Players = [], team2Players = [];
let ball;
let controlledP1, controlledP2;     // human-controlled veldspelers
const keys = {};

function startGame() {
    STATE.paused = false;
    gotoScreen('playing');

    // hud names + colors
    paintHud();

    initThree();
    runKickoffCountdown(() => {
        STATE.gameStartTime = Date.now();
        STATE.inputLocked = false;
    });
}

// ----------- pause -----------
let pauseFreezeStart = 0;
function togglePause(force) {
    if (STATE.screen !== 'playing') return;
    const next = (force === undefined) ? !STATE.paused : !!force;
    if (next === STATE.paused) return;

    STATE.paused = next;
    const overlay = $('pause-overlay');
    if (overlay) overlay.hidden = !next;

    if (next) {
        // remember when we paused so the game timer can be paused too
        pauseFreezeStart = Date.now();
        // wipe held keys so they don't auto-fire on resume
        clearAllKeys();
    } else {
        // shift the start time forward by the paused duration
        if (STATE.gameStartTime && pauseFreezeStart) {
            STATE.gameStartTime += (Date.now() - pauseFreezeStart);
        }
        pauseFreezeStart = 0;
    }
}

function bindPause() {
    const btn = $('pause-btn');
    if (btn) btn.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
    const resume = $('pause-resume');
    if (resume) resume.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(false); });

    // P or ESC anywhere during play
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (STATE.screen !== 'playing') return;
        if (e.code === 'KeyP' || e.code === 'Escape') {
            e.preventDefault();
            togglePause();
        }
    });
}

function paintHud() {
    // HUD halves are visually fixed: red on the left, blue on the right.
    const redPlayer  = STATE.p1.team === 1 ? STATE.p1 : STATE.p2;
    const bluePlayer = STATE.p1.team === 2 ? STATE.p1 : STATE.p2;
    $('hud-p1-name').textContent = redPlayer.name;
    $('hud-p2-name').textContent = bluePlayer.name;

    // Controls hint
    if (STATE.mode === 'cpu') {
        // human always uses WASD/Pijlen + SPATIE; CPU has no controls
        $('hud-controls-p1').textContent = STATE.p1.name + ' · ' + (STATE.p1.team === 1 ? 'ROOD' : 'BLAUW');
        const p2Col = document.querySelector('.hud-controls__col--blue');
        if (p2Col) {
            p2Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p2">CPU.NOCTURNE · ${STATE.p2.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <span class="hud-controls__cpu-dot"></span>
                <span class="hud-controls__plus">AUTONOMOUS</span>
            `;
        }
        // also: in CPU mode, P1 may use either WASD or arrows -> reflect
        const p1Col = document.querySelector('.hud-controls__col--red');
        if (p1Col) {
            p1Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p1">${STATE.p1.name} · ${STATE.p1.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span class="hud-controls__or">/</span>
                <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
                <span class="hud-controls__plus">+</span>
                <kbd>SPATIE</kbd>
                <span class="hud-controls__hint">houd = harder · <kbd>Q</kbd>/<kbd>⇧</kbd> = pass / vraag</span>
            `;
        }
    } else {
        $('hud-controls-p1').textContent = STATE.p1.name + ' · ' + (STATE.p1.team === 1 ? 'ROOD' : 'BLAUW');
        $('hud-controls-p2').textContent = STATE.p2.name + ' · ' + (STATE.p2.team === 1 ? 'ROOD' : 'BLAUW');
    }
}

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

// ----------- kickoff countdown -----------
function runKickoffCountdown(done) {
    const overlay = $('kickoff-overlay');
    const num = $('kickoff-num');
    const seq = ['3','2','1','GO!'];
    let i = 0;
    overlay.hidden = false;
    num.textContent = seq[0];
    // re-trigger animation each step
    const tick = () => {
        num.textContent = seq[i];
        num.style.animation = 'none';
        // force reflow
        void num.offsetWidth;
        num.style.animation = 'kickoff-num 1s ease-out';
        i++;
        if (i < seq.length) {
            setTimeout(tick, 850);
        } else {
            setTimeout(() => {
                overlay.hidden = true;
                done && done();
            }, 600);
        }
    };
    tick();
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
