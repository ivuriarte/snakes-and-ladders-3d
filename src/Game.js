import * as THREE from 'three';
import gsap from 'gsap';

import { GameEngine }         from './engine/GameEngine.js';
import { GameState, PLAYER_CONFIG } from './engine/constants.js';
import { createBoard }        from './scene/Board.js';
import { buildEnvironment, tickEnvironment } from './scene/Environment.js';
import { buildSnakesAndLadders } from './scene/SnakesLadders.js';
import { PlayerPieces }       from './scene/PlayerPieces.js';
import { GameUI }             from './ui/GameUI.js';
import { AudioManager }       from './utils/AudioManager.js';

/**
 * Top-level Game orchestrator.
 *
 * Responsibilities:
 *  - Bootstrap Three.js renderer / scene / camera / controls
 *  - Instantiate subsystems (engine, scene objects, UI)
 *  - Wire engine events → scene animations → UI updates
 *  - Drive the render loop
 */
export class Game {
  constructor() {
    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupOrbitControls();
    this._audio = new AudioManager();
    this._ui = new GameUI(this._audio);
    this._bindSetup();
    // Wire roll button once — uses this._engine reference so safe across restarts
    this._ui.on('rollDice', () => { this._engine?.rollDice(); });
    this._clock = new THREE.Clock();
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  _setupRenderer() {
    this._renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this._renderer.outputColorSpace   = THREE.SRGBColorSpace;
    this._renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;
    document.getElementById('canvas-container').appendChild(this._renderer.domElement);

    window.addEventListener('resize', this._onResize.bind(this));
  }

  _setupScene() {
    this._scene = new THREE.Scene();
  }

  _setupCamera() {
    const aspect   = window.innerWidth / window.innerHeight;
    this._camera   = new THREE.PerspectiveCamera(48, aspect, 0.1, 300);
    this._camera.position.set(0, 18, 16);
    this._camera.lookAt(0, 0, 0);
  }

  _setupOrbitControls() {
    // Inline lightweight orbit control (no import needed – avoids three/examples dep issues)
    this._orbit = {
      isDragging: false,
      lastX: 0, lastY: 0,
      theta: 0, phi: 0.72,
      radius: 22,
      target: new THREE.Vector3(0, 0, 0),
    };

    const canvas = this._renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this._orbit.isDragging = true;
      this._orbit.lastX = e.clientX;
      this._orbit.lastY = e.clientY;
    });
    canvas.addEventListener('mouseup',   () => { this._orbit.isDragging = false; });
    canvas.addEventListener('mouseleave',() => { this._orbit.isDragging = false; });
    canvas.addEventListener('mousemove', (e) => {
      if (!this._orbit.isDragging) return;
      const dx = e.clientX - this._orbit.lastX;
      const dy = e.clientY - this._orbit.lastY;
      this._orbit.theta -= dx * 0.005;
      this._orbit.phi    = Math.max(0.25, Math.min(1.4, this._orbit.phi - dy * 0.005));
      this._orbit.lastX  = e.clientX;
      this._orbit.lastY  = e.clientY;
      this._applyOrbit();
    });
    canvas.addEventListener('wheel', (e) => {
      this._orbit.radius = Math.max(10, Math.min(40, this._orbit.radius + e.deltaY * 0.04));
      this._applyOrbit();
    }, { passive: true });

    // Touch support
    let lastTouchX = 0, lastTouchY = 0;
    canvas.addEventListener('touchstart', (e) => { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; });
    canvas.addEventListener('touchmove',  (e) => {
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      this._orbit.theta -= dx * 0.006;
      this._orbit.phi    = Math.max(0.25, Math.min(1.4, this._orbit.phi - dy * 0.006));
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      this._applyOrbit();
      e.preventDefault();
    }, { passive: false });

    this._applyOrbit();
  }

  _applyOrbit() {
    const { theta, phi, radius } = this._orbit;
    this._camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    );
    this._camera.lookAt(this._orbit.target);
  }

  // ─── Setup flow ────────────────────────────────────────────────────────────

  _bindSetup() {
    this._ui.showSetup();
    this._ui.on('gameStarted', ({ count, animals }) => this._startGame(count, animals));
    this._ui.on('restart', () => this._restartGame());
    this._ui.on('endGame', () => this._endGame());
  }

  _startGame(playerCount, animals = []) {
    // Build player configs enriched with chosen animal
    this._playerConfigs = PLAYER_CONFIG.slice(0, playerCount).map((cfg, i) => ({
      ...cfg,
      animal: animals[i] ?? '🦁',
    }));

    // Clear any previous scene objects except persistent environment
    if (this._engine) this._engine.removeAllListeners();
    ['board', 'snakes', 'ladders'].forEach((n) => {
      const obj = this._scene.getObjectByName(n);
      if (obj) this._scene.remove(obj);
    });
    if (this._pieces) {
      this._pieces._pieces.forEach((p) => this._scene.remove(p));
      this._pieces._glows.forEach((g)  => this._scene.remove(g));
    }

    // Build scene objects if first run
    if (!this._envBuilt) {
      buildEnvironment(this._scene);
      this._envBuilt = true;
    }

    const board = createBoard();
    this._scene.add(board);

    buildSnakesAndLadders(this._scene);

    this._pieces = new PlayerPieces(this._scene, this._playerConfigs);
    this._engine = new GameEngine(playerCount);
    // Attach animal to engine player objects
    this._engine.players.forEach((p, i) => { p.animal = animals[i] ?? '🦁'; });

    this._bindEngineEvents();
    this._ui.showHUD(this._playerConfigs);
    this._ui.setActivePlayer(this._engine.currentPlayer);
    this._pieces.highlightActive(this._engine.currentPlayer.id);

    // Place pieces at square 1 start (engine keeps position=0 = off-board until first roll)
    this._engine.players.forEach((p) => {
      this._pieces.snapTo(p.id, 1);
      this._ui.updateScore(p);
    });

    // Start background music + ambient soundscape
    this._audio.startMusic();
    this._audio.startAmbience();
    this._audio.playGameStart();

    // Start render loop if not running
    if (!this._rafId) this._loop();
  }

  _restartGame() {
    if (!this._engine) return;
    const animals = this._engine.players.map((p) => p.animal);
    this._startGame(this._engine.players.length, animals);
  }

  /** Recursively dispose Three.js geometry, materials, and textures. */
  _disposeObject3D(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => { if (v?.isTexture) v.dispose(); });
          m.dispose();
        });
      }
    });
  }

  _endGame() {
    // Cancel render loop and clean up
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._engine = null;
    this._audio.stopMusic();
    this._audio.stopAmbience();
    ['board', 'snakes', 'ladders'].forEach((n) => {
      const obj = this._scene.getObjectByName(n);
      if (obj) { this._disposeObject3D(obj); this._scene.remove(obj); }
    });
    if (this._pieces) {
      this._pieces._pieces.forEach((p) => this._scene.remove(p));
      this._pieces._glows.forEach((g)  => this._scene.remove(g));
      this._pieces = null;
    }
  }

  // ─── Engine event bindings ─────────────────────────────────────────────────

  _bindEngineEvents() {
    const eng = this._engine;

    eng.on('diceRolled', async ({ player, value }) => {
      this._audio?.playDiceRoll();
      await this._ui.showDiceResult(value);
      this._ui.log(`${player.name} rolled a ${value}`);
      eng.resolveMove();
    });

    eng.on('playerMoved', async ({ player, from, to }) => {
      this._ui.lockInteraction();
      if (to === from && from > 0) {
        // Overshoot — must land exactly on 100, piece stays
        this._ui.log(`⚠️ ${player.name} needs exactly ${100 - from} to win!`);
      } else {
        await this._pieces.animateHop(player.id, from === 0 ? 1 : from, to, () => this._audio?.playHop());
      }
      this._ui.updateScore(player);
      // Now that the hop animation is done, check snakes/ladders/win
      eng.resolveSpecials();
      // If no special was triggered, end the turn
      if (eng.state === GameState.MOVING) {
        eng.endTurn();
      }
    });

    eng.on('snakeSlide', async ({ player, from, to }) => {
      this._ui.log(`🐍 ${player.name} hit a snake! ${from} → ${to}`);
      this._audio?.playSnake();
      await this._pieces.animateSlide(player.id, from, to);
      this._ui.updateScore(player);
      eng.endTurn();
    });

    eng.on('ladderClimb', async ({ player, from, to }) => {
      this._ui.log(`🪜 ${player.name} climbed a ladder! ${from} → ${to}`);
      this._audio?.playLadder();
      await this._pieces.animateSlide(player.id, from, to);
      this._ui.updateScore(player);
      eng.endTurn();
    });

    eng.on('turnChanged', ({ player }) => {
      this._ui.setActivePlayer(player);
      this._pieces.highlightActive(player.id);
      this._ui.log(`${player.name}'s turn`);
      this._audio?.playTurnChange();
      this._ui.unlockInteraction();
    });

    eng.on('gameOver', ({ winner }) => {
      this._ui.log(`🏆 ${winner.name} reached square 100 and WINS!`);
      this._audio?.playWin();
      this._pieces.celebrateWinner(winner.id);
      setTimeout(() => this._ui.showWinner(winner), 1800);
    });
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  _loop() {
    this._rafId = requestAnimationFrame(this._loop.bind(this));
    const t = this._clock.getElapsedTime();
    tickEnvironment(this._scene, t);
    if (this._pieces) this._pieces.tick(t);
    this._renderer.render(this._scene, this._camera);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }
}
