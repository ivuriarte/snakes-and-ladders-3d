import * as THREE from 'three';
import { SNAKES, LADDERS } from '../engine/constants.js';
import { squareToWorld } from '../utils/boardMath.js';

/**
 * Builds and adds 3D snake and ladder meshes to the scene.
 * - Snakes: segmented tube following a bezier curve, coloured with scales
 * - Ladders: two rails + rungs
 *
 * @param {THREE.Scene} scene
 */
export function buildSnakesAndLadders(scene) {
  const snakeGroup  = new THREE.Group();
  snakeGroup.name   = 'snakes';
  const ladderGroup = new THREE.Group();
  ladderGroup.name  = 'ladders';

  Object.entries(SNAKES).forEach(([head, tail]) => {
    snakeGroup.add(_buildSnake(Number(head), Number(tail)));
  });

  Object.entries(LADDERS).forEach(([bottom, top]) => {
    ladderGroup.add(_buildLadder(Number(bottom), Number(top)));
  });

  scene.add(snakeGroup);
  scene.add(ladderGroup);
}

// ─── Snake ────────────────────────────────────────────────────────────────────
const SNAKE_COLORS = [0xe74c3c, 0xe67e22, 0x9b59b6, 0x16a085, 0xc0392b, 0x8e44ad, 0xd35400];

function _buildSnake(head, tail) {
  const group  = new THREE.Group();
  group.name   = `snake_${head}_${tail}`;

  const startPos = squareToWorld(head, 0.35);
  const endPos   = squareToWorld(tail, 0.35);

  // Create a sinuous mid-control point for an organic curve
  const mid = new THREE.Vector3(
    (startPos.x + endPos.x) / 2 + (Math.random() - 0.5) * 4,
    2.5 + Math.random() * 2,
    (startPos.z + endPos.z) / 2 + (Math.random() - 0.5) * 4,
  );

  const curve  = new THREE.QuadraticBezierCurve3(startPos, mid, endPos);
  const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.18, 12, false);
  const color   = SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
  const mat     = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const tube = new THREE.Mesh(tubeGeo, mat);
  tube.castShadow    = true;
  tube.receiveShadow = false;
  group.add(tube);

  // Head sphere
  const headMesh = _buildSnakeHead(startPos, color);
  group.add(headMesh);

  // Tail cone
  const tailMesh = _buildSnakeTail(endPos, color);
  group.add(tailMesh);

  return group;
}

function _buildSnakeHead(pos, color) {
  const geo  = new THREE.SphereGeometry(0.3, 16, 16);
  const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y += 0.1;

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffff00, emissiveIntensity: 0.8 });
  const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR   = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.14, 0.12, 0.22);
  eyeR.position.set( 0.14, 0.12, 0.22);
  mesh.add(eyeL);
  mesh.add(eyeR);

  return mesh;
}

function _buildSnakeTail(pos, color) {
  const geo  = new THREE.ConeGeometry(0.12, 0.4, 8);
  const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y += 0.2;
  mesh.rotation.z  = Math.PI;
  return mesh;
}

// ─── Ladder ───────────────────────────────────────────────────────────────────
const LADDER_WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.85, metalness: 0.05 });
const RUNG_MAT        = new THREE.MeshStandardMaterial({ color: 0xa87850, roughness: 0.8 });

function _buildLadder(bottom, top) {
  const group = new THREE.Group();
  group.name  = `ladder_${bottom}_${top}`;

  const startPos = squareToWorld(bottom, 0.15);
  const endPos   = squareToWorld(top,   0.15);

  const dir      = new THREE.Vector3().subVectors(endPos, startPos);
  const length   = dir.length();
  const axis     = dir.clone().normalize();

  // Two rails offset perpendicular to travel direction
  const perp = new THREE.Vector3(-axis.z, 0, axis.x).normalize().multiplyScalar(0.22);

  const railGeo = new THREE.CylinderGeometry(0.065, 0.065, length, 8);

  [-1, 1].forEach((side) => {
    const rail  = new THREE.Mesh(railGeo, LADDER_WOOD_MAT);
    const mid   = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    mid.addScaledVector(perp, side);
    rail.position.copy(mid);

    // Orient along direction
    const up   = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, axis);
    rail.setRotationFromQuaternion(quat);
    rail.castShadow = true;
    group.add(rail);
  });

  // Rungs
  const rungCount = Math.max(3, Math.floor(length / 0.7));
  const rungGeo   = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);

  for (let i = 1; i < rungCount; i++) {
    const t      = i / rungCount;
    const rungPos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
    const rung    = new THREE.Mesh(rungGeo, RUNG_MAT);
    rung.position.copy(rungPos);

    // Orient rung perpendicular to ladder direction
    const rungDir = perp.clone().normalize();
    const up      = new THREE.Vector3(0, 1, 0);
    const quat    = new THREE.Quaternion().setFromUnitVectors(up, rungDir);
    rung.setRotationFromQuaternion(quat);
    rung.castShadow = true;
    group.add(rung);
  }

  // Gold emissive base ring
  const ringGeo = new THREE.TorusGeometry(0.28, 0.045, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.7, roughness: 0.3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(startPos);
  ring.position.y = 0.06;
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  return group;
}
