// =====================================================
// PITCH ROYALE
// Core state/config/navigation bootstrap
// =====================================================

// Cache-bust marker: bump GAME_BUILD on every change so we can verify
// the live site is actually serving the latest game.js. If this string
// doesn't show up in DevTools console after a refresh, the browser /
// GitHub Pages CDN is still serving an older cached copy.
const GAME_BUILD = 'v76-scoreboard-menus (2026-11-13)';
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
// `pitch` says where the lines of the model's pitch are; see fitStadiumToPitch().
const STADIUMS = [
    {
        id: 'camp-nou',
        name: 'Camp Nou',
        club: 'FC Barcelona',
        city: 'Barcelona',
        file: 'media/models/stadiums/camp_nou_stadium.glb',
        capacity: '99.354',
        pitch: { x: -6.7, z: 0.24, w: 113.75, l: 78, angle: 1.202, y: 0.11 },
    },
    {
        id: 'old-trafford',
        name: 'Old Trafford',
        club: 'Manchester United',
        city: 'Manchester',
        file: 'media/models/stadiums/old_trafford.glb',
        capacity: '74.310',
        pitch: { x: -6.9, z: 13.98, w: 74.45, l: 47.84, angle: 0, y: 8.42 },
    },
    {
        id: 'etihad',
        name: 'Etihad Stadium',
        club: 'Manchester City',
        city: 'Manchester',
        file: 'media/models/stadiums/ETIHAD STADIUM.glb',
        capacity: '53.400',
        pitch: { x: -0.66, z: 0.69, w: 85.5, l: 55.46, angle: 1.397, y: 17.03 },
    },
    {
        id: 'anfield',
        name: 'Anfield',
        club: 'Liverpool FC',
        city: 'Liverpool',
        file: 'media/models/stadiums/anfield_stadium.glb',
        capacity: '61.276',
        // scan of the whole neighbourhood; the stadium is a small part of it
        pitch: { x: 14.53, z: 21.07, w: 65.3, l: 43.9, angle: -0.78, y: 18.39 },
    },
    {
        id: 'emirates',
        name: 'Emirates Stadium',
        club: 'Arsenal',
        city: 'Londen',
        file: 'media/models/stadiums/emirates-stadium (1)/source/untitled.glb',
        capacity: '60.704',
        pitch: { x: 1.17, z: 0.74, w: 107.4, l: 69.8, angle: -1.542, y: 9.08 },
    },
    {
        id: 'wanda-metropolitano',
        name: 'Wanda Metropolitano',
        club: 'Atlético Madrid',
        city: 'Madrid',
        file: 'media/models/stadiums/wanda_metropolitano_stadium.glb',
        capacity: '70.460',
        pitch: { x: -4.1, z: -5.5, w: 37, l: 24, angle: 0.305, y: 4.83, own: true },
    },
    {
        id: 'la-bombonera',
        name: 'La Bombonera',
        club: 'Boca Juniors',
        city: 'Buenos Aires',
        file: 'media/models/stadiums/la_bombonera_boca_juniors.glb',
        capacity: '54.000',
        pitch: { x: 29.63, z: -3.8, w: 110.9, l: 67.45, angle: 1.571, y: 9.14 },
    },
    {
        id: 'otkritie-arena',
        name: 'Otkritie Arena',
        club: 'Spartak Moskou',
        city: 'Moskou',
        file: 'media/models/stadiums/otkritie_arena.glb',
        capacity: '45.360',
        // night-time scan: its grass is near black and full of holes
        pitch: { x: 5.2, z: -3.3, w: 54.7, l: 36.4, angle: 1.571, y: 9.76, own: true },
    },
    {
        id: 'home-park',
        name: 'Home Park',
        club: 'Plymouth Argyle',
        city: 'Plymouth',
        file: 'media/models/stadiums/plymouth_argyle_-_home_park.glb',
        capacity: '17.900',
        pitch: { x: -9.33, z: -5.63, w: 82.8, l: 52.95, angle: 1.587, y: 10.99 },
    },
    {
        id: 'cheltenham',
        name: 'Cheltenham Pitch',
        club: 'Cheltenham Town',
        city: 'Cheltenham',
        file: 'media/models/stadiums/cheltenham_football_pitch.glb',
        capacity: '7.066',
        pitch: { x: -8.59, z: 4.97, w: 128.2, l: 81.6, angle: 0.912, y: 4.63 },
    },
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

function gotoScreen(target, { replace = false } = {}) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    if (STATE.screen === 'stadium' && target !== 'stadium') { STADIUM_PREVIEW?.detach(); }
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
    const stateObj = { screen: target };
    const cleanUrl = location.pathname + location.search;
    if (replace) history.replaceState(stateObj, '', cleanUrl);
    else         history.pushState(stateObj, '', cleanUrl);
}

function navigateToFromPopState(target) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    if (STATE.screen === 'stadium' && target !== 'stadium') { STADIUM_PREVIEW?.detach(); }
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
}

// ----------- screen flow -----------
const QUICK_MODE = location.pathname.endsWith('play.html');

document.addEventListener('DOMContentLoaded', () => {
    if (QUICK_MODE) {
        // Quick-play page: skip launch/setup/coin entirely, jump straight into
        // an infinite-duration match with sensible defaults. Pause still works.
        bindPause();
        STATE.p1.name = 'P1';
        STATE.p2.name = 'P2';
        STATE.mode = 'duo';
        STATE.kickoffTeam = 1;
        STATE.gameDuration = Infinity;
        history.replaceState({ screen: 'playing' }, '', location.pathname + location.search);
        startGame();
        return;
    }

    bindLaunch();
    bindSetup();
    bindCoin();
    bindOver();
    bindPause();
    bindStadium();
    updateLaunchStadiumLabel();
    window.addEventListener('keydown', (e) => {
        if (STATE.screen !== 'launch') return;
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        // a focused menu button handles its own Enter / Space
        if (e.target instanceof Element && e.target.closest('button')) return;
        goToSetup();
    });

    // short splash while the web fonts come in
    setTimeout(() => {
        if (STATE.screen === 'loading') gotoScreen('launch', { replace: true });
    }, 900);

    history.replaceState({ screen: 'loading' }, '', location.pathname + location.search);

    window.addEventListener('popstate', (e) => {
        const target = (e.state && e.state.screen) || 'launch';
        navigateToFromPopState(target);
    });
});
