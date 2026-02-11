/**
 * Represents a single scrolling number (an "Invader").
 */
class Invader {
    constructor(value, gameArea, speedSetting) {
        this.value = value;
        this.gameArea = gameArea;
        this.y = -50; // Start off-screen

        // Ensure X position respects padding/margins for mobile width
        const availableWidth = Math.max(0, gameArea.clientWidth - 80);
        this.x = 10 + Math.random() * availableWidth;

        // Set speed based on setting (pixels per second)
        switch (speedSetting) {
            case 'easy':
                this.speed = 30 + Math.random() * 30; // 30-60 px/s
                break;
            case 'fast':
                this.speed = 110 + Math.random() * 70; // 110-180 px/s
                break;
            case 'intermediate':
            default:
                this.speed = 60 + Math.random() * 60; // 60-120 px/s
        }

        this.element = document.createElement('div');
        this.element.className = 'invader';
        this.element.textContent = this.value;
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.zIndex = '5';

        this.gameArea.appendChild(this.element);
    }

    // delta is in seconds
    update(delta) {
        this.y += this.speed * (delta || 0);
        this.element.style.top = `${this.y}px`;
    }

    isOffScreen() {
        return this.y > this.gameArea.clientHeight;
    }

    destroy() {
        if (this.element.parentElement) this.gameArea.removeChild(this.element);
    }
}

/**
 * Manages the entire game state, UI, and logic.
 */
class Game {
    constructor() {
        // DOM Element Cache
        this.settingsScreen = document.getElementById('settings-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.startGameBtn = document.getElementById('start-game');
        this.restartGameBtn = document.getElementById('restart-game');
        this.gameArea = document.getElementById('game-area');
        this.multiplierDisplay = document.getElementById('multiplier');
        this.fixedMultiplierContainer = document.getElementById('fixed-multiplier-container');

        // Keypad related elements
        this.answerDisplay = document.getElementById('answer-display');
        this.keypad = document.getElementById('keypad');

        this.scoreRightDisplay = document.getElementById('score-right');
        this.scoreWrongDisplay = document.getElementById('score-wrong');
        this.gameStatusDisplay = document.getElementById('game-status');
        this.finalScoreRight = document.getElementById('final-score-right');
        this.finalScoreWrong = document.getElementById('final-score-wrong');
        this.gameOverTitle = document.getElementById('game-over-title');
        this.gameAlert = document.getElementById('game-alert');

        // Game State
        this.settings = {};
        this.scoreRight = 0;
        this.scoreWrong = 0;
        this.multiplier = 0;
        this.invaders = [];
        this.gameLoopId = null;
        this.timerId = null;
        this.timeLeft = 0;
        this.spawnInterval = 2500;
        this.lastSpawnTime = 0;
        this.alertTimer = null;
        this.currentAnswer = '';

        // Celebration / particle related refs (kept for safe cleanup)
        this.celebrationCanvas = null;
        this.celebrationCtx = null;
        this.celebrationParticles = [];
        this.celebrationAnimId = null;
        this.celebrationTimeout = null;

        // Bind event listeners safely
        if (this.startGameBtn) this.startGameBtn.addEventListener('click', () => this.start());
        else console.warn('startGame button not found');

        if (this.restartGameBtn) this.restartGameBtn.addEventListener('click', () => this.showSettings());
        else console.warn('restartGame button not found');

        if (this.keypad) {
            this.keypad.addEventListener('click', (e) => {
                let btn = null;
                if (e.target && typeof e.target.closest === 'function') btn = e.target.closest('button');
                else if (e.target && e.target.tagName === 'BUTTON') btn = e.target;
                const key = btn ? btn.dataset.key : undefined;
                if (key) this.handleKeypadInput(key);
            });
        } else console.warn('keypad element not found');

        // Keyboard input
        document.addEventListener('keydown', (e) => {
            if (this.gameScreen && this.gameScreen.style.display === 'block') {
                const key = e.key;
                if (key >= '0' && key <= '9') this.handleKeypadInput(key);
                else if (key === 'Enter') { this.handleKeypadInput('submit'); e.preventDefault(); }
                else if (key === 'Backspace') { this.handleKeypadInput('del'); e.preventDefault(); }
            }
        });

        this.bindSettingsControls();
    }

    bindSettingsControls() {
        const modeRadios = document.querySelectorAll('input[name="mode"]');
        const timeInputContainer = document.getElementById('time-limit-container');
        const scoreInputContainer = document.getElementById('score-limit-container');
        const multiplierModeRadios = document.querySelectorAll('input[name="multiplier_mode"]');

        modeRadios.forEach(radio => radio.addEventListener('change', (e) => {
            if (e.target.value === 'time') {
                if (timeInputContainer) timeInputContainer.style.display = 'block';
                if (scoreInputContainer) scoreInputContainer.style.display = 'none';
            } else {
                if (timeInputContainer) timeInputContainer.style.display = 'none';
                if (scoreInputContainer) scoreInputContainer.style.display = 'block';
            }
        }));
        const checkedMode = document.querySelector('input[name="mode"]:checked');
        if (checkedMode) checkedMode.dispatchEvent(new Event('change'));

        multiplierModeRadios.forEach(radio => radio.addEventListener('change', (e) => {
            if (e.target.value === 'fixed') {
                if (this.fixedMultiplierContainer) this.fixedMultiplierContainer.style.display = 'block';
            } else {
                if (this.fixedMultiplierContainer) this.fixedMultiplierContainer.style.display = 'none';
            }
        }));
        const checkedMult = document.querySelector('input[name="multiplier_mode"]:checked');
        if (checkedMult) checkedMult.dispatchEvent(new Event('change'));
    }

    showSettings() {
        if (this.settingsScreen) this.settingsScreen.style.display = 'block';
        if (this.gameScreen) this.gameScreen.style.display = 'none';
        if (this.gameOverScreen) this.gameOverScreen.style.display = 'none';
        this.cleanup();
    }

    getSettings() {
        const difficultyEl = document.querySelector('input[name="difficulty"]:checked');
        const modeEl = document.querySelector('input[name="mode"]:checked');
        const speedEl = document.querySelector('input[name="speed"]:checked');
        const multiplierModeEl = document.querySelector('input[name="multiplier_mode"]:checked');

        const difficulty = difficultyEl ? difficultyEl.value : 'single';
        const mode = modeEl ? modeEl.value : 'time';
        const speed = speedEl ? speedEl.value : 'intermediate';
        const multiplierMode = multiplierModeEl ? multiplierModeEl.value : 'random';

        let timeLimit = parseInt(document.getElementById('time-limit')?.value || '60', 10);
        let scoreLimit = parseInt(document.getElementById('score-limit')?.value || '20', 10);
        let fixedMultiplier = parseInt(document.getElementById('fixed-multiplier')?.value || '7', 10);

        if (isNaN(timeLimit) || timeLimit <= 0) timeLimit = 60;
        if (isNaN(scoreLimit) || scoreLimit <= 0) scoreLimit = 20;
        if (isNaN(fixedMultiplier) || fixedMultiplier < 1) fixedMultiplier = 1;
        if (fixedMultiplier > 12) fixedMultiplier = 12;

        this.settings = { difficulty, mode, speed, multiplierMode, fixedMultiplier, limit: mode === 'time' ? timeLimit : scoreLimit };

        // Reflect clamped values
        const tEl = document.getElementById('time-limit'); if (tEl) tEl.value = timeLimit;
        const sEl = document.getElementById('score-limit'); if (sEl) sEl.value = scoreLimit;
        const fEl = document.getElementById('fixed-multiplier'); if (fEl) fEl.value = fixedMultiplier;
    }

    start() {
        this.getSettings();
        if (this.settingsScreen) this.settingsScreen.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'block';
        if (this.gameOverScreen) this.gameOverScreen.style.display = 'none';

        this.cleanup();
        this.scoreRight = 0;
        this.scoreWrong = 0;
        this.invaders = [];
        this.spawnInterval = 2500;

        this.currentAnswer = '';
        this.updateAnswerDisplay();

        this.updateScoreDisplay();
        this.setMultiplier();

        if (this.settings.mode === 'time') {
            this.timeLeft = this.settings.limit;
            this.updateStatusDisplay();
            this.timerId = setInterval(() => {
                this.timeLeft--;
                this.updateStatusDisplay();
                if (this.timeLeft <= 0) this.endGame(true);
            }, 1000);
        } else {
            this.updateStatusDisplay();
        }

        // Make first spawn immediate
        this.lastSpawnTime = Date.now() - this.spawnInterval - 1;
        this._lastFrameTime = null;
        this._loopTicks = 0;
        this.gameLoop();
    }

    cleanup() {
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        if (this.gameLoopId) { cancelAnimationFrame(this.gameLoopId); this.gameLoopId = null; }
        if (this.alertTimer) { clearTimeout(this.alertTimer); this.alertTimer = null; }

        this.gameAlert?.classList.remove('show');

        this.stopCelebration();
        this.stopWinCelebration();

        this.invaders.forEach(inv => inv.destroy());
        this.invaders = [];
    }

    setMultiplier() {
        if (this.settings.multiplierMode === 'fixed') this.multiplier = this.settings.fixedMultiplier;
        else this.multiplier = this.settings.difficulty === 'single' ? (Math.floor(Math.random() * 9) + 1) : (Math.floor(Math.random() * 12) + 1);
        if (this.multiplierDisplay) this.multiplierDisplay.textContent = `× ${this.multiplier}`;
    }

    spawnInvader() {
        let value;
        if (this.settings.difficulty === 'single') value = Math.floor(Math.random() * 9) + 1;
        else value = Math.floor(Math.random() * 90) + 10;
        const inv = new Invader(value, this.gameArea, this.settings.speed);
        this.invaders.push(inv);
        console.log('Spawned invader', value, 'x=', inv.x, 'speed=', inv.speed);
    }

    gameLoop(timestamp) {
        // timestamp from RAF (ms)
        if (!this._lastFrameTime) this._lastFrameTime = timestamp || performance.now();
        const now = timestamp || performance.now();
        const deltaMs = now - this._lastFrameTime;
        const delta = Math.min(0.1, deltaMs / 1000); // clamp

        // debug logging first few ticks
        if (this._loopTicks < 3) {
            console.log(`gameLoop tick ${this._loopTicks + 1}: delta=${delta.toFixed(3)}s invaders=${this.invaders.length}`);
            this._loopTicks++;
        }
        // update on-screen debug overlay if present
        try {
            const dbg = document.getElementById('debug-overlay');
            if (dbg) dbg.textContent = `ticks:${this._loopTicks} inv:${this.invaders.length} delta:${delta.toFixed(3)}s`;
        } catch (e) { /* ignore */ }

        const wallNow = Date.now();
        if (wallNow - this.lastSpawnTime >= this.spawnInterval) {
            this.spawnInvader();
            this.lastSpawnTime = wallNow;
            if (this.spawnInterval > 600) this.spawnInterval -= 50;
        }

        for (let i = this.invaders.length - 1; i >= 0; i--) {
            const inv = this.invaders[i];
            inv.update(delta);
            if (inv.isOffScreen()) {
                inv.destroy();
                this.invaders.splice(i, 1);
                this.scoreWrong++;
                this.updateScoreDisplay();
            }
        }

        this._lastFrameTime = now;
        this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
    }

    handleKeypadInput(key) {
        if (key >= '0' && key <= '9') {
            if (this.currentAnswer.length < 5) this.currentAnswer += key;
        } else if (key === 'del') this.currentAnswer = this.currentAnswer.slice(0, -1);
        else if (key === 'submit') this.checkAnswer();
        this.updateAnswerDisplay();
    }

    updateAnswerDisplay() {
        if (this.answerDisplay) this.answerDisplay.textContent = this.currentAnswer === '' ? '0' : this.currentAnswer;
    }

    checkAnswer() {
        if (this.currentAnswer === '') return;
        const answer = parseInt(this.currentAnswer, 10);
        let correctIndex = -1;
        for (let i = 0; i < this.invaders.length; i++) {
            const required = this.invaders[i].value * this.multiplier;
            if (required === answer) { correctIndex = i; break; }
        }

        if (correctIndex !== -1) {
            this.invaders[correctIndex].destroy();
            this.invaders.splice(correctIndex, 1);
            this.scoreRight++;
            this.updateScoreDisplay();
            this.showAlert('Correct!', 'correct');
            if (this.settings.mode === 'score' && this.scoreRight >= this.settings.limit) this.endGame(true);
        } else {
            this.scoreWrong++;
            this.updateScoreDisplay();
            this.showAlert('Wrong!', 'wrong');
        }

        this.currentAnswer = '';
        this.updateAnswerDisplay();
    }

    showAlert(message, type) {
        if (this.alertTimer) clearTimeout(this.alertTimer);
        if (this.gameAlert) {
            this.gameAlert.textContent = message;
            this.gameAlert.classList.remove('correct','wrong','show');
            this.gameAlert.classList.add(type);
            this.gameAlert.classList.add('show');
        }
        this.alertTimer = setTimeout(() => { this.gameAlert?.classList.remove('show'); this.alertTimer = null; }, 800);
    }

    updateScoreDisplay() {
        if (this.scoreRightDisplay) this.scoreRightDisplay.textContent = this.scoreRight;
        if (this.scoreWrongDisplay) this.scoreWrongDisplay.textContent = this.scoreWrong;
    }

    updateStatusDisplay() {
        if (this.gameStatusDisplay) {
            if (this.settings.mode === 'time') this.gameStatusDisplay.textContent = `Time: ${this.timeLeft}s`;
            else this.gameStatusDisplay.textContent = `Score: ${this.scoreRight} / ${this.settings.limit}`;
        }
    }

    // Stop timers and RAF but don't destroy invaders (used when showing celebrations)
    stopGameForCelebration() {
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        if (this.gameLoopId) { cancelAnimationFrame(this.gameLoopId); this.gameLoopId = null; }
        if (this.alertTimer) { clearTimeout(this.alertTimer); this.alertTimer = null; }
    }

    endGame(didWin) {
        this.stopGameForCelebration();
        // If there are more wrong answers than right, it's a loss regardless of didWin
        const lostByWrong = this.scoreWrong > this.scoreRight;
        const actuallyWon = didWin && !lostByWrong;
        this.finalizeEndGame(actuallyWon);
        // Only start celebration when truly won (not when outscored by wrong answers)
        if (actuallyWon) this.startWinCelebration();
    }

    finalizeEndGame(didWin) {
        // Standard cleanup and show game-over UI
        this.cleanup();
        if (this.gameScreen) this.gameScreen.style.display = 'none';
        if (this.gameOverScreen) this.gameOverScreen.style.display = 'block';

        // If player has more wrong than right, show explicit loss and suppress celebrations
        const lostByWrong = this.scoreWrong > this.scoreRight;
        if (lostByWrong) {
            if (this.gameOverTitle) this.gameOverTitle.textContent = 'You Lost!';
            // Ensure celebration overlay is hidden
            try {
                const overlay = document.getElementById('celebration-overlay-gameover');
                if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; }
            } catch (e) { /* ignore */ }
        } else {
            if (this.gameOverTitle) this.gameOverTitle.textContent = (this.settings.mode === 'score' && didWin) ? 'You Win!' : (didWin ? 'You Win!' : 'Game Over!');
        }

        if (this.finalScoreRight) this.finalScoreRight.textContent = this.scoreRight;
        if (this.finalScoreWrong) this.finalScoreWrong.textContent = this.scoreWrong;
    }

    // Win celebration (canvas) - simplified: safe no-op if elements missing
    startWinCelebration(onComplete) {
        // clear prior
        this.stopWinCelebration();
        const overlay = document.getElementById('celebration-overlay-gameover');
        const canvas = document.getElementById('celebration-canvas-gameover');
        const text = document.getElementById('celebration-text-gameover');
        if (!overlay || !canvas || !text) { if (typeof onComplete === 'function') onComplete(); return; }

        overlay.style.display = 'block';
        // small timeout to allow CSS transitions
        setTimeout(() => overlay.classList.add('show'), 20);

        // Prepare canvas for high DPI
        const ctx = canvas.getContext('2d');
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
            canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        };
        resize();
        this._winCelebrationResizeHandler = () => resize();
        window.addEventListener('resize', this._winCelebrationResizeHandler);

        // Particle system
        this.winCelebrationParticles = [];
        const colors = ['#ff4d4f','#ff7a18','#ffd166','#6ee7b7','#60a5fa','#c084fc','#fb7185','#facc15'];

        const makeBurst = (cx, cy, count) => {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 6;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                this.winCelebrationParticles.push({
                    x: cx,
                    y: cy,
                    vx: vx,
                    vy: vy - (1 + Math.random()*1.5),
                    life: 60 + Math.floor(Math.random() * 60),
                    age: 0,
                    size: 1 + Math.random()*3,
                    color: colors[Math.floor(Math.random()*colors.length)],
                    gravity: 0.06 + Math.random() * 0.04,
                });
            }
        };

        // Schedule multiple bursts across the canvas
        const rect = canvas.getBoundingClientRect();
        const schedule = [];
        // Spread bursts out so the whole show lasts about 5s
        for (let i = 0; i < 6; i++) {
            // delays roughly 0..4200ms with some randomness
            const delay = i * 700 + Math.random() * 500;
            const tx = 40 + Math.random() * (rect.width - 80);
            const ty = 40 + Math.random() * (rect.height - 160);
            const t = setTimeout(() => makeBurst(tx, ty, 60 + Math.floor(Math.random()*60)), delay);
            schedule.push(t);
        }
         // center big burst immediately
         makeBurst(rect.width/2, rect.height/2, 120);

         // Animation loop
        const step = () => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            // translucent trail
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(0,0,w,h);

            for (let i = this.winCelebrationParticles.length - 1; i >= 0; i--) {
                const p = this.winCelebrationParticles[i];
                p.age++;
                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                const lifeRatio = 1 - p.age / p.life;
                if (lifeRatio <= 0) { this.winCelebrationParticles.splice(i,1); continue; }

                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, p.size*4));
                grad.addColorStop(0, p.color);
                grad.addColorStop(0.5, p.color + 'cc');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.globalAlpha = Math.max(0.2, lifeRatio);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.6 + lifeRatio*1.4), 0, Math.PI*2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // continue animation while particles exist
            if (this.winCelebrationParticles.length > 0) {
                this.winCelebrationAnimId = requestAnimationFrame(step);
            } else {
                this.winCelebrationAnimId = null;
            }
        };

        // Start animation
        this.winCelebrationAnimId = requestAnimationFrame(step);

        // Store timers so we can cancel them
        this.winCelebrationTimers = schedule;

        // Auto stop after ~5 seconds
        this.winCelebrationEndTimeout = setTimeout(() => {
            this.stopWinCelebration();
            if (typeof onComplete === 'function') onComplete();
        }, 5000);

        // expose context for cleanup
        this.winCelebrationCanvas = canvas;
        this.winCelebrationCtx = ctx;
    }

    stopWinCelebration() {
        if (this.winCelebrationAnimId) { cancelAnimationFrame(this.winCelebrationAnimId); this.winCelebrationAnimId = null; }
        if (this.winCelebrationEndTimeout) { clearTimeout(this.winCelebrationEndTimeout); this.winCelebrationEndTimeout = null; }
        if (this.winCelebrationTimers && this.winCelebrationTimers.length) { this.winCelebrationTimers.forEach(t => clearTimeout(t)); this.winCelebrationTimers = []; }
        if (this._winCelebrationResizeHandler) { window.removeEventListener('resize', this._winCelebrationResizeHandler); this._winCelebrationResizeHandler = null; }
        const overlay = document.getElementById('celebration-overlay-gameover');
        const canvas = document.getElementById('celebration-canvas-gameover');
        if (overlay) { overlay.classList.remove('show'); setTimeout(() => { overlay.style.display = 'none'; if (canvas && canvas.getContext) canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); }, 240); }
        this.winCelebrationParticles = [];
        this.winCelebrationCanvas = null;
        this.winCelebrationCtx = null;
    }

    // Stop any in-game celebration overlay/animation (safe no-op if none active)
    stopCelebration() {
        if (this.celebrationAnimId) { cancelAnimationFrame(this.celebrationAnimId); this.celebrationAnimId = null; }
        if (this.celebrationTimeout) { clearTimeout(this.celebrationTimeout); this.celebrationTimeout = null; }
        const overlay = document.getElementById('celebration-overlay');
        const canvas = document.getElementById('celebration-canvas');
        if (overlay) { overlay.classList.remove('show'); setTimeout(() => overlay.style.display = 'none', 240); }
        if (canvas && canvas.getContext) canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
        this.celebrationParticles = [];
    }
}

// Initialize the game once the DOM is loaded.
function initGame() {
    console.log('Initializing game (initGame)');
    const game = new Game();
    console.log('Game instance created');
    game.showSettings();
    try {
        const params = new URLSearchParams(location.search);
        if (params.get('autostart') === '1') { console.log('Auto-starting'); game.start(); }
    } catch (e) { /* ignore */ }
    window._mathInvadersGame = game;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGame);
else initGame();
