import { PLAYER_CONFIG, SELECTABLE_ANIMALS } from '../engine/constants.js';

/**
 * Manages the HTML/CSS overlay UI:
 *  - Player setup screen
 *  - HUD (current player, dice result)
 *  - Dice roll button
 *  - Turn log
 *  - Win modal
 */
export class GameUI {
  constructor() {
    this._root      = document.getElementById('ui-root');
    this._callbacks = {};
    this._render();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Register a callback by event name. */
  on(event, fn) {
    this._callbacks[event] = fn;
    return this;
  }

  /** Show the player-count setup screen (step 1) */
  showSetup() {
    this._overlayStep1.classList.remove('hidden');
    this._overlayStep2.classList.add('hidden');
    this._hud.classList.add('hidden');
  }

  /** Hide setup screens and show HUD */
  showHUD(playerConfigs) {
    this._overlayStep1.classList.add('hidden');
    this._overlayStep2.classList.add('hidden');
    this._hud.classList.remove('hidden');
    this._buildScoreboard(playerConfigs);
  }

  /** Update the active-player indicator */
  setActivePlayer(player) {
    const animal = player.animal ? `${player.animal} ` : '';
    this._playerNameEl.textContent  = `${animal}${player.name}`;
    this._playerNameEl.style.color  = player.hexStr;
    this._rollBtn.disabled          = false;
    this._rollBtn.style.borderColor = player.hexStr;
    this._rollBtn.style.color       = player.hexStr;
    this._statusEl.textContent      = `${player.name}'s turn`;
    this._statusEl.style.color      = player.hexStr;
  }

  /** Show dice rolling animation then reveal result */
  showDiceResult(value) {
    this._rollBtn.disabled = true;
    const el = this._diceEl;
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    let ticks = 0;
    const totalTicks = 14;          // number of random flips
    const startInterval = 60;       // ms between flips (speeds up)
    el.classList.remove('dice-pop');

    const spin = (interval) => {
      if (ticks >= totalTicks) {
        // Land on the real value
        el.textContent = faces[value - 1] || String(value);
        void el.offsetWidth;
        el.classList.add('dice-land');
        el.addEventListener('animationend', () => el.classList.remove('dice-land'), { once: true });
        return;
      }
      // Show a random face
      el.textContent = faces[Math.floor(Math.random() * 6)];
      el.classList.remove('dice-spin');
      void el.offsetWidth;
      el.classList.add('dice-spin');
      ticks++;
      // Slow down gradually toward the end
      const nextInterval = interval + (ticks / totalTicks) * 55;
      setTimeout(() => spin(nextInterval), interval);
    };

    spin(startInterval);
  }

  /** Add a line to the event log */
  log(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    this._logList.prepend(li);
    // Keep max 8 entries
    while (this._logList.children.length > 8) {
      this._logList.removeChild(this._logList.lastChild);
    }
  }

  /** Update a player's position in the scoreboard */
  updateScore(player) {
    const el = document.getElementById(`score-player-${player.id}`);
    if (el) el.querySelector('.score-pos').textContent = player.position === 0 ? 'START' : `Sq. ${player.position}`;
  }

  /** Display win modal */
  showWinner(player) {
    this._rollBtn.disabled = true;
    this._winnerModal.classList.remove('hidden');
    this._winnerModal.querySelector('.winner-name').textContent  = `🏆 ${player.name} wins!`;
    this._winnerModal.querySelector('.winner-name').style.color  = player.hexStr;
  }

  /** Disable roll button during animation */
  lockInteraction() { this._rollBtn.disabled = true; }
  unlockInteraction() { this._rollBtn.disabled = false; }

  // ─── Build DOM ─────────────────────────────────────────────────────────────

  _render() {
    this._root.innerHTML = `
      <!-- Screen 1: choose number of players -->
      <div id="overlay-step1" class="overlay">
        <div class="setup-card glass-card">
          <h1 class="game-title">🌿 Snakes &amp; Ladders 3D</h1>
          <p class="subtitle">How many players?</p>
          <div class="player-btns">
            ${[2, 3, 4].map((n) => `
              <button class="player-count-btn btn-glow" data-count="${n}">
                ${n} Players
              </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Screen 2: choose animal per player -->
      <div id="overlay-step2" class="overlay hidden">
        <div class="setup-card glass-card" style="max-width:580px">
          <div class="step2-header">
            <button id="back-btn" class="back-btn btn-glow">← Back</button>
            <h2 class="game-title" style="font-size:1.6rem">Choose your animals 🐾</h2>
          </div>
          <p class="subtitle">Each player picks a unique animal</p>
          <div id="player-slots"></div>
          <button id="start-game-btn" class="btn-glow start-btn" disabled>Start Game 🌿</button>
        </div>
      </div>

      <!-- HUD -->
      <div id="hud" class="hud hidden">

        <!-- Dice + player panel — bottom center -->
        <div class="dice-panel glass-card">
          <div class="dice-player-row">
            <span class="turn-label">TURN</span>
            <span id="player-name" class="player-name">Player 1</span>
          </div>
          <div id="dice-face" class="dice-face">⚀</div>
          <button id="roll-btn" class="roll-btn btn-glow">Roll Dice</button>
          <button id="end-game-btn" class="end-game-btn btn-glow">End Game</button>
        </div>

        <!-- Status -->
        <div id="status-msg" class="status-msg"></div>

        <!-- Scoreboard -->
        <div class="scoreboard glass-card">
          <h3 class="score-title">Scoreboard</h3>
          <ul id="score-list"></ul>
        </div>

        <!-- Log -->
        <div class="log-panel glass-card">
          <h3 class="log-title">Events</h3>
          <ul id="event-log"></ul>
        </div>

      </div>

      <!-- Winner modal -->
      <div id="winner-modal" class="overlay hidden">
        <div class="win-card glass-card">
          <div class="winner-name">🏆 Player 1 wins!</div>
          <p class="win-sub">Congratulations!</p>
          <button id="restart-btn" class="restart-btn btn-glow">Play Again</button>
        </div>
      </div>
    `;

    this._overlayStep1 = document.getElementById('overlay-step1');
    this._overlayStep2 = document.getElementById('overlay-step2');
    this._hud          = document.getElementById('hud');
    this._playerNameEl = document.getElementById('player-name');
    this._diceEl       = document.getElementById('dice-face');
    this._rollBtn      = document.getElementById('roll-btn');
    this._statusEl     = document.getElementById('status-msg');
    this._winnerModal  = document.getElementById('winner-modal');
    this._logList      = document.getElementById('event-log');

    // Screen 1: player count → go to screen 2
    this._overlayStep1.querySelectorAll('.player-count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._pendingCount   = Number(btn.dataset.count);
        this._pendingAnimals = new Array(this._pendingCount).fill(null);
        this._buildAnimalPicker(this._pendingCount);
        this._overlayStep1.classList.add('hidden');
        this._overlayStep2.classList.remove('hidden');
      });
    });

    // Screen 2: Back → return to screen 1
    document.getElementById('back-btn').addEventListener('click', () => {
      this._overlayStep2.classList.add('hidden');
      this._overlayStep1.classList.remove('hidden');
      this._pendingCount   = null;
      this._pendingAnimals = [];
    });

    // Step 2: Start Game
    document.getElementById('start-game-btn').addEventListener('click', () => {
      this._callbacks.gameStarted?.({
        count:   this._pendingCount,
        animals: this._pendingAnimals.slice(),
      });
    });

    // Roll button
    this._rollBtn.addEventListener('click', () => {
      this._callbacks.rollDice?.();
    });

    // End Game button
    document.getElementById('end-game-btn').addEventListener('click', () => {
      this._hud.classList.add('hidden');
      this._winnerModal.classList.add('hidden');
      this._overlayStep2.classList.add('hidden');
      this._overlayStep1.classList.remove('hidden');
      this._callbacks.endGame?.();
    });

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
      this._winnerModal.classList.add('hidden');
      this._callbacks.restart?.();
    });
  }

  _buildAnimalPicker(count) {
    const slotsEl  = document.getElementById('player-slots');
    const startBtn = document.getElementById('start-game-btn');
    slotsEl.innerHTML = '';
    this._pendingAnimals = new Array(count).fill(null);

    PLAYER_CONFIG.slice(0, count).forEach((cfg, idx) => {
      const slot = document.createElement('div');
      slot.className = 'animal-slot';
      slot.innerHTML = `
        <div class="slot-header">
          <span class="score-dot" style="background:${cfg.hexStr};width:14px;height:14px;border-radius:50%;display:inline-block"></span>
          <span style="color:${cfg.hexStr};font-weight:700;margin-left:6px">${cfg.name}</span>
          <span class="chosen-animal" id="chosen-${idx}">— pick one</span>
        </div>
        <div class="animal-grid">
          ${SELECTABLE_ANIMALS.map((a) => `
            <button class="animal-btn" data-player="${idx}" data-emoji="${a.emoji}" title="${a.name}">
              ${a.emoji}
            </button>`).join('')}
        </div>
      `;
      slotsEl.appendChild(slot);
    });

    // Animal selection
    slotsEl.querySelectorAll('.animal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const playerIdx = Number(btn.dataset.player);
        const emoji     = btn.dataset.emoji;

        // Prevent two players picking the same animal
        if (this._pendingAnimals.some((a, i) => a === emoji && i !== playerIdx)) return;

        this._pendingAnimals[playerIdx] = emoji;

        // Highlight selected within this player slot
        btn.closest('.animal-grid').querySelectorAll('.animal-btn').forEach((b) => {
          b.classList.toggle('selected', b === btn);
        });

        document.getElementById(`chosen-${playerIdx}`).textContent = emoji;

        // Enable start only when all players have chosen
        startBtn.disabled = this._pendingAnimals.some((a) => a === null);
      });
    });
  }

  _buildScoreboard(playerConfigs) {
    const list = document.getElementById('score-list');
    list.innerHTML = '';
    playerConfigs.forEach((cfg) => {
      const li = document.createElement('li');
      li.id    = `score-player-${cfg.id}`;
      li.innerHTML = `
        <span class="score-dot" style="background:${cfg.hexStr}"></span>
        <span class="score-animal">${cfg.animal ?? ''}</span>
        <span class="score-label">${cfg.name}</span>
        <span class="score-pos">Sq. 0</span>
      `;
      list.appendChild(li);
    });
  }
}

