import * as THREE from 'three';
import gsap from 'gsap';
import { PLAYER_CONFIG } from '../engine/constants.js';
import { squareToWorld, buildHopPath } from '../utils/boardMath.js';
import {
  HOP_HEIGHT, HOP_DURATION, SLIDE_DURATION,
} from '../engine/constants.js';

const PIECE_RADIUS  = 0.26;
const PIECE_HEIGHT  = 0.60;
const PIECE_Y_BASE  = 0.30;  // resting height on tile surface

/**
 * Manages the 3D pawn meshes for all players.
 */
export class PlayerPieces {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      playerCount
   */
  constructor(scene, playerCount) {
    this._scene   = scene;
    this._pieces  = [];         // THREE.Group per player
    this._glows   = [];         // glow ring meshes

    PLAYER_CONFIG.slice(0, playerCount).forEach((cfg) => {
      const group = _buildPiece(cfg);
      group.position.copy(this._startPosition(cfg.id, playerCount));
      scene.add(group);
      this._pieces.push(group);

      // Glow disc under piece
      const glow = _buildGlow(cfg.color);
      scene.add(glow);
      this._glows.push(glow);
    });
  }

  // ─── Public ──────────────────────────────────────────────────────────────

  /** Instantly place a piece at a board square. */
  snapTo(playerId, square) {
    const target = squareToWorld(square, PIECE_Y_BASE);
    // Stagger pieces that share a cell
    const offset = this._stackOffset(playerId, square);
    target.x += offset.x;
    target.z += offset.z;
    this._pieces[playerId].position.copy(target);
    this._updateGlow(playerId);
  }

  /**
   * Animate piece hopping square-by-square.
   * @returns {Promise<void>}
   */
  animateHop(playerId, from, to) {
    const path = buildHopPath(from, to, PIECE_Y_BASE);
    if (path.length === 0) return Promise.resolve();

    const piece = this._pieces[playerId];
    let   chain = gsap.timeline();

    path.forEach((dest, i) => {
      const peak = new THREE.Vector3(
        (piece.position.x + dest.x) / 2,
        PIECE_Y_BASE + HOP_HEIGHT,
        (piece.position.z + dest.z) / 2,
      );

      chain
        .to(piece.position, {
          x:        peak.x,
          y:        peak.y,
          z:        peak.z,
          duration: HOP_DURATION / 2,
          ease:     'power2.out',
        })
        .to(piece.position, {
          x:        dest.x,
          y:        PIECE_Y_BASE,
          z:        dest.z,
          duration: HOP_DURATION / 2,
          ease:     'power2.in',
          onComplete: () => this._updateGlow(playerId),
        });
    });

    return chain.then();
  }

  /**
   * Animate piece sliding along a curved path (snake / ladder).
   * Uses a catmull-rom curve for a smooth arc.
   * @returns {Promise<void>}
   */
  animateSlide(playerId, from, to) {
    const piece = this._pieces[playerId];
    const start = squareToWorld(from, PIECE_Y_BASE);
    const end   = squareToWorld(to,   PIECE_Y_BASE);
    const mid   = new THREE.Vector3(
      (start.x + end.x) / 2,
      PIECE_Y_BASE + Math.abs(end.y - start.y) + 3,
      (start.z + end.z) / 2,
    );

    const curve  = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(40);
    let   t      = { value: 0 };

    return new Promise((resolve) => {
      gsap.to(t, {
        value:    1,
        duration: SLIDE_DURATION,
        ease:     'power1.inOut',
        onUpdate: () => {
          const idx   = Math.min(Math.floor(t.value * (points.length - 1)), points.length - 1);
          piece.position.copy(points[idx]);
          this._updateGlow(playerId);
        },
        onComplete: () => {
          piece.position.copy(end);
          this._updateGlow(playerId);
          resolve();
        },
      });
    });
  }

  /** Pulse / bounce the active player's piece. */
  highlightActive(playerId) {
    this._pieces.forEach((p, i) => {
      gsap.killTweensOf(p.scale);
      if (i === playerId) {
        gsap.to(p.scale, { y: 1.25, duration: 0.35, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      } else {
        gsap.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.2 });
      }
    });
  }

  /** Celebrate winning animation – spin + rise. */
  celebrateWinner(playerId) {
    const piece = this._pieces[playerId];
    gsap.killTweensOf(piece.scale);
    gsap.killTweensOf(piece.rotation);
    gsap.to(piece.rotation, { y: piece.rotation.y + Math.PI * 8, duration: 2.5, ease: 'power2.out' });
    gsap.to(piece.position, { y: PIECE_Y_BASE + 4, duration: 2.5, ease: 'power2.out' });
    gsap.to(piece.scale,    { x: 2, y: 2, z: 2, duration: 2.5, ease: 'power2.out' });
  }

  /** Per-frame idle bob for all pieces. */
  tick(t) {
    this._pieces.forEach((p, i) => {
      p.rotation.y = t * 0.6 + i * 1.57;
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _startPosition(id, count) {
    // Park pieces off-board at corners before game starts
    const offsets = [
      new THREE.Vector3(-12, PIECE_Y_BASE,  12),
      new THREE.Vector3( 12, PIECE_Y_BASE,  12),
      new THREE.Vector3(-12, PIECE_Y_BASE, -12),
      new THREE.Vector3( 12, PIECE_Y_BASE, -12),
    ];
    return offsets[id] || new THREE.Vector3(0, PIECE_Y_BASE, 0);
  }

  _stackOffset(playerId, square) {
    // Tiny radial offset so pieces on same square don't overlap
    const angle = playerId * (Math.PI / 2);
    return { x: Math.cos(angle) * 0.18, z: Math.sin(angle) * 0.18 };
  }

  _updateGlow(playerId) {
    const piece = this._pieces[playerId];
    const glow  = this._glows[playerId];
    glow.position.set(piece.position.x, 0.12, piece.position.z);
  }
}

// ─── Piece geometry factory ───────────────────────────────────────────────────
function _buildPiece(cfg) {
  const group = new THREE.Group();
  group.name  = `piece_${cfg.id}`;

  // Base disc
  const baseGeo = new THREE.CylinderGeometry(PIECE_RADIUS, PIECE_RADIUS * 1.2, 0.12, 20);
  const baseMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4, metalness: 0.5 });
  const base    = new THREE.Mesh(baseGeo, baseMat);
  base.castShadow = true;
  group.add(base);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(PIECE_RADIUS * 0.65, PIECE_RADIUS, PIECE_HEIGHT * 0.55, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.35, metalness: 0.55 });
  const body    = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.12 + PIECE_HEIGHT * 0.275;
  body.castShadow = true;
  group.add(body);

  // Head sphere
  const headGeo = new THREE.SphereGeometry(PIECE_RADIUS * 0.7, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.25, metalness: 0.65 });
  const head    = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.12 + PIECE_HEIGHT * 0.72;
  head.castShadow = true;
  group.add(head);

  // Rim emissive ring
  const rimGeo = new THREE.TorusGeometry(PIECE_RADIUS * 0.72, 0.045, 8, 24);
  const rimMat = new THREE.MeshStandardMaterial({
    color:     cfg.color,
    emissive:  cfg.color,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.8,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12 + PIECE_HEIGHT * 0.52;
  group.add(rim);

  return group;
}

function _buildGlow(color) {
  const geo  = new THREE.RingGeometry(0.22, 0.52, 32);
  const mat  = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'glowRing';
  return mesh;
}
