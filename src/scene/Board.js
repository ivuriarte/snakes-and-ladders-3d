import * as THREE from 'three';
import { BOARD_SIZE, CELL_SIZE, SNAKES, LADDERS } from '../engine/constants.js';
import { squareToWorld } from '../utils/boardMath.js';

const BOARD_W    = BOARD_SIZE * CELL_SIZE;
const BORDER_COL = 0x1a3d1a;
const TEX_SIZE   = 256;  // canvas resolution per tile

// ─── Rainforest animal palette (cycles across all 100 tiles) ─────────────────
const ANIMALS = [
  '🦜', '🐸', '🦋', '🐒', '🦎',
  '🐊', '🦩', '🐆', '🦚', '🪲',
  '🦁', '🐛', '🌺', '🌿', '🦧',
  '🐝', '🦗', '🦜', '🦟', '🌴',
];

// Row background colours — gradient from jungle floor (bottom) to canopy (top)
const ROW_COLORS = [
  '#2d5016', '#365d1a', '#3e6a1e', '#467723', '#4d8328',
  '#3d8c3a', '#2d9450', '#1e9465', '#148477', '#0d7488',
];

/**
 * Creates and returns the complete board group.
 * Tile 1 is at the bottom-front, tile 100 at the top-back.
 * Numbering: left→right on odd rows, right→left on even rows (boustrophedon).
 * @returns {THREE.Group}
 */
export function createBoard() {
  const group = new THREE.Group();
  group.name  = 'board';

  _addBorderSlab(group);
  _addAnimalTiles(group);
  _addCellHighlights(group);
  _addStartFinishMarkers(group);

  return group;
}

// ─── Border slab ─────────────────────────────────────────────────────────────
function _addBorderSlab(group) {
  const pad  = CELL_SIZE * 0.65;
  const size = BOARD_W + pad * 2;
  const geo  = new THREE.BoxGeometry(size, 0.4, size);
  const mat  = new THREE.MeshStandardMaterial({ color: BORDER_COL, roughness: 0.88, metalness: 0.06 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.2;
  mesh.receiveShadow = true;
  mesh.name = 'boardBorder';
  group.add(mesh);
}

// ─── Animal tile canvas factory ───────────────────────────────────────────────
function _buildTileTexture(sq) {
  const canvas  = document.createElement('canvas');
  canvas.width  = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx     = canvas.getContext('2d');
  const S       = TEX_SIZE;
  const row     = Math.floor((sq - 1) / BOARD_SIZE);  // 0 = bottom

  // ── Background rounded rect ──────────────────────────────────────────────
  const bgColor = SNAKES[sq]  ? '#7a1010'
                : LADDERS[sq] ? '#7a6000'
                : sq === 1    ? '#1a6b2a'
                : sq === 100  ? '#5a1a8a'
                : ROW_COLORS[row];

  ctx.fillStyle = bgColor;
  _roundRect(ctx, 4, 4, S - 8, S - 8, 24);
  ctx.fill();

  // ── Subtle diagonal stripe texture ───────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 3;
  for (let d = -S; d < S * 2; d += 20) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + S, S);
    ctx.stroke();
  }
  ctx.restore();

  // ── Border stroke ─────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth   = 5;
  _roundRect(ctx, 4, 4, S - 8, S - 8, 24);
  ctx.stroke();

  // ── Animal emoji ─────────────────────────────────────────────────────────
  const emoji = sq === 1    ? '🌱'
              : sq === 100  ? '👑'
              : SNAKES[sq]  ? '🐍'
              : LADDERS[sq] ? '🪜'
              : ANIMALS[(sq - 1) % ANIMALS.length];

  ctx.font         = `${S * 0.48}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, S / 2, S * 0.48);

  // ── Square number ─────────────────────────────────────────────────────────
  const label  = sq === 1 ? 'START' : sq === 100 ? 'FINISH' : String(sq);
  const fSize  = sq === 1 || sq === 100 ? S * 0.13 : S * 0.19;
  ctx.font         = `bold ${fSize}px 'Arial', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle    = 'rgba(255,255,255,0.90)';
  ctx.shadowColor  = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur   = 5;
  ctx.fillText(label, S / 2, S - 12);
  ctx.shadowBlur = 0;

  return new THREE.CanvasTexture(canvas);
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ─── Tile meshes with animal canvas textures ──────────────────────────────────
function _addAnimalTiles(group) {
  const tileGeo = new THREE.BoxGeometry(CELL_SIZE * 0.97, 0.22, CELL_SIZE * 0.97);

  // Shared side/bottom material (dark wood)
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.85 });

  for (let sq = 1; sq <= 100; sq++) {
    const tex     = _buildTileTexture(sq);
    const topMat  = new THREE.MeshStandardMaterial({
      map:       tex,
      roughness: 0.65,
      metalness: sq === 100 ? 0.3 : 0.05,
    });

    // BoxGeometry face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
    const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(tileGeo, materials);
    const pos  = squareToWorld(sq);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.receiveShadow = true;
    mesh.castShadow    = false;
    mesh.name          = `tile_${sq}`;
    mesh.userData.square = sq;
    group.add(mesh);
  }
}

// ─── Glow rings on snake/ladder cells ────────────────────────────────────────
function _addCellHighlights(group) {
  const ringGeo = new THREE.RingGeometry(CELL_SIZE * 0.38, CELL_SIZE * 0.47, 32);

  const makeRing = (sq, color) => {
    const mat  = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    const pos  = squareToWorld(sq);
    mesh.position.set(pos.x, 0.13, pos.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name       = `ring_${sq}`;
    group.add(mesh);
  };

  Object.keys(SNAKES).forEach((sq)  => makeRing(Number(sq), 0xff3333));
  Object.keys(LADDERS).forEach((sq) => makeRing(Number(sq), 0xffdd00));
}

// ─── START (sq 1) and FINISH (sq 100) raised markers ─────────────────────────
function _addStartFinishMarkers(group) {
  // Green pulsing ring for START
  const startRing = new THREE.Mesh(
    new THREE.RingGeometry(CELL_SIZE * 0.44, CELL_SIZE * 0.49, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  const s1 = squareToWorld(1);
  startRing.position.set(s1.x, 0.14, s1.z);
  startRing.rotation.x = -Math.PI / 2;
  startRing.name = 'startRing';
  group.add(startRing);

  // Gold ring for FINISH
  const finishRing = new THREE.Mesh(
    new THREE.RingGeometry(CELL_SIZE * 0.44, CELL_SIZE * 0.49, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  const s100 = squareToWorld(100);
  finishRing.position.set(s100.x, 0.14, s100.z);
  finishRing.rotation.x = -Math.PI / 2;
  finishRing.name = 'finishRing';
  group.add(finishRing);
}
