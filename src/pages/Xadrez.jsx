import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trophy, Skull, Swords, Volume2, VolumeX, Shield, Play } from "lucide-react";
import confetti from "canvas-confetti";
import { getBalance, getHouseConfig, placeBet, settleMatch, abandonMatch } from "@/lib/wallet";
import db from "@/api/localDatabase";
import LoginGate from "@/components/LoginGate";
import OpponentSelect from "@/components/OpponentSelect";

// SVG Chess Pieces
function ChessPiece({ piece, className = "h-8 w-8 sm:h-10 sm:w-10" }) {
  if (!piece) return null;
  const isWhite = piece[0] === "w";
  const type = piece[1];

  const fill = isWhite ? "#FFFFFF" : "#1A1A1A";
  const stroke = isWhite ? "#27272A" : "#FAFAFA";
  const strokeWidth = "1.5";

  if (type === "P") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 1.47,-1.19 2.41,-3 2.41,-5.03 0,-2.41 -1.33,-4.5 -3.28,-5.62 0.49,-0.67 0.78,-1.49 0.78,-2.38 0,-2.21 -1.79,-4 -4,-4 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
      </svg>
    );
  }
  if (type === "N") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 22,10 c 10.5,1 16.5,8 16,29 l -23,0 c 0,-9 10,-6.5 8,-21"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 24,18 c 0.38,2.91 -5.55,7.37 -8,9 -3,2 -2.82,4.34 -5,4 -1.042,-0.94 1.41,-3.04 0,-3 -1,0 0.19,1.23 -1,2 -1,0 -4.003,1 -4,-4 0,-2 6,-12 6,-12 0,0 1.89,-1.9 2,-3.5 -0.73,-0.994 -0.5,-2 -0.5,-3 1,-1 3,2.5 3,2.5 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
      </svg>
    );
  }
  if (type === "B") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 9,36 c 3.39,-0.97 10.11,0.43 13.5,-2 3.39,2.43 10.11,1.03 13.5,2 0,0 1.65,0.54 3,2 -0.68,0.97 -1.65,0.99 -3,1 -3.39,-0.97 -10.11,0.46 -13.5,-1 -3.39,1.46 -10.11,0.03 -13.5,1 -1.354,-0.01 -2.324,-0.03 -3,-1 1.35,-1.46 3,-2 3,-2 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 15,32 c 2.5,2.5 12.5,2.5 15,0 0.5,-1.5 0,-2 0,-2 0,-2.5 -2.5,-4 -2.5,-4 5.5,-1.5 6,-11.5 -5,-15.5 -11,4 -10.5,14 -5,15.5 0,0 -2.5,1.5 -2.5,4 0,0 -0.5,0.5 0,2 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <circle cx="22.5" cy="8.5" r="2.5" style={{ fill, stroke, strokeWidth }} />
      </svg>
    );
  }
  if (type === "R") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 9,39 27,0 c 0,-3 -3,-3 -3,-3 l -21,0 c 0,0 -3,0 -3,3 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 12,36 21,0 c 0,-4 -3.5,-6 -3.5,-6 l -14,0 c 0,0 -3.5,2 -3.5,6 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 14,29.5 17,0 c 0,-10 -2,-13.5 -2,-13.5 l -13,0 c 0,0 -2,3.5 -2,13.5 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 11,14 4,0 0,3 3,0 0,-3 4.5,0 0,3 3,0 0,-3 4,0 c 1.5,0 2.5,-1 2.5,-2.5 l 0,-2.5 -23,0 0,2.5 c 0,1.5 1,2.5 2.5,2.5 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
      </svg>
    );
  }
  if (type === "Q") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 9,26 c 8.5,-1.5 21,-1.5 27,0 l 2,-12 -7,5 -3.5,-7 -3.5,7 -7,-5 2,12 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 9,26 c 0,2 1.5,2 2.5,4 1,1.5 1,1 0.5,3.5 -1.5,1 -1.5,2.5 -1.5,2.5 -1.5,1.5 0.5,2.5 0.5,2.5 6.5,1 16.5,1 23,0 0,0 1.5,-1 0.5,-2.5 0,0 0,-1.5 -1.5,-2.5 -0.5,-2.5 -0.5,-2 0.5,-3.5 1,-2 2.5,-2 2.5,-4 -8.5,-1.5 -18.5,-1.5 -27,0 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <circle cx="6" cy="12" r="2" style={{ fill, stroke, strokeWidth }} />
        <circle cx="14" cy="9" r="2" style={{ fill, stroke, strokeWidth }} />
        <circle cx="22.5" cy="8" r="2" style={{ fill, stroke, strokeWidth }} />
        <circle cx="31" cy="9" r="2" style={{ fill, stroke, strokeWidth }} />
        <circle cx="39" cy="12" r="2" style={{ fill, stroke, strokeWidth }} />
      </svg>
    );
  }
  if (type === "K") {
    return (
      <svg viewBox="0 0 45 45" className={className}>
        <path
          d="m 22.5,11.63 0,-4.63 m -3,2.5 6,0"
          style={{ fill: "none", stroke, strokeWidth: "2", strokeLinecap: "round" }}
        />
        <path
          d="m 22.5,25 c 0,0 4.5,-7.5 3,-10.5 -1.5,-3 -5.5,-3 -7,0 -1.5,3 3,10.5 3,10.5"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <path
          d="m 12.5,37 c 5.5,3.5 14.5,3.5 20,0 l 0,-4 c 0,-4 -4,-4 -4,-4 l -12,0 c 0,0 -4,0 -4,4 l 0,4 z"
          style={{ fill, stroke, strokeWidth, strokeLinecap: "round" }}
        />
        <circle cx="22.5" cy="16.5" r="2.5" style={{ fill: isWhite ? "#fde047" : "#ef4444", stroke, strokeWidth }} />
      </svg>
    );
  }
  return null;
}

const PIECE_VALUES = { P: 10, N: 30, B: 35, R: 50, Q: 90, K: 1000 };

const INITIAL_BOARD = [
  ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
  ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
  ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
];

// Simple synthesizer for audio feedback
const playTone = (type = "move") => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "move") {
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === "capture") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "win") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch {
    // audio not supported or blocked
  }
};

// Generates valid moves for a piece at [r, c] on board
function getValidMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece[0]; // 'w' or 'b'
  const type = piece[1]; // 'P', 'R', 'N', 'B', 'Q', 'K'
  const moves = [];

  const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

  const addIfValid = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    const dest = board[nr][nc];
    if (!dest) {
      moves.push({ r: nr, c: nc, capture: false });
      return true; // continue sliding
    }
    if (dest[0] !== color) {
      moves.push({ r: nr, c: nc, capture: true, captured: dest });
    }
    return false; // hit obstacle, stop sliding
  };

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;

    // 1 step forward
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c, capture: false });
      // 2 steps forward from start
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c, capture: false });
      }
    }

    // Diagonal captures
    [-1, 1].forEach((dc) => {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc][0] !== color) {
        moves.push({ r: nr, c: nc, capture: true, captured: board[nr][nc] });
      }
    });
  } else if (type === "N") {
    const jumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    jumps.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
  } else if (type === "B" || type === "R" || type === "Q") {
    const dirs = [];
    if (type === "B" || type === "Q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === "R" || type === "Q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

    dirs.forEach(([dr, dc]) => {
      let step = 1;
      while (step < 8) {
        const canContinue = addIfValid(r + dr * step, c + dc * step);
        if (!canContinue) break;
        step++;
      }
    });
  } else if (type === "K") {
    const dirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1],
    ];
    dirs.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
  }

  return moves;
}

// Check if King is attacked
function isKingAttacked(board, color) {
  let kingPos = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === `${color}K`) {
        kingPos = { r, c };
        break;
      }
    }
  }
  if (!kingPos) return false;

  const opponentColor = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece[0] === opponentColor) {
        const moves = getValidMoves(board, r, c);
        if (moves.some((m) => m.r === kingPos.r && m.c === kingPos.c)) {
          return true;
        }
      }
    }
  }
  return false;
}

export default function Xadrez() {
  const { user, refreshBalance } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(25);
  const [opponentMode, setOpponentMode] = useState("bot");
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [match, setMatch] = useState(null);
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [turn, setTurn] = useState("w"); // 'w' (player) or 'b' (bot/black)
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [capturedWhite, setCapturedWhite] = useState([]);
  const [capturedBlack, setCapturedBlack] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [gameState, setGameState] = useState("idle"); // idle, playing, won, lost, draw
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const settlingRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const [b, c, matches] = await Promise.all([
        getBalance(),
        getHouseConfig(),
        db.entities.Match.list("-created_date"),
      ]);
      setBalance(b);
      setConfig(c);
      if (c?.min_bet && bet < c.min_bet) setBet(c.min_bet);

      const active = (matches || []).find((m) => m.game === "xadrez" && m.status === "playing");
      if (active) {
        setMatch(active);
        setBet(Number(active.bet_amount || 25));
        setGameState("playing");
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Valid moves for currently selected square
  const currentValidMoves = useMemo(() => {
    if (!selectedSquare || gameState !== "playing") return [];
    return getValidMoves(board, selectedSquare.r, selectedSquare.c);
  }, [board, selectedSquare, gameState]);

  // Check state
  const whiteInCheck = useMemo(() => isKingAttacked(board, "w"), [board]);
  const blackInCheck = useMemo(() => isKingAttacked(board, "b"), [board]);

  const sound = useCallback((type) => {
    if (soundEnabled) playTone(type);
  }, [soundEnabled]);

  // Start match & place bet
  const handleStartGame = async () => {
    if (!user) {
      setError("Faça login para jogar.");
      return;
    }
    if ((balance ?? 0) < bet) {
      setError("Saldo insuficiente para esta aposta.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const newMatch = await placeBet(bet, "xadrez");
      setMatch(newMatch);
      setBoard(INITIAL_BOARD.map((r) => [...r]));
      setTurn("w");
      setSelectedSquare(null);
      setLastMove(null);
      setCapturedWhite([]);
      setCapturedBlack([]);
      setMoveHistory([]);
      setGameState("playing");
      settlingRef.current = false;
      const nextBal = (balance ?? 0) - bet;
      setBalance(nextBal);
      refreshBalance?.();
      sound("move");
    } catch (err) {
      if (err.message?.includes("já tem uma partida em andamento")) {
        try {
          const matches = await db.entities.Match.list("-created_date");
          const active = (matches || []).find((m) => m.game === "xadrez" && m.status === "playing");
          if (active) {
            setMatch(active);
            setBet(Number(active.bet_amount || 25));
            setGameState("playing");
            return;
          }
        } catch {
          // noop
        }
      }
      setError(err.message || "Não foi possível iniciar a partida.");
    } finally {
      setBusy(false);
    }
  };

  // Settle game finish
  const handleFinish = useCallback(async (winner) => {
    if (!match || settlingRef.current) return;
    settlingRef.current = true;

    const rake = (config?.rake_percent || 10) / 100;
    let payout = 0;
    let status = "lost";
    let houseCut = 0;

    if (winner === "player") {
      houseCut = 2 * match.bet_amount * rake;
      payout = 2 * match.bet_amount - houseCut;
      status = "won";
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      sound("win");
    } else if (winner === "draw") {
      payout = match.bet_amount;
      status = "draw";
    }

    try {
      const updatedBalance = await settleMatch(match, status, payout, houseCut);
      setBalance(updatedBalance);
      refreshBalance?.();
      setGameState(status);
    } catch (err) {
      console.error("[ArenaBet] Erro ao liquidar partida de xadrez:", err);
    }
  }, [match, config, refreshBalance, sound]);

  // Abandon match
  const handleAbandon = async () => {
    if (!match) return;
    try {
      await abandonMatch(match, "Partida abandonada pelo jogador.");
      setMatch(null);
      setGameState("idle");
      setBoard(INITIAL_BOARD.map((r) => [...r]));
      setSelectedSquare(null);
      setLastMove(null);
      setCapturedWhite([]);
      setCapturedBlack([]);
      setMoveHistory([]);
      await loadData();
      refreshBalance?.();
    } catch {
      // noop
    }
  };

  // Move piece execution
  const executeMove = useCallback((fromR, fromC, toR, toC, currentBoard = board) => {
    const next = currentBoard.map((row) => [...row]);
    let piece = next[fromR][fromC];
    const target = next[toR][toC];

    // Capture track
    if (target) {
      if (target[0] === "w") setCapturedWhite((cw) => [...cw, target]);
      else setCapturedBlack((cb) => [...cb, target]);
      sound("capture");
    } else {
      sound("move");
    }

    // Pawn promotion to Queen
    if (piece === "wP" && toR === 0) piece = "wQ";
    if (piece === "bP" && toR === 7) piece = "bQ";

    next[toR][toC] = piece;
    next[fromR][fromC] = null;

    setBoard(next);

    const fileLetters = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const moveNotation = `${fileLetters[fromC]}${8 - fromR} → ${fileLetters[toC]}${8 - toR}`;
    setMoveHistory((prev) => [moveNotation, ...prev.slice(0, 19)]);
    setLastMove({ from: { r: fromR, c: fromC }, to: { r: toR, c: toC } });
    setSelectedSquare(null);

    // King captured = instant victory
    if (target === "bK") {
      setTimeout(() => handleFinish("player"), 300);
    } else if (target === "wK") {
      setTimeout(() => handleFinish("ai"), 300);
    }

    return next;
  }, [board, handleFinish, sound]);

  // Bot AI Turn
  const makeAiMove = useCallback((currentBoard) => {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece[0] === "b") {
          const valid = getValidMoves(currentBoard, r, c);
          valid.forEach((m) => {
            allMoves.push({ from: { r, c }, to: { r: m.r, c: m.c }, capture: m.capture, target: m.captured });
          });
        }
      }
    }

    if (allMoves.length === 0) {
      if (isKingAttacked(currentBoard, "b")) handleFinish("player");
      else handleFinish("draw");
      setIsAiThinking(false);
      return;
    }

    // AI Heuristic: prioritize captures by piece value, center control, or smart random
    allMoves.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (a.capture && a.target) scoreA += (PIECE_VALUES[a.target[1]] || 10) * 10;
      if (b.capture && b.target) scoreB += (PIECE_VALUES[b.target[1]] || 10) * 10;

      // Center control (rows 3,4 and cols 3,4)
      if (a.to.r >= 3 && a.to.r <= 4 && a.to.c >= 3 && a.to.c <= 4) scoreA += 5;
      if (b.to.r >= 3 && b.to.r <= 4 && b.to.c >= 3 && b.to.c <= 4) scoreB += 5;

      scoreA += Math.random() * 3;
      scoreB += Math.random() * 3;

      return scoreB - scoreA;
    });

    const chosen = allMoves[0];
    executeMove(chosen.from.r, chosen.from.c, chosen.to.r, chosen.to.c, currentBoard);
    setTurn("w");
    setIsAiThinking(false);
  }, [executeMove, handleFinish]);

  // Player click on square
  const handleSquareClick = (r, c) => {
    if (gameState !== "playing" || isAiThinking) return;

    // In bot mode, player is always white ('w')
    if (opponentMode === "bot" && turn !== "w") return;

    const clickedPiece = board[r][c];

    // If clicking a valid destination for selected piece
    if (selectedSquare) {
      const valid = currentValidMoves.find((m) => m.r === r && m.c === c);
      if (valid) {
        const nextBoard = executeMove(selectedSquare.r, selectedSquare.c, r, c, board);
        if (opponentMode === "bot") {
          setTurn("b");
          setIsAiThinking(true);
          setTimeout(() => {
            makeAiMove(nextBoard);
          }, 600);
        } else {
          setTurn((t) => (t === "w" ? "b" : "w"));
        }
        return;
      }
    }

    // If clicking on their own piece
    if (clickedPiece && clickedPiece[0] === turn) {
      setSelectedSquare({ r, c });
    } else {
      setSelectedSquare(null);
    }
  };

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

  const rakePercent = config?.rake_percent ?? 10;
  const potentialPrize = 2 * bet * (1 - rakePercent / 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Lobby
          </Link>
          <div className="flex items-center gap-2">
            <ChessPiece piece="wK" className="h-6 w-6" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">Xadrez ArenaBet</h1>
            <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#E8D48B]">
              Liberado
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white transition"
            title={soundEnabled ? "Desativar som" : "Ativar som"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3.5 py-1.5 text-xs">
            <span className="text-white/50">Saldo:</span>
            <span className="font-bold text-[#E8D48B]">
              {balance != null ? `R$ ${balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {!user ? (
        <LoginGate />
      ) : (
        <div className="grid gap-6 md:grid-cols-12">
          {/* Main Board View */}
          <div className="md:col-span-7 lg:col-span-8 space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-[#C9A227]/25 bg-[#0B1220]/90 p-4 sm:p-5 shadow-2xl backdrop-blur">
              {/* Opponent Bar */}
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-lg ring-1 ring-white/15">
                    <ChessPiece piece="bK" className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {opponentMode === "bot" ? "Bot ArenaBet (Pretas)" : "Jogador 2 (Pretas)"}
                    </div>
                    <div className="text-[10px] text-white/50">
                      {isAiThinking ? "Pensando jogada..." : turn === "b" ? "Vez das Pretas" : "Aguardando..."}
                    </div>
                  </div>
                </div>

                {/* Captured white pieces by opponent */}
                <div className="flex flex-wrap items-center gap-1">
                  {capturedWhite.map((p, i) => (
                    <ChessPiece key={i} piece={p} className="h-5 w-5 sm:h-6 sm:w-6 opacity-80" />
                  ))}
                </div>
              </div>

              {/* 8x8 Chessboard */}
              <div className="mx-auto max-w-[500px] select-none rounded-2xl border-4 border-[#3a2c1b] bg-[#231a10] p-2 shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)]">
                <div className="grid grid-cols-8 gap-0 border border-[#4a3a24]">
                  {board.map((row, r) =>
                    row.map((piece, c) => {
                      const isDark = (r + c) % 2 === 1;
                      const isSelected = selectedSquare && selectedSquare.r === r && selectedSquare.c === c;
                      const isValidDest = currentValidMoves.some((m) => m.r === r && m.c === c);
                      const isCaptureDest = isValidDest && currentValidMoves.find((m) => m.r === r && m.c === c)?.capture;
                      const isLastMoveSquare = lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c));
                      const isCheckKing = (piece === "wK" && whiteInCheck) || (piece === "bK" && blackInCheck);

                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onClick={() => handleSquareClick(r, c)}
                          disabled={gameState !== "playing" || isAiThinking}
                          className={`relative flex aspect-square items-center justify-center text-3xl sm:text-4xl transition-all ${
                            isDark ? "bg-[#769656]" : "bg-[#eeeed2]"
                          } ${isSelected ? "ring-4 ring-inset ring-amber-400 bg-amber-300/40" : ""} ${
                            isLastMoveSquare ? "bg-yellow-200/50" : ""
                          } ${isCheckKing ? "ring-4 ring-inset ring-rose-500 bg-rose-500/40 animate-pulse" : ""}`}
                        >
                          {/* Rank number on leftmost column */}
                          {c === 0 && (
                            <span className={`absolute left-0.5 top-0.5 text-[9px] font-bold ${isDark ? "text-[#eeeed2]/70" : "text-[#769656]"}`}>
                              {ranks[r]}
                            </span>
                          )}
                          {/* File letter on bottom row */}
                          {r === 7 && (
                            <span className={`absolute right-0.5 bottom-0.5 text-[9px] font-bold ${isDark ? "text-[#eeeed2]/70" : "text-[#769656]"}`}>
                              {files[c]}
                            </span>
                          )}

                          {/* Valid Move Indicator */}
                          {isValidDest && !piece && (
                            <div className="h-3.5 w-3.5 rounded-full bg-black/25 backdrop-blur ring-1 ring-black/40" />
                          )}
                          {isCaptureDest && piece && (
                            <div className="absolute inset-1 rounded-full border-2 border-rose-500/80 ring-2 ring-rose-400/40" />
                          )}

                          {/* Piece */}
                          {piece && (
                            <div className="flex items-center justify-center transition-transform hover:scale-110 drop-shadow-[0_3px_5px_rgba(0,0,0,0.5)]">
                              <ChessPiece piece={piece} className="h-7 w-7 sm:h-9 sm:w-9" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Player Bar */}
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A227]/20 text-lg text-[#E8D48B] ring-1 ring-[#C9A227]/40">
                    <ChessPiece piece="wK" className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {user?.full_name || "Você (Brancas)"}
                    </div>
                    <div className="text-[10px] text-white/50">
                      {turn === "w" && gameState === "playing" ? "Sua vez de jogar" : "Aguardando..."}
                    </div>
                  </div>
                </div>

                {/* Captured black pieces by player */}
                <div className="flex flex-wrap items-center gap-1">
                  {capturedBlack.map((p, i) => (
                    <ChessPiece key={i} piece={p} className="h-5 w-5 sm:h-6 sm:w-6 opacity-90" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Betting */}
          <div className="md:col-span-5 lg:col-span-4 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[#0B1220]/80 p-5 shadow-xl backdrop-blur space-y-5">
              {gameState === "idle" ? (
                <>
                  <div>
                    <h2 className="font-display text-lg font-bold text-white">Configurar Partida</h2>
                    <p className="mt-1 text-xs text-white/50">
                      Escolha a aposta e enfrente o bot ArenaBet ou jogue no mesmo dispositivo.
                    </p>
                  </div>

                  {/* Opponent Selection */}
                  <OpponentSelect
                    value={opponentMode}
                    onChange={setOpponentMode}
                    disabled={busy}
                  />

                  {/* Bet Amount */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Valor da Aposta</span>
                      <span className="text-[#E8D48B]">Min: R$ {config?.min_bet || 10}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[10, 25, 50, 100].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setBet(v)}
                          disabled={busy}
                          className={`rounded-xl border py-2 text-xs font-semibold transition ${
                            bet === v
                              ? "border-[#C9A227] bg-[#C9A227]/20 text-[#E8D48B]"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          R$ {v}
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      min={config?.min_bet || 10}
                      max={config?.max_bet || 1000}
                      value={bet}
                      onChange={(e) => setBet(Math.max(1, Number(e.target.value)))}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-center text-sm font-bold text-white outline-none focus:border-[#C9A227]"
                    />
                  </div>

                  {/* Prize calculation breakdown */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs space-y-2">
                    <div className="flex justify-between text-white/60">
                      <span>Pote total</span>
                      <span className="font-semibold text-white">R$ {(bet * 2).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Comissão da casa ({rakePercent}%)</span>
                      <span className="text-emerald-400">R$ {((bet * 2 * rakePercent) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                      <span className="text-white">Prêmio Líquido</span>
                      <span className="text-[#E8D48B]">R$ {potentialPrize.toFixed(2)}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleStartGame}
                    disabled={busy || (balance ?? 0) < bet}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E8D48B] to-[#C9A227] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
                  >
                    <Play className="h-4 w-4 fill-black" />
                    Iniciar Partida · R$ {bet}
                  </button>
                </>
              ) : (
                /* Active Game Controls */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs text-white/60">Partida em andamento</span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                      Pote: R$ {(bet * 2).toFixed(2)}
                    </span>
                  </div>

                  {/* Check Indicator Banner */}
                  {whiteInCheck && gameState === "playing" && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-2.5 text-center text-xs font-bold text-rose-300 animate-pulse">
                      Seu Rei está em XEQUE!
                    </div>
                  )}
                  {blackInCheck && gameState === "playing" && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-2.5 text-center text-xs font-bold text-amber-300">
                      Rei adversário em XEQUE!
                    </div>
                  )}

                  {/* Win / Loss Modal Summary */}
                  {gameState !== "playing" && (
                    <div
                      className={`rounded-2xl border p-4 text-center ${
                        gameState === "won"
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : gameState === "draw"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      <div className="flex justify-center text-3xl">
                        {gameState === "won" ? <Trophy className="h-10 w-10 text-[#E8D48B]" /> : <Skull className="h-10 w-10 text-rose-400" />}
                      </div>
                      <h3 className="mt-2 text-lg font-bold">
                        {gameState === "won" ? "Vitória no Xadrez!" : gameState === "draw" ? "Empate!" : "Fim de Partida"}
                      </h3>
                      <p className="mt-1 text-xs opacity-80">
                        {gameState === "won"
                          ? `Parabéns! Você faturou R$ ${potentialPrize.toFixed(2)}.`
                          : gameState === "draw"
                          ? "A aposta foi devolvida ao seu saldo."
                          : "O adversário capturou seu Rei ou você foi derrotado."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setGameState("idle")}
                        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Jogar Novamente
                      </button>
                    </div>
                  )}

                  {/* Move History */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-white/60">
                      <span>Histórico de Lances</span>
                      <span>{moveHistory.length} lances</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-white/70 font-mono">
                      {moveHistory.length === 0 ? (
                        <div className="text-[11px] text-white/30 italic">Aguardando primeiro lance...</div>
                      ) : (
                        moveHistory.map((m, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] border-b border-white/5 pb-0.5">
                            <span className="text-white/40">#{moveHistory.length - idx}</span>
                            <span>{m}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {gameState === "playing" && (
                    <button
                      type="button"
                      onClick={handleAbandon}
                      className="h-10 w-full rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                    >
                      Abandonar Partida
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Tips */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/50 space-y-1.5">
              <div className="font-semibold text-white/70 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#E8D48B]" /> Regras Oficiais
              </div>
              <p>• Peões avançam 1 casa (ou 2 no lance inicial) e capturam na diagonal.</p>
              <p>• Peões promovem a Dama ao alcançar a oitava fileira.</p>
              <p>• O cavalo se move em formato de L e pode pular peças.</p>
              <p>• Capture o Rei adversário para faturar o pote da rodada!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
