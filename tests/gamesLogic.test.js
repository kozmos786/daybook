import test from 'node:test';
import assert from 'node:assert/strict';
import {
  c4Drop, c4Winner, chessBestMove, chessMove, chessMoves, chessStart, chessStatus, snakeStart, snakeStep, snakeTurn, tttBestMove, tttWinner,
} from '../src/gamesLogic.js';

function perft(state, depth) {
  if (depth === 0) return 1;
  let total = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      for (const to of chessMoves(state, r, c)) total += perft(chessMove(state, [r, c], to), depth - 1);
    }
  }
  return total;
}

test('chess move generation matches the known perft counts', () => {
  const start = chessStart();
  assert.equal(perft(start, 1), 20);
  assert.equal(perft(start, 2), 400);
  assert.equal(perft(start, 3), 8902);
});

test('chess detects fool\'s mate, rejects illegal moves, and supports castling', () => {
  let s = chessStart();
  for (const [from, to] of [[[6, 5], [5, 5]], [[1, 4], [3, 4]], [[6, 6], [4, 6]], [[0, 3], [4, 7]]]) s = chessMove(s, from, to);
  assert.equal(chessStatus(s), 'checkmate');
  assert.equal(chessMove(chessStart(), [7, 0], [5, 0]), null);

  let c = chessStart();
  for (const [from, to] of [[[6, 4], [4, 4]], [[1, 4], [3, 4]], [[7, 6], [5, 5]], [[0, 6], [2, 5]], [[7, 5], [4, 2]], [[0, 5], [3, 2]]]) c = chessMove(c, from, to);
  c = chessMove(c, [7, 4], [7, 6]);
  assert.equal(c.board[7][5], 'wR');
  assert.equal(c.board[7][6], 'wK');
});

test('chess bot finds mate in one and plays legal moves at every level', () => {
  let s = chessStart();
  for (const [from, to] of [[[6, 5], [5, 5]], [[1, 4], [3, 4]], [[6, 6], [4, 6]]]) s = chessMove(s, from, to);
  const mate = chessBestMove(s, 2);
  assert.deepEqual([mate.from, mate.to], [[0, 3], [4, 7]]);
  for (const depth of [1, 2, 3]) {
    const move = chessBestMove(chessStart(), depth);
    assert.ok(chessMove(chessStart(), move.from, move.to));
  }
});

test('tic-tac-toe computer never loses and takes a win', () => {
  assert.equal(tttBestMove(['O', 'O', null, 'X', 'X', null, null, null, null], 'O'), 2);
  const play = (board, turn) => {
    const result = tttWinner(board);
    if (result) return result !== 'X';
    if (turn === 'O') { board[tttBestMove(board, 'O')] = 'O'; return play(board, 'X'); }
    return board.every((cell, i) => {
      if (cell) return true;
      const next = board.slice();
      next[i] = 'X';
      return play(next, 'O');
    });
  };
  assert.equal(play(Array(9).fill(null), 'X'), true);
});

test('connect four drops and detects four in a row', () => {
  let board = Array(42).fill(null);
  for (let i = 0; i < 4; i += 1) board = c4Drop(board, i, 'R');
  assert.equal(c4Winner(board), 'R');
  let full = Array(42).fill(null);
  for (let i = 0; i < 6; i += 1) full = c4Drop(full, 0, 'Y');
  assert.equal(c4Drop(full, 0, 'R'), null);
});

test('snake moves, grows, forbids reversing, and ends on walls', () => {
  let s = snakeStart(15, () => 0);
  s = { ...s, food: { x: s.snake[0].x + 1, y: s.snake[0].y } };
  s = snakeStep(s, () => 0);
  assert.equal(s.score, 1);
  assert.equal(s.snake.length, 4);
  assert.equal(snakeTurn(s, { x: -1, y: 0 }).dir.x, 1);
  let wall = snakeStart(5, () => 0);
  for (let i = 0; i < 6; i += 1) wall = snakeStep(wall, () => 0);
  assert.equal(wall.over, true);
});
