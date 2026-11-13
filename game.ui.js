// =====================================================
// PITCH ROYALE — UI systems
// Launch, setup, coin, pause, over and HUD bindings
// =====================================================

// ----------- TOUCH DEVICES -----------
// Phones and tablets get on-screen controls and play against the computer
// (there is no second keyboard). ?touch in the URL forces it on a desktop.
const IS_TOUCH = (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches)
    || new URLSearchParams(location.search).has('touch');
if (IS_TOUCH) document.documentElement.classList.add('is-touch');

// ----------- LAUNCH -----------
function bindLaunch() {
    if (IS_TOUCH) setMode('cpu');
    $('launch-cta').addEventListener('click', () => { setMode('duo'); goToSetup(); });
    $('launch-cpu').addEventListener('click', () => { setMode('cpu'); goToSetup(); });
    $('launch-stadium-pick').addEventListener('click', openStadiumPicker);
    updateLaunchLevelLabel();

    // "Terug" in the top bar of the setup and toss screens
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => history.back());
    });
}
function updateLaunchStadiumLabel() {
    const lbl = $('launch-stadium-name');
    if (lbl) lbl.textContent = getSelectedStadium().name;
}
function updateLaunchLevelLabel() {
    const lbl = $('launch-cpu-level');
    if (lbl) lbl.textContent = getLevel().label;
}
function goToSetup() {
    gotoScreen('setup');
}


// ----------- SETUP -----------
function bindSetup() {
    const p1Input = $('p1-name');
    const p2Input = $('p2-name');
    const submit = $('to-coin');

    // mode toggle ---------------------------------------
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    renderLevels();

    $('swap-teams').addEventListener('click', () => {
        const tmp = STATE.p1.team;
        STATE.p1.team = STATE.p2.team;
        STATE.p2.team = tmp;
        renderRosterColors();
    });

    // Enter in a name field continues to the toss
    [p1Input, p2Input].forEach(inp => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit.click();
        });
    });

    submit.addEventListener('click', () => {
        STATE.p1.name = (p1Input.value.trim() || 'Speler 1').slice(0, 14);
        if (STATE.mode === 'cpu') {
            STATE.p2.name = 'Computer';
        } else {
            STATE.p2.name = (p2Input.value.trim() || 'Speler 2').slice(0, 14);
        }
        // CPU never wins the toss randomly — keep it human-friendly: human always calls
        STATE.callerSide = STATE.mode === 'cpu' ? 'p1' : (Math.random() < 0.5 ? 'p1' : 'p2');
        goToCoin();
    });

    $('level-list')?.addEventListener('keydown', (e) => {
        const ids = Object.keys(LEVELS);
        const step = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = ids[(ids.indexOf(STATE.difficulty) + step + ids.length) % ids.length];
        setLevel(next);
        renderLevels();
        updateLaunchLevelLabel();
        $('level-list').querySelector(`[data-level="${next}"]`)?.focus();
    });

    renderRosterColors();
    applyMode();
}

// Two players or against the computer: from the start screen or the tabs.
function setMode(mode) {
    STATE.mode = mode === 'cpu' ? 'cpu' : 'duo';
    document.querySelectorAll('.mode-tab').forEach(b => {
        const on = b.dataset.mode === STATE.mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    applyMode();
}

// The three levels, one row each, built once from LEVELS and then re-flagged.
function renderLevels() {
    const list = $('level-list');
    if (!list) return;
    if (!list.children.length) {
        Object.entries(LEVELS).forEach(([id, lvl]) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'level__btn';
            row.dataset.level = id;
            row.setAttribute('role', 'radio');
            const name = document.createElement('span');
            name.className = 'level__name';
            name.textContent = lvl.label;
            const desc = document.createElement('span');
            desc.className = 'level__desc';
            desc.textContent = lvl.desc;
            row.append(name, desc);
            row.addEventListener('click', () => {
                setLevel(id);
                renderLevels();
                updateLaunchLevelLabel();
            });
            list.appendChild(row);
        });
    }
    [...list.children].forEach(row => {
        const on = row.dataset.level === STATE.difficulty;
        row.setAttribute('aria-checked', on ? 'true' : 'false');
        row.tabIndex = on ? 0 : -1;
    });
}

function applyMode() {
    const cpu = STATE.mode === 'cpu';
    const human = $('p2-human');
    const bot = $('p2-cpu');
    const p2Input = $('p2-name');
    const p1Alt = $('p1-keys-alt');
    if (human) human.hidden = cpu;
    if (bot) bot.hidden = !cpu;
    if (p2Input) p2Input.disabled = cpu;
    if (p1Alt) p1Alt.hidden = !cpu;
}

function renderRosterColors() {
    // P1 is always the left card, P2 the right one; only the colours swap
    [['card-p1', STATE.p1], ['card-p2', STATE.p2]].forEach(([id, player]) => {
        const card = $(id);
        if (!card) return;
        const red = player.team === 1;
        card.dataset.team = red ? 'red' : 'blue';
        const side = card.querySelector('.team-card__side');
        const color = card.querySelector('.team-card__color');
        if (side) side.textContent = red ? 'Thuis' : 'Uit';
        if (color) color.textContent = red ? 'Rood' : 'Blauw';
    });
}

// ----------- COIN -----------
// must match the coin-toss animation duration in styles.css
const COIN_FLIP_MS = 2400;

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
        const choiceLabel = choice === 'heads' ? 'kop' : 'munt';
        const resultLabel = result === 'heads' ? 'kop' : 'munt';

        resultEl.querySelector('.coin-result__line').textContent =
            `Gekozen: ${choiceLabel}. Het is ${resultLabel}.`;
        resultEl.querySelector('.coin-result__text').textContent =
            `${winnerName} trapt af`;
        resultEl.classList.add('show');

        if (won) {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p1.team : STATE.p2.team;
        } else {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p2.team : STATE.p1.team;
        }

        $('kickoff-btn').hidden = false;
    }, COIN_FLIP_MS);
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
    resetTouch();
    gotoScreen('playing');

    // hud names + colors
    paintHud();

    initThree();
    runKickoffCountdown(() => {
        STATE.gameStartTime = Date.now();
        STATE.inputLocked = false;
        // started with the phone upright: wait until it is turned
        if (IS_TOUCH && isPortrait()) togglePause(true);
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

// ----------- HUD -----------
// Fills one key-legend panel: player name, then [keys] + label groups.
function fillHudKeys(el, player, groups, note) {
    if (!el) return;
    el.replaceChildren();
    el.dataset.team = player.team === 1 ? 'red' : 'blue';

    const who = document.createElement('span');
    who.className = 'hud-keys__who';
    who.textContent = player.name;
    el.appendChild(who);

    groups.forEach(([keyCaps, label]) => {
        const group = document.createElement('span');
        group.className = 'hud-keys__group';
        keyCaps.forEach(cap => {
            const kbd = document.createElement('kbd');
            kbd.textContent = cap;
            group.appendChild(kbd);
        });
        const lbl = document.createElement('span');
        lbl.className = 'hud-keys__label';
        lbl.textContent = label;
        group.appendChild(lbl);
        el.appendChild(group);
    });

    if (note) {
        const n = document.createElement('span');
        n.className = 'hud-keys__label';
        n.textContent = note;
        el.appendChild(n);
    }
}

function paintHud() {
    // Scoreboard halves are fixed: red on the left, blue on the right.
    const redPlayer  = STATE.p1.team === 1 ? STATE.p1 : STATE.p2;
    const bluePlayer = STATE.p1.team === 2 ? STATE.p1 : STATE.p2;
    $('hud-p1-name').textContent = redPlayer.name;
    $('hud-p2-name').textContent = bluePlayer.name;

    // Key legends follow the keyboard instead: P1 (WASD) left, P2 (arrows) right.
    const cpu = STATE.mode === 'cpu';
    fillHudKeys($('hud-keys-p1'), STATE.p1, [
        [['W', 'A', 'S', 'D'], cpu ? 'of pijltjes' : 'bewegen'],
        [['Spatie'], 'schieten'],
        [['Q'], 'terugspelen'],
    ]);
    fillHudKeys($('hud-keys-p2'), STATE.p2, cpu ? [] : [
        [['↑', '←', '↓', '→'], 'bewegen'],
        [['Enter'], 'schieten'],
        [['Shift'], 'terugspelen'],
    ], cpu ? `niveau ${getLevel().label.toLowerCase()}` : '');
}

// ----------- kickoff countdown -----------
function runKickoffCountdown(done) {
    const overlay = $('kickoff-overlay');
    const num = $('kickoff-num');
    const seq = ['3','2','1','Hup!'];
    let i = 0;
    overlay.hidden = false;
    num.textContent = seq[0];
    // re-trigger animation each step
    const tick = () => {
        num.textContent = seq[i];
        num.classList.toggle('is-word', !/^\d+$/.test(seq[i]));
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


// ----------- TOUCH CONTROLS -----------
// Left half of the pitch: a stick that appears under your thumb. Right: Schiet
// (hold to charge, release to shoot, exactly like the space bar) and Pass (the
// Q key: back to your keeper, or ask him for the ball). The stick is analogue;
// movePlayer() reads touchMove for player 1.
const touchMove = { active: false, x: 0, z: 0 };
const STICK_TRAVEL = 52;        // px the knob can move from the centre
const STICK_DEAD = 0.18;        // ignore tiny movements of the thumb

function isPortrait() {
    return window.matchMedia ? matchMedia('(orientation: portrait)').matches : window.innerHeight > window.innerWidth;
}

function resetTouch() {
    touchMove.active = false;
    touchMove.x = touchMove.z = 0;
    const stick = $('touch-stick'), knob = $('touch-knob');
    if (stick) { stick.style.left = ''; stick.style.top = ''; stick.classList.remove('is-held'); }
    if (knob) knob.style.transform = '';
    ['touch-shoot', 'touch-pass'].forEach(id => $(id)?.classList.remove('is-down'));
    $('touch-shoot')?.style.removeProperty('--charge');
}

function bindTouch() {
    if (!IS_TOUCH) return;
    const zone = $('touch-zone'), stick = $('touch-stick'), knob = $('touch-knob');
    const shoot = $('touch-shoot'), pass = $('touch-pass');
    if (!zone || !stick || !knob || !shoot || !pass) return;

    // ---- the stick ----
    let stickId = null, cx = 0, cy = 0;
    const moveStick = (e) => {
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_TRAVEL) { dx = dx / d * STICK_TRAVEL; dy = dy / d * STICK_TRAVEL; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        // screen right is +x, screen down is +z (towards the camera)
        touchMove.x = dx / STICK_TRAVEL;
        touchMove.z = dy / STICK_TRAVEL;
        touchMove.active = Math.hypot(touchMove.x, touchMove.z) > STICK_DEAD;
    };
    zone.addEventListener('pointerdown', (e) => {
        if (stickId !== null) return;
        e.preventDefault();
        stickId = e.pointerId;
        try { zone.setPointerCapture(stickId); } catch (_) {}   // keeps the thumb's moves when it leaves the zone
        const r = zone.getBoundingClientRect();
        cx = e.clientX; cy = e.clientY;
        stick.style.left = `${cx - r.left}px`;
        stick.style.top = `${cy - r.top}px`;
        stick.classList.add('is-held');
        moveStick(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
    const releaseStick = (e) => {
        if (e.pointerId !== stickId) return;
        stickId = null;
        touchMove.active = false;
        touchMove.x = touchMove.z = 0;
        knob.style.transform = '';
        stick.style.left = '';
        stick.style.top = '';
        stick.classList.remove('is-held');
    };
    zone.addEventListener('pointerup', releaseStick);
    zone.addEventListener('pointercancel', releaseStick);

    // ---- the buttons: each acts as its key while a finger is on it ----
    const hold = (btn, code, onDown, onUp) => {
        let id = null;
        btn.addEventListener('pointerdown', (e) => {
            if (id !== null) return;
            e.preventDefault();
            id = e.pointerId;
            try { btn.setPointerCapture(id); } catch (_) {}
            btn.classList.add('is-down');
            keys[code] = true;
            keysPressed[code] = true;
            onDown?.();
        });
        const up = (e) => {
            if (e.pointerId !== id) return;
            id = null;
            btn.classList.remove('is-down');
            keys[code] = false;
            onUp?.();
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    // Schiet fills a ring while it charges, so you can see how hard it will be
    let chargeRaf = 0, chargeStart = 0;
    const paintCharge = () => {
        const t = Math.min(1, (performance.now() - chargeStart) / CHARGE_MAX_MS);
        shoot.style.setProperty('--charge', t.toFixed(3));
        chargeRaf = t < 1 ? requestAnimationFrame(paintCharge) : 0;
    };
    hold(shoot, 'Space',
        () => { chargeStart = performance.now(); cancelAnimationFrame(chargeRaf); paintCharge(); },
        () => { cancelAnimationFrame(chargeRaf); chargeRaf = 0; shoot.style.removeProperty('--charge'); });
    hold(pass, 'KeyQ');

    // turning the phone upright mid-match pauses it
    if (window.matchMedia) {
        matchMedia('(orientation: portrait)').addEventListener?.('change', (e) => {
            if (e.matches && STATE.screen === 'playing' && !STATE.inputLocked) {
                resetTouch();
                togglePause(true);
            }
        });
    }
}
