// ─── Board Layout ────────────────────────────────────────────────────────────
export const BOARD_SIZE = 10;          // 10×10 grid → 100 squares
export const CELL_SIZE  = 1.8;         // world-units per cell
export const BOARD_HALF = (BOARD_SIZE * CELL_SIZE) / 2;

// ─── Snakes (head → tail) ────────────────────────────────────────────────────
export const SNAKES = Object.freeze({
  97: 78,
  95: 56,
  88: 24,
  62: 19,
  48: 26,
  36: 6,
  32: 10,
});

// ─── Ladders (bottom → top) ──────────────────────────────────────────────────
export const LADDERS = Object.freeze({
  1:  38,
  4:  14,
  9:  31,
  20: 41,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
});

// ─── Players ─────────────────────────────────────────────────────────────────
export const MAX_PLAYERS = 4;

export const PLAYER_CONFIG = Object.freeze([
  { id: 0, name: 'Player 1', color: 0xe74c3c, hexStr: '#e74c3c', label: 'P1' },
  { id: 1, name: 'Player 2', color: 0x3498db, hexStr: '#3498db', label: 'P2' },
  { id: 2, name: 'Player 3', color: 0x2ecc71, hexStr: '#2ecc71', label: 'P3' },
  { id: 3, name: 'Player 4', color: 0xf39c12, hexStr: '#f39c12', label: 'P4' },
]);

// ─── Game States ─────────────────────────────────────────────────────────────
export const GameState = Object.freeze({
  SETUP:      'SETUP',
  IDLE:       'IDLE',
  ROLLING:    'ROLLING',
  MOVING:     'MOVING',
  SNAKE:      'SNAKE',
  LADDER:     'LADDER',
  GAME_OVER:  'GAME_OVER',
});

// ─── Dice ────────────────────────────────────────────────────────────────────
export const DICE_ROLL_DURATION_MS = 800;
export const DICE_FACES = 6;

// ─── Animation ───────────────────────────────────────────────────────────────
export const HOP_HEIGHT      = 1.5;   // arc peak height per step
export const HOP_DURATION    = 0.28;  // seconds per square hop
export const SLIDE_DURATION  = 1.2;   // seconds for snake/ladder travel
