import {
  C4_COLS, C4_ROWS, c4Drop, c4Winner, chessInCheck, chessMove, chessMoves, chessStart, chessStatus,
  shuffled, snakeStart, snakeStep, snakeTurn, tttBestMove, tttWinner,
} from './gamesLogic.js';

function el(tag, props = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'type' || key === 'role') node.setAttribute(key, value);
    else node[key] = value;
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function status(stage) {
  const line = el('p', { class: 'game-status', role: 'status' });
  line.setAttribute('aria-live', 'polite');
  stage.append(line);
  return (text) => { line.textContent = text; };
}

function newGameButton(stage, onClick) {
  const button = el('button', { type: 'button', class: 'secondary' }, 'New game');
  button.addEventListener('click', onClick);
  stage.append(button);
  return button;
}

function ticTacToe(stage) {
  let board;
  let turn;
  let vsComputer = true;
  const mode = el('label', { class: 'check' });
  const box = el('input', { type: 'checkbox', checked: true });
  mode.append(box, ' Play against the computer (you are X)');
  const grid = el('div', { class: 'ttt-grid', role: 'group' });
  grid.setAttribute('aria-label', 'Tic-tac-toe board');
  const say = status(stage);
  const cells = Array.from({ length: 9 }, (_, i) => {
    const cell = el('button', { type: 'button', class: 'ttt-cell' });
    cell.setAttribute('aria-label', `Square ${i + 1}`);
    cell.addEventListener('click', () => play(i));
    grid.append(cell);
    return cell;
  });
  stage.prepend(mode, grid);
  function draw() {
    const result = tttWinner(board);
    cells.forEach((cell, i) => {
      cell.textContent = board[i] || '';
      cell.disabled = Boolean(board[i]) || Boolean(result);
    });
    say(result === 'draw' ? "It's a draw." : result ? `${result} wins! 🎉` : `${turn}'s turn`);
  }
  function play(i) {
    if (board[i] || tttWinner(board)) return;
    board[i] = turn;
    turn = turn === 'X' ? 'O' : 'X';
    if (vsComputer && turn === 'O' && !tttWinner(board)) { board[tttBestMove(board, 'O')] = 'O'; turn = 'X'; }
    draw();
  }
  function reset() { board = Array(9).fill(null); turn = 'X'; vsComputer = box.checked; draw(); }
  box.addEventListener('change', reset);
  newGameButton(stage, reset);
  reset();
}

function connectFour(stage) {
  let board;
  let turn;
  const say = status(stage);
  const drops = el('div', { class: 'c4-drops' });
  const grid = el('div', { class: 'c4-grid', role: 'img' });
  grid.setAttribute('aria-label', 'Connect four board');
  for (let c = 0; c < C4_COLS; c += 1) {
    const button = el('button', { type: 'button', class: 'secondary' }, '\u25BC');
    button.setAttribute('aria-label', `Drop in column ${c + 1}`);
    button.addEventListener('click', () => {
      if (c4Winner(board)) return;
      const next = c4Drop(board, c, turn);
      if (!next) return;
      board = next;
      turn = turn === 'R' ? 'Y' : 'R';
      draw();
    });
    drops.append(button);
  }
  const holes = Array.from({ length: C4_ROWS * C4_COLS }, () => grid.appendChild(el('span', { class: 'c4-hole' })));
  stage.prepend(drops, grid);
  const name = (p) => (p === 'R' ? 'Red' : 'Yellow');
  function draw() {
    holes.forEach((hole, i) => { hole.className = `c4-hole${board[i] ? ` c4-${board[i]}` : ''}`; });
    const result = c4Winner(board);
    say(result === 'draw' ? "It's a draw." : result ? `${name(result)} wins! 🎉` : `${name(turn)}'s turn`);
  }
  function reset() { board = Array(C4_ROWS * C4_COLS).fill(null); turn = 'R'; draw(); }
  newGameButton(stage, reset);
  reset();
}

const PIECES = { wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659', bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F' };
const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };

function chess(stage) {
  let state;
  let selected = null;
  let targets = [];
  const say = status(stage);
  const grid = el('div', { class: 'chess-grid', role: 'group' });
  grid.setAttribute('aria-label', 'Chess board');
  const squares = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const sq = el('button', { type: 'button', class: `chess-square ${(r + c) % 2 ? 'dark' : 'light'}` });
      sq.addEventListener('click', () => click(r, c));
      grid.append(sq);
      squares.push(sq);
    }
  }
  stage.prepend(grid);
  const color = (p) => (p === 'w' ? 'White' : 'Black');
  function draw() {
    const result = chessStatus(state);
    squares.forEach((sq, i) => {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const piece = state.board[r][c];
      sq.textContent = piece ? PIECES[piece] : '';
      sq.classList.toggle('selected', selected !== null && selected[0] === r && selected[1] === c);
      sq.classList.toggle('target', targets.some(([tr, tc]) => tr === r && tc === c));
      sq.classList.toggle('black-piece', Boolean(piece) && piece[0] === 'b');
      sq.setAttribute('aria-label', `${'abcdefgh'[c]}${8 - r}${piece ? ` ${color(piece[0])} ${NAMES[piece[1]]}` : ''}`);
    });
    if (result === 'checkmate') say(`Checkmate! ${color(state.turn === 'w' ? 'b' : 'w')} wins! 🎉`);
    else if (result === 'stalemate') say('Stalemate. It is a draw.');
    else say(`${color(state.turn)} to move${chessInCheck(state, state.turn) ? ' - check!' : ''}`);
  }
  function click(r, c) {
    const result = chessStatus(state);
    if (result === 'checkmate' || result === 'stalemate') return;
    if (selected && targets.some(([tr, tc]) => tr === r && tc === c)) {
      state = chessMove(state, selected, [r, c]);
      selected = null;
      targets = [];
    } else if (state.board[r][c]?.[0] === state.turn) {
      selected = [r, c];
      targets = chessMoves(state, r, c);
    } else {
      selected = null;
      targets = [];
    }
    draw();
  }
  function reset() { state = chessStart(); selected = null; targets = []; draw(); }
  stage.append(el('p', { class: 'hint' }, 'Two players share the board, white moves first. Click a piece, then a highlighted square. Castling and en passant work; pawns promote to a queen.'));
  newGameButton(stage, reset);
  reset();
}

function memory(stage) {
  const faces = ['\uD83D\uDC31', '\uD83D\uDC36', '\uD83E\uDD8A', '\uD83D\uDC3C', '\uD83D\uDC38', '\uD83E\uDD84', '\uD83C\uDF53', '\uD83C\uDF69'];
  const say = status(stage);
  const grid = el('div', { class: 'memory-grid' });
  stage.prepend(grid);
  let cards;
  let open;
  let moves;
  let lock;
  function draw() {
    grid.replaceChildren(...cards.map((card, i) => {
      const button = el('button', { type: 'button', class: `memory-card${card.up || card.done ? ' up' : ''}${card.done ? ' done' : ''}` }, card.up || card.done ? card.face : '?');
      button.setAttribute('aria-label', card.up || card.done ? `Card ${i + 1}: ${card.face}` : `Card ${i + 1}, face down`);
      button.disabled = card.done;
      button.addEventListener('click', () => flip(i));
      return button;
    }));
    const left = cards.filter((c) => !c.done).length;
    say(left === 0 ? `You matched them all in ${moves} moves! 🎉` : `Moves: ${moves}`);
  }
  function flip(i) {
    const card = cards[i];
    if (lock || card.up || card.done) return;
    card.up = true;
    open.push(i);
    if (open.length === 2) {
      moves += 1;
      const [a, b] = open;
      if (cards[a].face === cards[b].face) { cards[a].done = cards[b].done = true; cards[a].up = cards[b].up = false; open = []; } else {
        lock = true;
        setTimeout(() => { cards[a].up = cards[b].up = false; open = []; lock = false; if (grid.isConnected) draw(); }, 800);
      }
    }
    draw();
  }
  function reset() { cards = shuffled([...faces, ...faces]).map((face) => ({ face, up: false, done: false })); open = []; moves = 0; lock = false; draw(); }
  newGameButton(stage, reset);
  reset();
}

function snake(stage) {
  const size = 15;
  const cell = 20;
  const canvas = el('canvas', { class: 'snake-canvas', width: size * cell, height: size * cell });
  canvas.setAttribute('aria-label', 'Snake game board');
  const say = status(stage);
  stage.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let state;
  let timer;
  const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  function turn(name) { const [x, y] = DIRS[name]; state = snakeTurn(state, { x, y }); }
  function draw() {
    ctx.fillStyle = '#fff6fb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (state.food) { ctx.fillStyle = '#ff6b9a'; ctx.fillRect(state.food.x * cell + 3, state.food.y * cell + 3, cell - 6, cell - 6); }
    state.snake.forEach((s, i) => { ctx.fillStyle = i ? '#7a5cc7' : '#4b2fa0'; ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2); });
    say(state.over ? `Game over! Score ${state.score}. Press New game.` : `Score ${state.score}. Use the arrow keys or WASD.`);
  }
  function tick() { state = snakeStep(state); draw(); if (state.over) clearInterval(timer); }
  function onKey(event) {
    if (!(event.key in DIRS) || event.target.closest?.('input, textarea, select')) return;
    event.preventDefault();
    turn(event.key);
  }
  document.addEventListener('keydown', onKey);
  const pad = el('div', { class: 'snake-pad' });
  for (const [label, key] of [['\u25B2', 'ArrowUp'], ['\u25C0', 'ArrowLeft'], ['\u25BC', 'ArrowDown'], ['\u25B6', 'ArrowRight']]) {
    const button = el('button', { type: 'button', class: 'secondary' }, label);
    button.setAttribute('aria-label', key.replace('Arrow', ''));
    button.addEventListener('click', () => turn(key));
    pad.append(button);
  }
  stage.append(pad);
  function reset() { clearInterval(timer); state = snakeStart(size); draw(); timer = setInterval(tick, 140); }
  newGameButton(stage, reset);
  reset();
  return () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };
}

function paint(stage) {
  const canvas = el('canvas', { class: 'paint-canvas', width: 640, height: 400 });
  canvas.setAttribute('aria-label', 'Drawing canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let color = '#7a5cc7';
  let eraser = false;
  const tools = el('div', { class: 'paint-tools' });
  const swatches = ['#222222', '#e03e3e', '#f08c2e', '#f2d33b', '#3fae5a', '#3b8be0', '#7a5cc7', '#ff6bb5', '#8b5a2b'];
  const picker = el('input', { type: 'color', value: color });
  picker.setAttribute('aria-label', 'Custom colour');
  const choose = (value) => { color = value; eraser = false; picker.value = value; eraserButton.setAttribute('aria-pressed', 'false'); };
  const eraserButton = el('button', { type: 'button', class: 'secondary' }, 'Eraser');
  eraserButton.setAttribute('aria-pressed', 'false');
  eraserButton.addEventListener('click', () => { eraser = !eraser; eraserButton.setAttribute('aria-pressed', String(eraser)); });
  for (const value of swatches) {
    const swatch = el('button', { type: 'button', class: 'swatch' });
    swatch.style.setProperty('background', value);
    swatch.setAttribute('aria-label', `Colour ${value}`);
    swatch.addEventListener('click', () => choose(value));
    tools.append(swatch);
  }
  picker.addEventListener('input', () => choose(picker.value));
  const size = el('input', { type: 'range', min: 1, max: 40, value: 6 });
  size.setAttribute('aria-label', 'Brush size');
  const clear = el('button', { type: 'button', class: 'secondary' }, 'Clear');
  clear.addEventListener('click', () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); });
  const save = el('button', { type: 'button', class: 'secondary' }, 'Save PNG');
  save.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: 'daybook-drawing.png' });
      link.click();
      URL.revokeObjectURL(url);
    });
  });
  tools.append(picker, eraserButton, size, clear, save);
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * (canvas.width / rect.width), (event.clientY - rect.top) * (canvas.height / rect.height)];
  };
  const stroke = (x, y, fromX, fromY) => {
    ctx.strokeStyle = eraser ? '#ffffff' : color;
    ctx.lineWidth = Number(size.value);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };
  let last = [0, 0];
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    last = point(event);
    stroke(last[0], last[1], last[0], last[1]);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const [x, y] = point(event);
    stroke(x, y, last[0], last[1]);
    last = [x, y];
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drawing = false; });
  stage.append(tools, canvas, el('p', { class: 'hint' }, 'Draw with a mouse, finger or pen. Pick a colour, change the brush size, erase, clear, or save your picture.'));
}

const GAMES = [
  { id: 'ttt', label: '\u274C Tic-tac-toe', start: ticTacToe },
  { id: 'chess', label: '\u265E Chess', start: chess },
  { id: 'c4', label: '\uD83D\uDD34 Connect Four', start: connectFour },
  { id: 'memory', label: '\uD83C\uDFB4 Memory match', start: memory },
  { id: 'snake', label: '\uD83D\uDC0D Snake', start: snake },
  { id: 'paint', label: '\uD83C\uDFA8 Paint board', start: paint },
];

export function initGames() {
  const planner = document.querySelector('.app');
  const area = document.getElementById('games');
  const picker = document.getElementById('game-picker');
  const stage = document.getElementById('game-stage');
  const tabs = { planner: document.getElementById('tab-planner'), games: document.getElementById('tab-games') };
  let stop = null;
  let current = null;

  function open(id) {
    if (stop) stop();
    stop = null;
    current = id;
    stage.replaceChildren();
    const game = GAMES.find((g) => g.id === id);
    stop = game.start(stage) || null;
    for (const button of picker.children) button.setAttribute('aria-pressed', String(button.dataset.game === id));
  }

  function show(name) {
    const games = name === 'games';
    planner.hidden = games;
    area.hidden = !games;
    for (const [key, tab] of Object.entries(tabs)) tab.setAttribute('aria-pressed', String(key === name));
    if (games) { if (!current) open(GAMES[0].id); } else {
      if (stop) stop();
      stop = null;
      current = null;
      stage.replaceChildren();
      for (const button of picker.children) button.setAttribute('aria-pressed', 'false');
    }
  }

  for (const game of GAMES) {
    const button = el('button', { type: 'button', class: 'secondary' }, game.label);
    button.dataset.game = game.id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => open(game.id));
    picker.append(button);
  }
  tabs.planner.addEventListener('click', () => show('planner'));
  tabs.games.addEventListener('click', () => show('games'));
}
