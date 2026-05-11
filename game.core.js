// =====================================================
// PITCH ROYALE — Stadium Nightfall
// Core state/config/navigation bootstrap
// =====================================================

// Cache-bust marker: bump GAME_BUILD on every change so we can verify
// the live site is actually serving the latest game.js. If this string
// doesn't show up in DevTools console after a refresh, the browser /
// GitHub Pages CDN is still serving an older cached copy.
const GAME_BUILD = 'v33-etihad-broadcast-camera (2026-05-11)';
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
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
        nativePitch: true,
        pitchBrighten: 1.9,
        cutawayFrontZ: null,
        gameplayScale: 1.0,
        cameraPos: [-15, 72, 78],
        cameraLookAt: [-15, 0, 0],
        cameraFov: 58,
        cameraCutaway: false,
    },
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
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
        nativePitch: true,
        pitchBrighten: 1.9,
        cutawayFrontZ: FIELD_L / 2 + 2,
        gameplayScale: 1.0,
        visualPlayerScale: 0.55,
        rotateY: 0,
        cameraPos: [0, 44, 68],
        cameraLookAt: [0, 3, 0],
        cameraFov: 32,
        cameraCutaway: false,
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
    if (STATE.screen === 'stadium' && target !== 'stadium') { STADIUM_PREVIEW?.detach(); stopTimecode(); }
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
    const stateObj = { screen: target };
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

    setTimeout(() => {
        if (STATE.screen === 'loading') gotoScreen('launch', { replace: true });
    }, 2200);

    history.replaceState({ screen: 'loading' }, '', location.pathname + location.search);

    window.addEventListener('popstate', (e) => {
        const target = (e.state && e.state.screen) || 'launch';
        navigateToFromPopState(target);
    });
});
