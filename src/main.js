import './styles.css';
import { Game } from './Game.js';

// Boot the game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  // Expose for debugging in dev
  if (import.meta.env.DEV) window.__game = game;
});
