import * as THREE from 'three';
import { BOARD_SIZE, CELL_SIZE } from '../engine/constants.js';

/**
 * Convert 1-based square number (1–100) to a 3D world position.
 * The board uses a boustrophedon (snake) numbering:
 *   Row 0 (bottom) goes left→right, row 1 right→left, etc.
 *
 * @param  {number} square  1–100
 * @param  {number} [yOffset=0]
 * @returns {THREE.Vector3}
 */
export function squareToWorld(square, yOffset = 0) {
  if (square < 1 || square > 100) {
    return new THREE.Vector3(0, yOffset, 0);
  }

  const idx  = square - 1;                        // 0-based
  const row  = Math.floor(idx / BOARD_SIZE);      // 0 = bottom
  const col0 = idx % BOARD_SIZE;                  // left-to-right index
  const col  = row % 2 === 0 ? col0 : (BOARD_SIZE - 1 - col0); // boustrophedon

  // Board centred at origin.
  // Row 0 (squares 1-10) maps to +Z = near camera = visual "bottom".
  // Row 9 (squares 91-100) maps to -Z = far from camera = visual "top".
  const half = (BOARD_SIZE - 1) / 2;
  const x    = (col  - half) * CELL_SIZE;
  const z    = (half - row)  * CELL_SIZE;   // flipped: row 0 → front, row 9 → back

  return new THREE.Vector3(x, yOffset, z);
}

/**
 * Build an array of intermediate world positions for animating piece movement
 * square-by-square (hop path).
 *
 * @param {number} from   start square (0 = off-board)
 * @param {number} to     destination square (1-100)
 * @param {number} [y=0]
 * @returns {THREE.Vector3[]}
 */
export function buildHopPath(from, to, y = 0) {
  const path = [];
  const dir  = from < to ? 1 : -1;
  for (let s = from + dir; s !== to + dir; s += dir) {
    path.push(squareToWorld(Math.max(1, s), y));
  }
  return path;
}
