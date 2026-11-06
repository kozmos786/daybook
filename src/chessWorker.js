import { chessBestMove } from './gamesLogic.js';

self.onmessage = (event) => {
  const { id, state, depth } = event.data;
  self.postMessage({ id, move: chessBestMove(state, depth) });
};
