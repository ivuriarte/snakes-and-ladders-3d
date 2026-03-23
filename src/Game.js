import * as THREE from 'three';
import gsap from 'gsap';

import { GameEngine }         from './engine/GameEngine.js';
import { GameState }          from './engine/constants.js';
import { createBoard }        from './scene/Board.js';
import { buildEnvironment, tickEnvironment } from './scene/Environment.js';
import { buildSnakesAndLadders } from './scene/SnakesLadders.js';
import { PlayerPieces }       from './scene/PlayerPieces.js';
import { GameUI }             from './ui/GameUI.js';
import { DICE_ROLL_DURATION_MS } from './engine/constants.js';

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
    this._ui = new GameUI();
    this._bindSetup();
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
    this._camera   = new THREE.PerspectiveCamera(55, aspect, 0.1, 300);
    this._camera.position.set(0, 28, 26);
    this._camera.lookAt(0, 0, 0);
  }

  _setupOrbitControls() {
    // Inline lightweight orbit control (no import needed – avoids three/examples dep issues)
    this._orbit = {
      isDragging: false,
      lastX: 0, lastY: 0,
      theta: 0, phi: 0.9,
      radius: 38,
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
      this._orbit.radius = Math.max(12, Math.min(70, this._orbit.radius + e.deltaY * 0.05));
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
    this._ui.on('playerCountSelected', (count) => this._startGame(count));
    this._ui.on('restart', () => this._restartGame());
  }

  _startGame(playerCount) {
    // Clear any previous scene objects except persistent environment
    ['board', 'snakes', 'ladders', 'playerPieces'].forEach((n) => {
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

    this._pieces = new PlayerPieces(this._scene, playerCount);
    this._engine = new GameEngine(playerCount);

    this._bindEngineEvents();
    // Wire roll button to current engine instance
    this._ui.on('rollDice', () => { this._engine?.rollDice(); });
    this._ui.showHUD(playerCount);
    this._ui.setActivePlayer(this._engine.currentPlayer);
    this._pieces.highlightActive(this._engine.currentPlayer.id);

    // Place pieces at square 1 start
    this._engine.players.forEach((p) => {
      this._pieces.snapTo(p.id, 1);
      this._ui.updateScore(p);
    });

    // Start render loop if not running
    if (!this._rafId) this._loop();
  }

  _restartGame() {
    this._startGame(this._engine.players.length);
  }

  // ─── Engine event bindings ─────────────────────────────────────────────────

  _bindEngineEvents() {
    const eng = this._engine;

    eng.on('diceRolled', ({ player, value }) => {
      this._ui.showDiceResult(value);
      this._ui.log(`${player.name} rolled a ${value}`);

      // After dice animation window, resolve move
      setTimeout(() => eng.resolveMove(), DICE_ROLL_DURATION_MS);
    });

    eng.on('playerMoved', async ({ player, from, to }) => {
      this._ui.lockInteraction();
      await this._pieces.animateHop(player.id, from === 0 ? 1 : from, to);
      player.position = to;
      this._ui.updateScore(player);
      // Engine state may have changed to SNAKE/LADDER — endTurn
      // is called after slide animations in the snake/ladder handlers.
      if (eng.state === GameState.MOVING) {
        eng.endTurn();
      }
    });

    eng.on('snakeSlide', async ({ player, from, to }) => {
      this._ui.log(`🐍 ${player.name} hit a snake! ${from} → ${to}`);
      await this._pieces.animateSlide(player.id, from, to);
      this._ui.updateScore(player);
      eng.endTurn();
    });

    eng.on('ladderClimb', async ({ player, from, to }) => {
      this._ui.log(`🪜 ${player.name} climbed a ladder! ${from} → ${to}`);
      await this._pieces.animateSlide(player.id, from, to);
      this._ui.updateScore(player);
      eng.endTurn();
    });

    eng.on('turnChanged', ({ player }) => {
      this._ui.setActivePlayer(player);
      this._pieces.highlightActive(player.id);
      this._ui.log(`${player.name}'s turn`);
      this._ui.unlockInteraction();
    });

    eng.on('gameOver', ({ winner }) => {
      this._ui.log(`🏆 ${winner.name} reached square 100 and WINS!`);
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
