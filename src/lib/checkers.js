// Motor de damas (checkers) - regras americanas, captura obrigatória, multi-salto, damas (kings).
export const SIZE = 8;
export const EMPTY = 0;
export const WHITE = 1; // jogador
export const BLACK = 2; // IA
export const WHITE_KING = 3;
export const BLACK_KING = 4;

export function initialBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = BLACK;
  for (let r = 5; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = WHITE;
  return b;
}

export function owner(p) {
  if (p === WHITE || p === WHITE_KING) return WHITE;
  if (p === BLACK || p === BLACK_KING) return BLACK;
  return 0;
}

function isKing(p) { return p === WHITE_KING || p === BLACK_KING; }

function directionsFor(p) {
  if (p === WHITE) return [[-1, -1], [-1, 1]];
  if (p === BLACK) return [[1, -1], [1, 1]];
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
}

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function maybePromote(p, row) {
  if (p === WHITE && row === 0) return WHITE_KING;
  if (p === BLACK && row === 7) return BLACK_KING;
  return p;
}

// Retorna todas as sequências de captura máximas a partir de (r,c).
function capturePaths(board, r, c) {
  const piece = board[r][c];
  if (piece === EMPTY) return [];
  const dirs = directionsFor(piece);
  const paths = [];
  function recurse(cur, cr, cc, acc) {
    let extended = false;
    for (const [dr, dc] of dirs) {
      const mr = cr + dr, mc = cc + dc;
      const lr = cr + 2 * dr, lc = cc + 2 * dc;
      if (!inBounds(lr, lc)) continue;
      const mid = cur[mr][mc];
      if (mid === EMPTY || owner(mid) === owner(piece)) continue;
      if (cur[lr][lc] !== EMPTY) continue;
      const nb = cur.map(row => row.slice());
      nb[cr][cc] = EMPTY;
      nb[mr][mc] = EMPTY;
      const promoted = maybePromote(piece, lr);
      nb[lr][lc] = promoted;
      const move = { from: [cr, cc], to: [lr, lc], capture: [mr, mc] };
      extended = true;
      if (promoted !== piece && !isKing(piece)) {
        paths.push([...acc, move]);
      } else {
        recurse(nb, lr, lc, [...acc, move]);
      }
    }
    if (!extended && acc.length > 0) paths.push(acc);
  }
  recurse(board, r, c, []);
  return paths;
}

export function allMovesFor(board, player) {
  const captures = [];
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (owner(p) !== player) continue;
      const cps = capturePaths(board, r, c);
      if (cps.length) {
        for (const path of cps) captures.push({ from: [r, c], path });
      } else {
        const dirs = directionsFor(p);
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] !== EMPTY) continue;
          moves.push({ from: [r, c], to: [nr, nc], path: null });
        }
      }
    }
  }
  if (captures.length) return { legal: captures, hasCapture: true };
  return { legal: moves, hasCapture: false };
}

export function applyMove(board, move) {
  const nb = board.map(row => row.slice());
  const [fr, fc] = move.from;
  let piece = nb[fr][fc];
  nb[fr][fc] = EMPTY;
  if (move.path && move.path.length) {
    let cr = fr, cc = fc;
    for (const jump of move.path) {
      const [lr, lc] = jump.to;
      const [mr, mc] = jump.capture;
      nb[cr][cc] = EMPTY;
      nb[mr][mc] = EMPTY;
      piece = maybePromote(piece, lr);
      nb[lr][lc] = piece;
      cr = lr; cc = lc;
    }
  } else {
    const [tr, tc] = move.to;
    piece = maybePromote(piece, tr);
    nb[tr][tc] = piece;
  }
  return nb;
}

function opponent(player) { return player === WHITE ? BLACK : WHITE; }

function evaluate(board) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (p === WHITE) score -= 3 + (7 - r) * 0.1;
      else if (p === BLACK) score += 3 + r * 0.1;
      else if (p === WHITE_KING) score -= 5;
      else if (p === BLACK_KING) score += 5;
    }
  }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, player) {
  const { legal } = allMovesFor(board, player);
  if (legal.length === 0) return maximizing ? -10000 : 10000;
  if (depth === 0) return evaluate(board);
  if (maximizing) {
    let best = -Infinity;
    for (const m of legal) {
      const v = minimax(applyMove(board, m), depth - 1, alpha, beta, false, opponent(player));
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of legal) {
      const v = minimax(applyMove(board, m), depth - 1, alpha, beta, true, opponent(player));
      best = Math.min(best, v);
      beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function bestMove(board, player, depth = 4) {
  const { legal } = allMovesFor(board, player);
  if (legal.length === 0) return null;
  const isMax = player === BLACK;
  let bestVal = isMax ? -Infinity : Infinity;
  const candidates = [];
  for (const m of legal) {
    const v = minimax(applyMove(board, m), depth - 1, -Infinity, Infinity, !isMax, opponent(player));
    if (isMax ? v > bestVal : v < bestVal) {
      bestVal = v;
      candidates.length = 0;
      candidates.push(m);
    } else if (v === bestVal) {
      candidates.push(m);
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || legal[0];
}

export function checkWinner(board, turn) {
  const { legal } = allMovesFor(board, turn);
  if (legal.length === 0) return opponent(turn);
  return null;
}

export function countPieces(board) {
  let w = 0, b = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (owner(p) === WHITE) w++;
      else if (owner(p) === BLACK) b++;
    }
  return { w, b };
}