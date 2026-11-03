const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function tttWinner(board) {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}

function minimax(board, player, me) {
  const result = tttWinner(board);
  if (result) return result === 'draw' ? 0 : result === me ? 1 : -1;
  const scores = [];
  board.forEach((cell, i) => {
    if (cell) return;
    board[i] = player;
    scores.push(minimax(board, player === 'X' ? 'O' : 'X', me));
    board[i] = null;
  });
  return player === me ? Math.max(...scores) : Math.min(...scores);
}

export function tttBestMove(board, me) {
  let best = -1;
  let bestScore = -2;
  board.forEach((cell, i) => {
    if (cell) return;
    board[i] = me;
    const score = minimax(board, me === 'X' ? 'O' : 'X', me);
    board[i] = null;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

export const C4_ROWS = 6;
export const C4_COLS = 7;

export function c4Drop(board, col, player) {
  for (let row = C4_ROWS - 1; row >= 0; row -= 1) {
    if (!board[row * C4_COLS + col]) {
      const next = board.slice();
      next[row * C4_COLS + col] = player;
      return next;
    }
  }
  return null;
}

export function c4Winner(board) {
  for (let r = 0; r < C4_ROWS; r += 1) {
    for (let c = 0; c < C4_COLS; c += 1) {
      const p = board[r * C4_COLS + c];
      if (!p) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let n = 1;
        while (n < 4) {
          const rr = r + dr * n;
          const cc = c + dc * n;
          if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS || board[rr * C4_COLS + cc] !== p) break;
          n += 1;
        }
        if (n === 4) return p;
      }
    }
  }
  return board.every(Boolean) ? 'draw' : null;
}

const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KING = [...ROOK, ...BISHOP];
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function chessStart() {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  back.forEach((type, c) => { board[0][c] = `b${type}`; board[7][c] = `w${type}`; board[1][c] = 'bP'; board[6][c] = 'wP'; });
  return { board, turn: 'w', castle: { wK: true, wQ: true, bK: true, bQ: true }, ep: null };
}

function pseudo(state, r, c, attackOnly) {
  const { board } = state;
  const piece = board[r][c];
  const color = piece[0];
  const type = piece[1];
  const moves = [];
  const add = (rr, cc) => {
    if (!inBounds(rr, cc)) return false;
    const target = board[rr][cc];
    if (target && target[0] === color) return false;
    moves.push([rr, cc]);
    return !target;
  };
  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      const target = board[rr][cc];
      const isEp = state.ep && state.ep[0] === rr && state.ep[1] === cc;
      if (attackOnly || (target && target[0] !== color) || isEp) moves.push([rr, cc]);
    }
    if (!attackOnly && inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      const home = color === 'w' ? 6 : 1;
      if (r === home && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
    }
  } else if (type === 'N') {
    for (const [dr, dc] of KNIGHT) add(r + dr, c + dc);
  } else if (type === 'K') {
    for (const [dr, dc] of KING) add(r + dr, c + dc);
    const home = color === 'w' ? 7 : 0;
    const enemy = color === 'w' ? 'b' : 'w';
    if (!attackOnly && r === home && c === 4 && !attacked(board, home, 4, enemy)) {
      const free = (...cols) => cols.every((cc) => !board[home][cc]);
      const safe = (...cols) => cols.every((cc) => !attacked(board, home, cc, enemy));
      if (state.castle[`${color}K`] && board[home][7] === `${color}R` && free(5, 6) && safe(5, 6)) moves.push([home, 6]);
      if (state.castle[`${color}Q`] && board[home][0] === `${color}R` && free(1, 2, 3) && safe(2, 3)) moves.push([home, 2]);
    }
  } else {
    const dirs = type === 'R' ? ROOK : type === 'B' ? BISHOP : KING;
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (add(rr, cc)) { rr += dr; cc += dc; }
    }
  }
  return moves;
}

function attacked(board, r, c, by) {
  const probe = { board, ep: null, castle: {} };
  for (let rr = 0; rr < 8; rr += 1) {
    for (let cc = 0; cc < 8; cc += 1) {
      if (board[rr][cc]?.[0] === by && pseudo(probe, rr, cc, true).some(([mr, mc]) => mr === r && mc === c)) return true;
    }
  }
  return false;
}

export function chessInCheck(state, color) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (state.board[r][c] === `${color}K`) return attacked(state.board, r, c, color === 'w' ? 'b' : 'w');
    }
  }
  return false;
}

function apply(state, [fr, fc], [tr, tc]) {
  const board = state.board.map((row) => row.slice());
  const piece = board[fr][fc];
  const color = piece[0];
  const castle = { ...state.castle };
  let ep = null;
  if (piece[1] === 'P' && state.ep && tr === state.ep[0] && tc === state.ep[1] && fc !== tc && !board[tr][tc]) board[fr][tc] = null;
  if (piece[1] === 'P' && Math.abs(tr - fr) === 2) ep = [(fr + tr) / 2, fc];
  if (piece[1] === 'K' && Math.abs(tc - fc) === 2) {
    const home = fr;
    if (tc === 6) { board[home][5] = board[home][7]; board[home][7] = null; } else { board[home][3] = board[home][0]; board[home][0] = null; }
  }
  board[tr][tc] = piece[1] === 'P' && (tr === 0 || tr === 7) ? `${color}Q` : piece;
  board[fr][fc] = null;
  if (piece[1] === 'K') { castle[`${color}K`] = false; castle[`${color}Q`] = false; }
  for (const [r, c] of [[fr, fc], [tr, tc]]) {
    if (r === 7 && c === 0) castle.wQ = false;
    if (r === 7 && c === 7) castle.wK = false;
    if (r === 0 && c === 0) castle.bQ = false;
    if (r === 0 && c === 7) castle.bK = false;
  }
  return { board, turn: color === 'w' ? 'b' : 'w', castle, ep };
}

export function chessMoves(state, r, c) {
  const piece = state.board[r][c];
  if (!piece || piece[0] !== state.turn) return [];
  return pseudo(state, r, c, false).filter((to) => !chessInCheck(apply(state, [r, c], to), piece[0]));
}

export function chessMove(state, from, to) {
  if (!chessMoves(state, from[0], from[1]).some(([r, c]) => r === to[0] && c === to[1])) return null;
  return apply(state, from, to);
}

export function chessStatus(state) {
  let any = false;
  for (let r = 0; r < 8 && !any; r += 1) {
    for (let c = 0; c < 8 && !any; c += 1) any = chessMoves(state, r, c).length > 0;
  }
  const check = chessInCheck(state, state.turn);
  if (!any) return check ? 'checkmate' : 'stalemate';
  return check ? 'check' : 'play';
}

export function snakeStart(size = 15, rng = Math.random) {
  const mid = Math.floor(size / 2);
  const state = { size, snake: [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }], dir: { x: 1, y: 0 }, food: null, score: 0, over: false };
  state.food = placeFood(state, rng);
  return state;
}

function placeFood(state, rng) {
  const free = [];
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) if (!state.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
  }
  return free.length ? free[Math.floor(rng() * free.length)] : null;
}

export function snakeTurn(state, dir) {
  if (state.snake.length > 1 && dir.x === -state.dir.x && dir.y === -state.dir.y) return state;
  return { ...state, dir };
}

export function snakeStep(state, rng = Math.random) {
  if (state.over) return state;
  const head = { x: state.snake[0].x + state.dir.x, y: state.snake[0].y + state.dir.y };
  const eats = state.food && head.x === state.food.x && head.y === state.food.y;
  const body = eats ? state.snake : state.snake.slice(0, -1);
  if (head.x < 0 || head.y < 0 || head.x >= state.size || head.y >= state.size || body.some((s) => s.x === head.x && s.y === head.y)) {
    return { ...state, over: true };
  }
  const next = { ...state, snake: [head, ...body] };
  if (eats) { next.score += 1; next.food = placeFood(next, rng); }
  return next;
}

export function shuffled(items, rng = Math.random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
