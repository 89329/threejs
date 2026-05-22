// =====================================================
// PITCH ROYALE — UI systems
// Launch, setup, coin, pause, over and HUD bindings
// =====================================================

// ----------- LAUNCH -----------
// The launch screen uses img/new.png as a cover-fit background. The poster has
// two buttons painted on it ("Betreed het stadion" and "Bekijk stadion"). We
// translate clicks back into the poster's own coordinate space so each painted
// button stays clickable at any viewport size / aspect ratio.
const POSTER_ASPECT = 1920 / 1080;
// Normalized region (0–1) within the poster image for "Bekijk stadion":
const POSTER_BTN_STADIUM_PICK = { x0: 0.04, x1: 0.26, y0: 0.78, y1: 0.86 };
// Set to true to see the hit zone outlined on screen
const POSTER_HITBOX_DEBUG = true;

function posterImageRect(screenEl) {
    const rect = screenEl.getBoundingClientRect();
    const viewportAspect = rect.width / rect.height;
    let imgW, imgH, offX, offY;
    if (viewportAspect > POSTER_ASPECT) {
        imgW = rect.width;
        imgH = rect.width / POSTER_ASPECT;
        offX = 0;
        offY = (rect.height - imgH) / 2;
    } else {
        imgH = rect.height;
        imgW = rect.height * POSTER_ASPECT;
        offX = (rect.width - imgW) / 2;
        offY = 0;
    }
    return { imgW, imgH, offX, offY, rect };
}

function paintPosterHitboxes(screenEl) {
    if (!POSTER_HITBOX_DEBUG) return;
    let box = screenEl.querySelector('.poster-hitbox-debug');
    if (!box) {
        box = document.createElement('div');
        box.className = 'poster-hitbox-debug';
        Object.assign(box.style, {
            position: 'absolute',
            pointerEvents: 'none',
            border: '2px solid #22d3ee',
            background: 'rgba(34, 211, 238, 0.18)',
            zIndex: '4',
            boxShadow: '0 0 18px rgba(34, 211, 238, 0.55)'
        });
        screenEl.appendChild(box);
    }
    const { imgW, imgH, offX, offY } = posterImageRect(screenEl);
    const b = POSTER_BTN_STADIUM_PICK;
    box.style.left   = (offX + b.x0 * imgW) + 'px';
    box.style.top    = (offY + b.y0 * imgH) + 'px';
    box.style.width  = ((b.x1 - b.x0) * imgW) + 'px';
    box.style.height = ((b.y1 - b.y0) * imgH) + 'px';
}

function bindLaunch() {
    const screen = $('launch-screen');
    screen.addEventListener('click', (e) => {
        if (STATE.screen !== 'launch') return;
        const { imgW, imgH, offX, offY, rect } = posterImageRect(e.currentTarget);
        const nx = (e.clientX - rect.left - offX) / imgW;
        const ny = (e.clientY - rect.top - offY) / imgH;
        const b = POSTER_BTN_STADIUM_PICK;
        if (nx >= b.x0 && nx <= b.x1 && ny >= b.y0 && ny <= b.y1) {
            openStadiumPicker();
        } else {
            goToSetup();
        }
    });
    paintPosterHitboxes(screen);
    window.addEventListener('resize', () => paintPosterHitboxes(screen));
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
    const p2Input = $('p2-name');
    if (!cpuCard) return;

    if (STATE.mode === 'cpu') {
        cpuCard.classList.add('is-cpu');
        if (cpuPanel) cpuPanel.hidden = false;
        if (p2Field) p2Field.hidden = true;
        if (p2Input) {
            p2Input.disabled = true;
            p2Input.value = '';
        }
        // also update the "Controls" meta line to read CPU
        const metaCtrl = cpuCard.querySelectorAll('.roster-card__meta .v')[1];
        if (metaCtrl) metaCtrl.textContent = 'AUTONOMOUS';
    } else {
        cpuCard.classList.remove('is-cpu');
        if (cpuPanel) cpuPanel.hidden = true;
        if (p2Field) p2Field.hidden = false;
        if (p2Input) p2Input.disabled = false;
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

    const p1Col = document.querySelector('.hud-controls__col--red');
    const p2Col = document.querySelector('.hud-controls__col--blue');

    // Controls hint
    if (STATE.mode === 'cpu') {
        // human always uses WASD/Pijlen + SPATIE; CPU has no controls
        if (p2Col) {
            p2Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p2">CPU.NOCTURNE · ${STATE.p2.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <span class="hud-controls__cpu-dot"></span>
                <span class="hud-controls__plus">AUTONOMOUS</span>
            `;
        }
        // also: in CPU mode, P1 may use either WASD or arrows -> reflect
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
        if (p1Col) {
            p1Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p1">${STATE.p1.name} · ${STATE.p1.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span class="hud-controls__plus">+</span>
                <kbd>SPATIE</kbd>
                <span class="hud-controls__hint">houd = harder · <kbd>Q</kbd> = pass / vraag</span>
            `;
        }
        if (p2Col) {
            p2Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p2">${STATE.p2.name} · ${STATE.p2.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
                <span class="hud-controls__plus">+</span>
                <kbd>ENTER</kbd>
                <span class="hud-controls__hint">houd = harder · <kbd>⇧</kbd> = pass / vraag</span>
            `;
        }
    }
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
