import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Crown, RotateCcw, Loader2, Coins, ArrowLeft, Flag, Trophy, Skull } from "lucide-react";
import confetti from "canvas-confetti";
import * as Checkers from "@/lib/checkers";
import LoginGate from "@/components/LoginGate";
import MatchmakingPanel from "@/components/MatchmakingPanel";
import OpponentSelect from "@/components/OpponentSelect";
import { BOT_OPPONENT, canControlTurn, isHumanOpponent, sideLabel } from "@/lib/opponent";
import { abandonMatch, getHouseConfig, getBalance, placeBet, settleMatch } from "@/lib/wallet";

function Piece({ p }) {
  if (p === 0) return null;
  const isWhite = p === Checkers.WHITE || p === Checkers.WHITE_KING;
  const isKing = p === Checkers.WHITE_KING || p === Checkers.BLACK_KING;
  return (
    <div className="relative w-[80%] h-[80%] drop-shadow-[0_6px_6px_rgba(0,0,0,0.55)]">
      <div className="absolute inset-x-[6%] bottom-0 top-[14%] rounded-full bg-black/40 blur-[1px]" />
      <div
        className={`piece-shine absolute inset-0 rounded-full flex items-center justify-center ring-1 ${
          isWhite
            ? "bg-[radial-gradient(circle_at_32%_28%,#fffdf5,#fde9b8_45%,#c8973f_88%,#8a611f_100%)] ring-amber-100/70"
            : "bg-[radial-gradient(circle_at_32%_28%,#5b5b63,#2b2b31_45%,#0f0f13_88%,#000_100%)] ring-zinc-500/50"
        }`}
      >
        <div className={`absolute inset-[16%] rounded-full ring-1 ${isWhite ? "ring-amber-700/40" : "ring-black/60"}`} />
        <div className={`absolute inset-[30%] rounded-full ring-[3px] ${isWhite ? "ring-amber-600/25" : "ring-white/10"}`} />
        {isKing && <Crown className={`relative w-[46%] h-[46%] drop-shadow ${isWhite ? "text-amber-800" : "text-amber-300"}`} />}
      </div>
    </div>
  );
}

function moveDestination(move) {
  return move.path?.[move.path.length - 1]?.to || move.to;
}

function moveLabel(move) {
  if (!move) return "Nenhuma jogada ainda";
  const square = ([r, c]) => `${String.fromCharCode(97 + c)}${8 - r}`;
  const captureCount = move.path?.length || 0;
  return `${square(move.from)} → ${square(moveDestination(move))}${captureCount ? ` · ${captureCount} captura${captureCount > 1 ? "s" : ""}` : ""}`;
}

export default function Dama() {
  const { refreshBalance, user, authReady } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [opponentMode, setOpponentMode] = useState("bot");
  const [opponent, setOpponent] = useState(BOT_OPPONENT);
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState(null);
  const [board, setBoard] = useState(null);
  const [turn, setTurn] = useState("player");
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const matchRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const settlingRef = React.useRef(false);
  const settledRef = React.useRef(false);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([getBalance(), getHouseConfig()]);
      setBalance(b);
      setConfig(c);
      if (bet < c.min_bet) setBet(c.min_bet);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [bet]);
  useEffect(() => { load(); }, [load]);

  const legalMap = useMemo(() => {
    if (!board || result || !canControlTurn(turn, opponent)) return { byFrom: {}, hasCapture: false };
    const color = turn === "player" ? Checkers.WHITE : Checkers.BLACK;
    const { legal, hasCapture } = Checkers.allMovesFor(board, color);
    const byFrom = {};
    for (const m of legal) {
      const key = `${m.from[0]}-${m.from[1]}`;
      (byFrom[key] = byFrom[key] || []).push(m);
    }
    return { byFrom, hasCapture };
  }, [board, turn, result, opponent]);

  const finish = useCallback(async (winner) => {
    if (!match || settlingRef.current || settledRef.current) return;
    settlingRef.current = true;
    const rake = (config?.rake_percent || 0) / 100;
    let payout = 0, status = "lost", houseCut = 0;
    if (winner === "player") {
      houseCut = 2 * match.bet_amount * rake;
      payout = 2 * match.bet_amount - houseCut;
      status = "won";
    } else if (winner === "draw") {
      payout = match.bet_amount;
      status = "draw";
    }
    try {
      const newBal = await settleMatch(match, status, payout, houseCut);
      setBalance(newBal);
      refreshBalance?.();
      setResult({ winner, payout, houseCut, status, bet: match.bet_amount });
      settledRef.current = true;
    } catch (e) {
      settlingRef.current = false;
      setError(e.message);
    }
  }, [match, config, refreshBalance]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      const activeMatch = matchRef.current;
      mountedRef.current = false;
      if (activeMatch && !settledRef.current && !settlingRef.current) {
        void abandonMatch(activeMatch, "Você saiu da partida.").catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (result?.status === "won") {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#34d399", "#fbbf24", "#ffffff"] });
    }
  }, [result]);

  // Turno da IA
  useEffect(() => {
    if (!board || result || turn !== "ai" || !match || isHumanOpponent(opponent)) return;
    setAiThinking(true);
    const t = setTimeout(() => {
      const move = Checkers.bestMove(board, Checkers.BLACK, 4);
      if (!move) { setAiThinking(false); finish("player"); return; }
      const nb = Checkers.applyMove(board, move);
      setBoard(nb);
      setLastMove(move);
      setAiThinking(false);
      const winner = Checkers.checkWinner(nb, Checkers.WHITE);
      if (winner === Checkers.BLACK) { finish("ai"); return; }
      setTurn("player");
    }, 480);
    return () => clearTimeout(t);
  }, [turn, board, result, match, finish, opponent]);

  const startMatch = async (nextOpponent = opponent) => {
    setError("");
    const min = config?.min_bet ?? 10;
    const max = config?.max_bet ?? 1000;
    if (bet < min) return setError(`Aposta mínima: ${min}`);
    if (bet > max) return setError(`Aposta máxima: ${max}`);
    if (balance < bet) return setError("Saldo insuficiente");
    if (opponentMode === "online" && !isHumanOpponent(nextOpponent)) {
      setSearching(true);
      return;
    }
    try {
      setOpponent(nextOpponent);
      const m = await placeBet(bet, "dama");
      if (!mountedRef.current) {
        void abandonMatch(m, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      matchRef.current = m;
      settledRef.current = false;
      settlingRef.current = false;
      setMatch(m);
      setBoard(Checkers.initialBoard());
      setTurn("player");
      setSelected(null);
      setLastMove(null);
      setResult(null);
      const b = await getBalance();
      setBalance(b);
      refreshBalance?.();
    } catch (e) { setError(e.message || "Erro ao iniciar"); }
  };

  const onCellClick = (r, c) => {
    if (!canControlTurn(turn, opponent) || result || aiThinking || !board) return;
    const myColor = turn === "player" ? Checkers.WHITE : Checkers.BLACK;
    const piece = board[r][c];
    if (selected) {
      const moves = legalMap.byFrom[`${selected[0]}-${selected[1]}`] || [];
      const target = moves.find((m) => {
        const dest = m.path ? m.path[m.path.length - 1].to : m.to;
        return dest[0] === r && dest[1] === c;
      });
      if (target) {
        const nb = Checkers.applyMove(board, target);
        setBoard(nb);
        setLastMove(target);
        setSelected(null);
        const nextTurn = turn === "player" ? "ai" : "player";
        const winner = Checkers.checkWinner(nb, nextTurn === "player" ? Checkers.WHITE : Checkers.BLACK);
        if (winner === myColor) { finish(turn === "player" ? "player" : "ai"); return; }
        setTurn(nextTurn);
        return;
      }
      if (Checkers.owner(piece) === myColor && legalMap.byFrom[`${r}-${c}`]) {
        setSelected([r, c]);
      } else {
        setSelected(null);
      }
      return;
    }
    if (Checkers.owner(piece) === myColor && legalMap.byFrom[`${r}-${c}`]) {
      setSelected([r, c]);
    }
  };

  const surrender = () => {
    if (!match || result) return;
    finish("ai");
  };

  const reset = () => {
    const activeMatch = matchRef.current;
    if (activeMatch && !settledRef.current && !settlingRef.current) {
      void abandonMatch(activeMatch, "Você reiniciou a partida.").catch(() => {});
    }
    matchRef.current = null;
    setMatch(null);
    setBoard(null);
    setResult(null);
    setSelected(null);
    setLastMove(null);
    setTurn("player");
    setError("");
    setSearching(false);
    setOpponent(opponentMode === "bot" ? BOT_OPPONENT : BOT_OPPONENT);
    load();
  };

  if (!authReady || loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;
  }
  if (!user) return <LoginGate user={user} title="Entre para jogar Dama" />;

  const counts = board ? Checkers.countPieces(board) : { w: 12, b: 12 };

  // Tela de aposta
  if (!match) {
    return (
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar ao lobby
        </Link>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1f17] to-[#0a0f0d] p-5 sm:p-8 card-glow">
          <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 bg-gradient-to-br from-emerald-500/30 to-emerald-800/10 ring-1 ring-white/15 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-1 rounded-xl bg-black/25" />
            <span className="relative">♟️</span>
          </div>
          <h1 className="font-display text-2xl font-bold">Dama</h1>
          <p className="text-white/55 text-sm mt-1">Capture todas as peças ou bloqueie o adversário. Escolha o Bot ArenaBet ou um jogador.</p>

          <div className="mt-6">
            <OpponentSelect
              value={opponentMode}
              onChange={(mode) => {
                setOpponentMode(mode);
                setOpponent(BOT_OPPONENT);
              }}
            />
          </div>

          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-4 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-white/50">Seu saldo</span><span className="font-medium">{balance?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Comissão da casa</span><span className="text-emerald-300">{config?.rake_percent}%</span></div>
            <div className="flex justify-between"><span className="text-white/50">Prêmio ao vencer</span><span className="text-amber-300">{(2 * bet * (1 - (config?.rake_percent || 0) / 100)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
          </div>

          <label className="block mt-6 mb-2 text-sm text-white/60">Valor da aposta</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={bet}
              min={config?.min_bet}
              max={config?.max_bet}
              onChange={(e) => setBet(Number(e.target.value))}
              className="flex-1 h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-emerald-500/50"
            />
            <button onClick={() => setBet(config?.min_bet || 10)} className="h-12 px-3 rounded-xl bg-white/5 border border-white/10 text-xs hover:bg-white/10">Mín</button>
            <button onClick={() => setBet(Math.min(balance || 0, config?.max_bet || 1000))} className="h-12 px-3 rounded-xl bg-white/5 border border-white/10 text-xs hover:bg-white/10">Máx</button>
          </div>
          <div className="flex gap-2 mt-2">
            {[50, 100, 250, 500].map((v) => (
              <button key={v} onClick={() => setBet(v)} className={`flex-1 py-2 rounded-lg border text-sm transition ${bet === v ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-sm" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>{v}</button>
            ))}
          </div>

          {error && <div className="mt-4 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">{error}</div>}

          <button
            onClick={() => startMatch(opponentMode === "bot" ? BOT_OPPONENT : opponent)}
            disabled={balance < bet}
            className="mt-6 w-full h-12 rounded-xl bg-[#C9A227] text-[#14110A] font-semibold hover:bg-[#E0C35A] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {opponentMode === "online" ? `Procurar adversário · R$ ${bet}` : `Iniciar partida · R$ ${bet}`}
          </button>
        </div>
        {searching && user && (
          <MatchmakingPanel
            game="dama"
            bet={bet}
            user={user}
            onMatched={(matched) => {
              setSearching(false);
              startMatch(matched);
            }}
            onCancel={() => setSearching(false)}
          />
        )}
      </div>
    );
  }

  // Tela de jogo
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Lobby
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span role="status" aria-live="polite" className={`px-3 py-1.5 rounded-full border ${turn === "player" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-white/40 border-white/10"}`}>
              {aiThinking ? "Bot pensando…" : `${sideLabel(turn, opponent)} · ${turn === "player" ? "brancas" : "pretas"}`}
            </span>
          </div>
        </div>

        <div className="wood-frame table-lamp rounded-2xl p-3 sm:p-4">
          <div className="grid grid-cols-8 aspect-square w-full max-w-[560px] mx-auto rounded-xl overflow-hidden border-[6px] border-amber-950 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85),inset_0_0_0_1px_rgba(251,191,36,0.18)]">
            {board && board.map((row, r) =>
              row.map((p, c) => {
                const dark = (r + c) % 2 === 1;
                const isSel = selected && selected[0] === r && selected[1] === c;
                const moves = selected ? (legalMap.byFrom[`${selected[0]}-${selected[1]}`] || []) : [];
                 const isDest = moves.some((m) => {
                   const dest = m.path ? m.path[m.path.length - 1].to : m.to;
                   return dest[0] === r && dest[1] === c;
                 });
                 const lastDestination = lastMove && moveDestination(lastMove);
                 const isLastMove = Boolean(lastMove && (
                   (lastMove.from[0] === r && lastMove.from[1] === c) ||
                   (lastDestination[0] === r && lastDestination[1] === c)
                 ));
                  return (
                   <div
                     key={`${r}-${c}`}
                     onClick={() => onCellClick(r, c)}
                     onKeyDown={(event) => {
                       if (event.key === "Enter" || event.key === " ") {
                         event.preventDefault();
                         onCellClick(r, c);
                       }
                     }}
                     role="button"
                     tabIndex={0}
                     aria-label={`Casa ${String.fromCharCode(97 + c)}${8 - r}${p ? `, ${Checkers.owner(p) === Checkers.WHITE ? "peça branca" : "peça preta"}` : ""}`}
                     className={`relative flex items-center justify-center ${dark ? "board-square-dark cursor-pointer transition-[filter] hover:brightness-125" : "board-square-light cursor-pointer transition-[filter] hover:brightness-110"} ${isSel ? "z-10 ring-4 ring-amber-200 ring-inset brightness-125" : ""} ${isLastMove ? "after:absolute after:inset-0 after:bg-amber-300/20 after:ring-2 after:ring-inset after:ring-amber-200/50" : ""}`}
                   >
                    {c === 0 && (
                      <span className="absolute top-0.5 left-1 text-[9px] font-mono text-white/25 select-none">{8 - r}</span>
                    )}
                    {r === 7 && (
                      <span className="absolute bottom-0.5 right-1 text-[9px] font-mono text-white/25 select-none">{String.fromCharCode(97 + c)}</span>
                    )}
                    {isDest && <div className="absolute z-20 w-1/3 h-1/3 rounded-full border-2 border-amber-100 bg-amber-400/60 shadow-[0_0_18px_rgba(251,191,36,0.8)] animate-pulse" />}
                    <Piece p={p} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Painel lateral */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs text-white/50 uppercase tracking-wider">Aposta</div>
          <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-amber-300">
            <Coins className="w-5 h-5" /> {match.bet_amount}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-white/50">Você (brancas)</div>
              <div className="font-semibold">{counts.w} peças</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-white/50">IA (pretas)</div>
              <div className="font-semibold">{counts.b} peças</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-white/40">
            {legalMap.hasCapture ? "Captura obrigatória disponível." : "Mova uma peça em diagonal."}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3 text-xs">
            <div className="uppercase tracking-[0.16em] text-white/35">Última jogada</div>
            <div className="mt-1 text-white/70">{moveLabel(lastMove)}</div>
          </div>
          <button onClick={surrender} className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm hover:bg-rose-500/20">
            <Flag className="w-4 h-4" /> Desistir
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
          <div className="font-medium text-white/80 mb-2">Como jogar</div>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>Peças movem em diagonal, só para frente.</li>
            <li>Capturas pulam a peça inimiga.</li>
            <li>Captura é obrigatória quando possível.</li>
            <li>Alcance a última linha para virar dama (crown).</li>
          </ul>
        </div>
      </div>

      {/* Modal de resultado */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full rounded-3xl glass card-glow p-6 sm:p-8 text-center shadow-2xl">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              result.status === "won" ? "bg-emerald-500/15 text-emerald-300" :
              result.status === "draw" ? "bg-white/10 text-white/70" :
              "bg-rose-500/15 text-rose-300"
            }`}>
              {result.status === "won" ? <Trophy className="w-8 h-8" /> : result.status === "draw" ? <span className="text-2xl">🤝</span> : <Skull className="w-8 h-8" />}
            </div>
            <h2 className="font-display text-2xl font-bold">
              {result.status === "won" ? "Você venceu!" : result.status === "draw" ? "Empate" : "Você perdeu"}
            </h2>
            <p className="text-white/55 text-sm mt-1">
              {result.status === "won"
                ? `Prêmio: +R$ ${(result.payout - result.bet).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} (comissão R$ ${result.houseCut})`
                : result.status === "draw"
                ? "Aposta devolvida"
                : `Você perdeu R$ ${result.bet}`}
            </p>
            <button onClick={reset} className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-semibold inline-flex items-center justify-center gap-2 hover:from-emerald-400 hover:to-emerald-500">
              <RotateCcw className="w-4 h-4" /> Jogar novamente
            </button>
            <Link to="/" className="mt-3 block text-sm text-white/50 hover:text-white">Voltar ao lobby</Link>
          </div>
        </div>
      )}
    </div>
  );
}
