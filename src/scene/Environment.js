import * as THREE from 'three';
import { BOARD_SIZE, CELL_SIZE } from '../engine/constants.js';

const BOARD_W = BOARD_SIZE * CELL_SIZE;

/**
 * Builds and returns the complete rainforest environment:
 *  - Sky gradient background
 *  - Ambient + hemisphere + directional (sun) + point-fill lights
 *  - Ground plane with fog
 *  - Procedural trees / foliage rings
 *  - Floating firefly particles
 *  - Mist particles
 *
 * @param {THREE.Scene} scene
 */
export function buildEnvironment(scene) {
  _setupBackground(scene);
  _setupFog(scene);
  _setupLights(scene);
  _addGround(scene);
  _addTrees(scene);
  _addFireflies(scene);
  _addMistParticles(scene);
}

// ─── Background ──────────────────────────────────────────────────────────────
function _setupBackground(scene) {
  // Deep canopy gradient rendered via a large sky-sphere
  const skyGeo = new THREE.SphereGeometry(120, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x0a1a0e) },
      bottomColor: { value: new THREE.Color(0x1a3d1a) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float t = clamp((vWorldPosition.y + 30.0) / 80.0, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name  = 'sky';
  scene.add(sky);
}

// ─── Fog ─────────────────────────────────────────────────────────────────────
function _setupFog(scene) {
  scene.fog = new THREE.FogExp2(0x0f2d14, 0.028);
}

// ─── Lights ───────────────────────────────────────────────────────────────────
function _setupLights(scene) {
  // Soft ambient fill
  const ambient = new THREE.AmbientLight(0x203a20, 0.6);
  ambient.name  = 'ambientLight';
  scene.add(ambient);

  // Hemisphere – sky vs ground bounce
  const hemi = new THREE.HemisphereLight(0x4caf50, 0x1b5e20, 0.8);
  hemi.name  = 'hemiLight';
  scene.add(hemi);

  // Dappled sun shaft from upper-left
  const sun = new THREE.DirectionalLight(0xc8f5a0, 1.4);
  sun.position.set(-22, 40, -18);
  sun.castShadow              = true;
  sun.shadow.mapSize.width    = 2048;
  sun.shadow.mapSize.height   = 2048;
  sun.shadow.camera.near      = 1;
  sun.shadow.camera.far       = 120;
  sun.shadow.camera.left      = -30;
  sun.shadow.camera.right     = 30;
  sun.shadow.camera.top       = 30;
  sun.shadow.camera.bottom    = -30;
  sun.shadow.bias             = -0.001;
  sun.name = 'sunLight';
  scene.add(sun);

  // Coloured firefly point lights (animated in main loop)
  const colors  = [0x00ff88, 0x88ff00, 0x00ffcc, 0xaaff44];
  const radii   = [18, 14, 20, 16];
  colors.forEach((col, i) => {
    const pl      = new THREE.PointLight(col, 0.6, radii[i]);
    pl.position.set(Math.cos(i * 1.57) * 12, 4 + i * 1.5, Math.sin(i * 1.57) * 12);
    pl.name       = `pointLight_${i}`;
    pl.userData.index = i;
    scene.add(pl);
  });
}

// ─── Ground ───────────────────────────────────────────────────────────────────
function _addGround(scene) {
  const geo = new THREE.PlaneGeometry(200, 200, 40, 40);

  // Procedural vertex displacement for organic undulation
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.sqrt(x * x + z * z);
    if (dist > BOARD_W * 0.8) {  // keep central board area flat
      pos.setY(i, (Math.sin(x * 0.15) + Math.cos(z * 0.12)) * 0.6);
    }
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color:     0x2d5a1b,
    roughness: 0.95,
    metalness: 0.0,
  });

  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
}

// ─── Procedural trees ─────────────────────────────────────────────────────────
function _addTrees(scene) {
  const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x3d2008, roughness: 0.9 });
  const leaf1Mat  = new THREE.MeshStandardMaterial({ color: 0x2d7a22, roughness: 0.85, side: THREE.DoubleSide });
  const leaf2Mat  = new THREE.MeshStandardMaterial({ color: 0x1a5c16, roughness: 0.85, side: THREE.DoubleSide });

  // Place trees in a ring around the board
  const treePositions = _generateTreePositions(28, BOARD_W * 1.6, BOARD_W * 0.9);

  treePositions.forEach((p, i) => {
    const group   = new THREE.Group();
    group.name    = `tree_${i}`;
    const scale   = 0.7 + Math.random() * 0.8;

    // Trunk
    const trunkH  = (2 + Math.random() * 3) * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, trunkH, 7);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Multi-layer canopy cones
    const layers = 2 + Math.floor(Math.random() * 3);
    for (let l = 0; l < layers; l++) {
      const leafMat = l % 2 === 0 ? leaf1Mat : leaf2Mat;
      const r   = (1.4 - l * 0.25) * scale;
      const h   = (1.8 - l * 0.2)  * scale;
      const geo = new THREE.ConeGeometry(r, h, 8 + l * 2);
      const leaf = new THREE.Mesh(geo, leafMat);
      leaf.position.y = trunkH + l * (h * 0.45);
      leaf.castShadow = true;
      group.add(leaf);
    }

    group.position.set(p.x, -0.3, p.z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
  });
}

function _generateTreePositions(count, outerR, innerR) {
  const positions = [];
  const angleStep = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    const angle = i * angleStep + (Math.random() - 0.5) * angleStep * 0.6;
    const r     = innerR + Math.random() * (outerR - innerR);
    positions.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
  }
  return positions;
}

// ─── Firefly particles ────────────────────────────────────────────────────────
function _addFireflies(scene) {
  const COUNT = 160;
  const positions = new Float32Array(COUNT * 3);
  const colors    = new Float32Array(COUNT * 3);
  const sizes     = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = 0.5 + Math.random() * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

    colors[i * 3]     = 0.4 + Math.random() * 0.4;
    colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
    colors[i * 3 + 2] = 0.2 + Math.random() * 0.3;

    sizes[i] = 6 + Math.random() * 10;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size:           0.18,
    sizeAttenuation: true,
    vertexColors:   true,
    transparent:    true,
    opacity:        0.85,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
  });

  const particles = new THREE.Points(geo, mat);
  particles.name  = 'fireflies';
  scene.add(particles);
}

// ─── Mist particles ───────────────────────────────────────────────────────────
function _addMistParticles(scene) {
  const COUNT = 60;
  const positions = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = 0.1 + Math.random() * 1.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color:          0xaaffcc,
    size:           0.9,
    sizeAttenuation: true,
    transparent:    true,
    opacity:        0.12,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
  });

  const mist = new THREE.Points(geo, mat);
  mist.name  = 'mist';
  scene.add(mist);
}

/**
 * Tick function – animates point lights, fireflies, mist.
 * Call from render loop.
 * @param {THREE.Scene} scene
 * @param {number} t  elapsed time in seconds
 */
export function tickEnvironment(scene, t) {
  // Orbit point lights
  for (let i = 0; i < 4; i++) {
    const pl = scene.getObjectByName(`pointLight_${i}`);
    if (!pl) continue;
    const angle = t * 0.4 + i * 1.57;
    pl.position.x = Math.cos(angle) * (10 + i * 2);
    pl.position.z = Math.sin(angle) * (10 + i * 2);
    pl.intensity  = 0.5 + Math.sin(t * 1.2 + i) * 0.25;
  }

  // Drift fireflies
  const ff = scene.getObjectByName('fireflies');
  if (ff) {
    const pos = ff.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(t * 0.8 + i * 0.4) * 0.003);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i * 0.7) * 0.002);
    }
    pos.needsUpdate = true;
  }

  // Drift mist
  const mist = scene.getObjectByName('mist');
  if (mist) {
    const pos = mist.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.1 + i) * 0.004);
    }
    pos.needsUpdate = true;
  }
}
