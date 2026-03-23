import { EventEmitter } from '../utils/EventEmitter.js';
import {
  BOARD_SIZE, SNAKES, LADDERS, MAX_PLAYERS, GameState,
  DICE_FACES, PLAYER_CONFIG,
} from './constants.js';

/**
 * Pure game-logic state machine.
 * Emits events consumed by the 3D scene layer — zero Three.js coupling.
 *
 * Events:
 *   stateChange   { from, to }
 *   diceRolled    { player, value }
 *   playerMoved   { player, from, to }
 *   snakeSlide    { player, from, to }
 *   ladderClimb   { player, from, to }
 *   turnChanged   { player }
 *   gameOver      { winner }
 */
export class GameEngine extends EventEmitter {
  /** @param {number} playerCount 2–4 */
  constructor(playerCount = 2) {
    super();

    if (playerCount < 2 || playerCount > MAX_PLAYERS) {
      throw new RangeError(`playerCount must be 2–${MAX_PLAYERS}`);
    }

    this._playerCount = playerCount;
    this._state       = GameState.SETUP;
    this._turn        = 0;         // index into _players
    this._lastRoll    = 0;

    this._players = PLAYER_CONFIG.slice(0, playerCount).map((cfg) => ({
      ...cfg,
      position: 0,   // 0 = start (off board), 1–100 = squares
      finished: false,
    }));

    this._setState(GameState.IDLE);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get state()       { return this._state; }
  get currentPlayer() { return this._players[this._turn]; }
  get players()     { return this._players; }
  get lastRoll()    { return this._lastRoll; }

  /** Trigger a dice roll for the current player. Returns rolled value. */
  rollDice() {
    if (this._state !== GameState.IDLE) return null;

    this._setState(GameState.ROLLING);

    const value = this._rollD6();
    this._lastRoll = value;
    this.emit('diceRolled', { player: this.currentPlayer, value });

    // Schedule move resolution after animation window
    return value;
  }

  /**
   * Called by the scene layer once the dice roll animation completes.
   * Only calculates destination and emits playerMoved — does NOT yet
   * check snakes/ladders so the hop animation can fully complete first.
   * Call resolveSpecials() after the hop finishes.
   */
  resolveMove() {
    if (this._state !== GameState.ROLLING) return;

    const player = this.currentPlayer;
    const from   = player.position;
    let   to     = from + this._lastRoll;

    // Overshoot rule – bounce back from 100
    if (to > 100) {
      to = 100 - (to - 100);
    }

    this._setState(GameState.MOVING);
    this.emit('playerMoved', { player, from, to });
    player.position = to;
  }

  /**
   * Called by the scene layer AFTER the hop animation completes.
   * Checks win condition, snakes, and ladders.
   */
  resolveSpecials() {
    if (this._state !== GameState.MOVING) return;

    const player = this.currentPlayer;
    const pos    = player.position;

    if (pos === 100) {
      player.finished = true;
      this._setState(GameState.GAME_OVER);
      this.emit('gameOver', { winner: player });
      return;
    }

    if (SNAKES[pos] !== undefined) {
      const dest = SNAKES[pos];
      this._setState(GameState.SNAKE);
      this.emit('snakeSlide', { player, from: pos, to: dest });
      player.position = dest;
    } else if (LADDERS[pos] !== undefined) {
      const dest = LADDERS[pos];
      this._setState(GameState.LADDER);
      this.emit('ladderClimb', { player, from: pos, to: dest });
      player.position = dest;
    }
    // If no special, state stays MOVING — scene layer calls endTurn()
  }

  /**
   * Called by the scene layer once ALL movement animations are complete.
   * Advances to the next turn.
   */
  endTurn() {
    if (
      this._state !== GameState.MOVING &&
      this._state !== GameState.SNAKE  &&
      this._state !== GameState.LADDER
    ) return;

    // Advance to next active player
    let next = this._turn;
    do {
      next = (next + 1) % this._playerCount;
    } while (this._players[next].finished && next !== this._turn);

    this._turn = next;
    this._setState(GameState.IDLE);
    this.emit('turnChanged', { player: this.currentPlayer });
  }

  /** Reset to a fresh game. */
  reset(playerCount = this._playerCount) {
    this._players.forEach((p) => { p.position = 0; p.finished = false; });
    this._turn     = 0;
    this._lastRoll = 0;
    this._setState(GameState.IDLE);
    this.emit('turnChanged', { player: this.currentPlayer });
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _rollD6() {
    return Math.floor(Math.random() * DICE_FACES) + 1;
  }

  _setState(next) {
    const from = this._state;
    this._state = next;
    this.emit('stateChange', { from, to: next });
  }
}
