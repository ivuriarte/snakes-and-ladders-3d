import { PLAYER_CONFIG } from '../engine/constants.js';

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

  /** Show the player-count setup screen */
  showSetup() {
    this._setupOverlay.classList.remove('hidden');
    this._hud.classList.add('hidden');
  }

  /** Hide setup screen and show HUD */
  showHUD(playerCount) {
    this._setupOverlay.classList.add('hidden');
    this._hud.classList.remove('hidden');
    this._buildScoreboard(playerCount);
  }

  /** Update the active-player indicator */
  setActivePlayer(player) {
    this._playerNameEl.textContent  = player.name;
    this._playerNameEl.style.color  = player.hexStr;
    this._rollBtn.disabled          = false;
    this._rollBtn.style.borderColor = player.hexStr;
    this._rollBtn.style.color       = player.hexStr;
    this._statusEl.textContent      = `${player.name}'s turn`;
    this._statusEl.style.color      = player.hexStr;
  }

  /** Show dice value with brief animation */
  showDiceResult(value) {
    this._rollBtn.disabled = true;
    this._diceEl.textContent = DICE_FACES_MAP[value] || String(value);
    this._diceEl.classList.remove('dice-pop');
    void this._diceEl.offsetWidth;  // force reflow
    this._diceEl.classList.add('dice-pop');
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
    if (el) el.querySelector('.score-pos').textContent = `Sq. ${player.position}`;
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
      <!-- Setup overlay -->
      <div id="setup-overlay" class="overlay">
        <div class="setup-card glass-card">
          <h1 class="game-title">🌿 Snakes &amp; Ladders 3D</h1>
          <p class="subtitle">Select number of players</p>
          <div class="player-btns">
            ${[2, 3, 4].map((n) => `
              <button class="player-count-btn btn-glow" data-count="${n}">
                ${n} Players
              </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- HUD -->
      <div id="hud" class="hud hidden">

        <!-- Current player banner -->
        <div class="hud-banner glass-card">
          <span class="turn-label">TURN</span>
          <span id="player-name" class="player-name">Player 1</span>
        </div>

        <!-- Dice -->
        <div class="dice-panel glass-card">
          <div id="dice-face" class="dice-face">⚀</div>
          <button id="roll-btn" class="roll-btn btn-glow">Roll Dice</button>
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

    this._setupOverlay = document.getElementById('setup-overlay');
    this._hud          = document.getElementById('hud');
    this._playerNameEl = document.getElementById('player-name');
    this._diceEl       = document.getElementById('dice-face');
    this._rollBtn      = document.getElementById('roll-btn');
    this._statusEl     = document.getElementById('status-msg');
    this._winnerModal  = document.getElementById('winner-modal');
    this._logList      = document.getElementById('event-log');

    // Setup player-count buttons
    this._setupOverlay.querySelectorAll('.player-count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._callbacks.playerCountSelected?.(Number(btn.dataset.count));
      });
    });

    // Roll button
    this._rollBtn.addEventListener('click', () => {
      this._callbacks.rollDice?.();
    });

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
      this._winnerModal.classList.add('hidden');
      this._callbacks.restart?.();
    });
  }

  _buildScoreboard(playerCount) {
    const list = document.getElementById('score-list');
    list.innerHTML = '';
    PLAYER_CONFIG.slice(0, playerCount).forEach((cfg) => {
      const li = document.createElement('li');
      li.id    = `score-player-${cfg.id}`;
      li.innerHTML = `
        <span class="score-dot" style="background:${cfg.hexStr}"></span>
        <span class="score-label">${cfg.name}</span>
        <span class="score-pos">Sq. 0</span>
      `;
      list.appendChild(li);
    });
  }
}

const DICE_FACES_MAP = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
