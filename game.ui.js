// =====================================================
// PITCH ROYALE — UI systems
// Launch, setup, coin, pause, over and HUD bindings
// =====================================================

// ----------- LAUNCH -----------
function bindLaunch() {
    $('launch-cta').addEventListener('click', goToSetup);
    $('launch-stadium-pick').addEventListener('click', openStadiumPicker);

    // "Terug" in the top bar of the setup and toss screens
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => history.back());
    });
}
function updateLaunchStadiumLabel() {
    const lbl = $('launch-stadium-name');
    if (lbl) lbl.textContent = getSelectedStadium().name;
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
        btn.addEventListener('click', () => {
            STATE.mode = btn.dataset.mode;
            document.querySelectorAll('.mode-tab').forEach(b => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            applyMode();
        });
    });

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

    renderRosterColors();
    applyMode();
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
    ], cpu ? 'speelt vanzelf' : '');
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
