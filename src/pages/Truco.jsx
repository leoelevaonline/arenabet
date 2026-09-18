import React, { useReducer, useEffect, useRef, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowLeft, RotateCcw, Loader2, Trophy, Skull, Swords, Check, X, Flag } from "lucide-react";
import confetti from "canvas-confetti";
import {
  deal, cardRank, compareCards, resolveHand, aiHandStrength,
  SUIT_SYMBOL, SUIT_COLOR,
} from "@/lib/truco";
import { abandonMatch, getHouseConfig, getBalance, placeBet, settleMatch } from "@/lib/wallet";
import { sfx } from "@/lib/sound";
import LoginGate from "@/components/LoginGate";

const initialState = { phase: "bet" };

function reducer(state, action) {
  switch (action.type) {
    case "START": {
      const { match, bet, dealt } = action;
      return {
        phase: "play", match, bet,
        vira: dealt.vira, playerHand: dealt.player, aiHand: dealt.ai,
        tricks: [], current: { lead: "player", playerCard: null, aiCard: null, winner: null },
        turn: "player", pendingTruco: null, calledBy: { player: false, ai: false },
        result: null, log: ["Mão distribuída. Você lidera a primeira vaza."],
      };
    }
    case "PLAYER_PLAY": {
      if (state.turn !== "player" || state.pendingTruco || state.result || !state.playerHand.includes(action.card)) return state;
      const playerHand = state.playerHand.filter((c) => c !== action.card);
      const current = { ...state.current, playerCard: action.card };
      if (current.aiCard) return resolveTrick({ ...state, playerHand, current });
      return { ...state, playerHand, current, turn: "ai" };
    }
    case "AI_PLAY": {
      if (state.turn !== "ai" || state.pendingTruco || state.result || !state.aiHand.includes(action.card)) return state;
      const aiHand = state.aiHand.filter((c) => c !== action.card);
      const current = { ...state.current, aiCard: action.card };
      if (current.playerCard) return resolveTrick({ ...state, aiHand, current });
      return { ...state, aiHand, current, turn: "player" };
    }
    case "CALL_TRUCO": {
      if (state.calledBy[action.by] || state.pendingTruco || state.result) return state;
      return {
        ...state, pendingTruco: { by: action.by },
        calledBy: { ...state.calledBy, [action.by]: true },
        log: [...state.log, action.by === "player" ? "Você pediu Truco!" : "A IA pediu Truco!"],
      };
    }
    case "RESPOND_TRUCO": {
      const by = state.pendingTruco?.by;
      if (!by) return state;
      if (action.response === "run") {
        const winner = by === "player" ? "player" : "ai";
        return { ...state, result: { winner, by: "fold" }, pendingTruco: null, log: [...state.log, action.responder === "player" ? "Você correu." : "A IA correu."] };
      }
      return { ...state, pendingTruco: null, log: [...state.log, action.responder === "player" ? "Você aceitou o truco." : "A IA aceitou o truco."] };
    }
    case "RESET": return initialState;
    default: return state;
  }
}

function resolveTrick(state) {
  const { playerCard, aiCard } = state.current;
  const cmp = compareCards(playerCard, aiCard, state.vira);
  const winner = cmp > 0 ? "player" : cmp < 0 ? "ai" : "tie";
  const current = { ...state.current, winner };
  const tricks = [...state.tricks, current];
  const nextLead = winner === "tie" ? state.current.lead : winner;
  const result = resolveHand(tricks);
  const log = [...state.log, winner === "player" ? "Você ganhou a vaza." : winner === "ai" ? "A IA ganhou a vaza." : "Vaza empatada."];
  return {
    ...state, tricks,
    current: { lead: nextLead, playerCard: null, aiCard: null, winner: null },
    turn: result ? null : nextLead,
    result, log,
  };
}

function aiChooseCard(state) {
  const hand = state.aiHand;
  if (state.current.lead === "player" && state.current.playerCard) {
    const beaters = hand.filter((c) => compareCards(c, state.current.playerCard, state.vira) > 0)
      .sort((a, b) => cardRank(a, state.vira) - cardRank(b, state.vira));
    if (beaters.length) return beaters[0];
    return hand.slice().sort((a, b) => cardRank(a, state.vira) - cardRank(b, state.vira))[0];
  }
  return hand.slice().sort((a, b) => cardRank(a, state.vira) - cardRank(b, state.vira))[0];
}

function aiWantsTruco(state) {
  const { max, manilhas } = aiHandStrength(state.aiHand, state.vira);
  if (manilhas >= 1 || max >= 9) return Math.random() < 0.5;
  return false;
}

function aiRespondTruco(state) {
  const { max, manilhas } = aiHandStrength(state.aiHand, state.vira);
  if (manilhas >= 1) return "accept";
  if (max >= 8) return Math.random() < 0.6 ? "accept" : "run";
  return "run";
}

function CardFace({ card, dim, highlight }) {
  return (
    <div className={`playing-card relative w-16 h-24 sm:w-[4.5rem] sm:h-[6.5rem] rounded-lg border flex flex-col items-center justify-center transition-shadow ${
      highlight ? "border-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.5),0_10px_24px_-10px_rgba(0,0,0,0.75)]" : "border-slate-300/80 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.75)]"
    } ${dim ? "opacity-40" : ""}`}>
      <div className="pointer-events-none absolute inset-1 rounded-md border border-white/70" />
      <span className={`text-xl font-bold leading-none ${SUIT_COLOR[card.suit]}`}>{card.value}</span>
      <span className={`text-3xl leading-none mt-1 ${SUIT_COLOR[card.suit]}`}>{SUIT_SYMBOL[card.suit]}</span>
      <span className={`absolute top-1.5 left-1.5 text-[11px] font-bold leading-none text-center ${SUIT_COLOR[card.suit]}`}>
        {card.value}<br />{SUIT_SYMBOL[card.suit]}
      </span>
      <span className={`absolute bottom-1.5 right-1.5 text-[11px] font-bold leading-none text-center rotate-180 ${SUIT_COLOR[card.suit]}`}>
        {card.value}<br />{SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}

function CardBack() {
  return (
    <div className="card-back-pattern w-16 h-24 sm:w-[4.5rem] sm:h-[6.5rem] rounded-lg shadow-[0_10px_24px_-10px_rgba(0,0,0,0.8)] border border-indigo-300/35 flex items-center justify-center">
      <div className="w-10 h-[4.5rem] sm:h-[5.2rem] rounded border border-indigo-200/30 flex items-center justify-center bg-indigo-950/30">
        <span className="text-indigo-300 text-xl drop-shadow">♠</span>
      </div>
    </div>
  );
}

export default function Truco() {
  const { user, refreshBalance } = useOutletContext() || {};
  const [state, dispatch] = useReducer(reducer, initialState);
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uiResult, setUiResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const configRef = useRef(null);
  const betRef = useRef(50);
  const matchRef = useRef(null);
  const mountedRef = useRef(true);
  const settledRef = useRef(false);
  const settlingRef = useRef(false);

  useEffect(() => {
    if (uiResult?.winner === "player") {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#34d399", "#fbbf24", "#ffffff"] });
    }
  }, [uiResult]);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([getBalance(), getHouseConfig()]);
      setBalance(b); setConfig(c); configRef.current = c;
      if (bet < c.min_bet) setBet(c.min_bet);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [bet]);
  useEffect(() => { load(); }, [load]);

  // AI engine
  useEffect(() => {
    if (state.phase !== "play" || state.result) return;
    if (state.pendingTruco && state.pendingTruco.by === "player") {
      const t = setTimeout(() => {
        const resp = aiRespondTruco(state);
        dispatch({ type: "RESPOND_TRUCO", response: resp, responder: "ai" });
      }, 900);
      return () => clearTimeout(t);
    }
    if (state.turn === "ai" && !state.pendingTruco && state.current.aiCard === null) {
      const t = setTimeout(() => {
        if (state.current.lead === "ai" && !state.calledBy.ai && aiWantsTruco(state)) {
          dispatch({ type: "CALL_TRUCO", by: "ai" });
        } else {
          dispatch({ type: "AI_PLAY", card: aiChooseCard(state) });
        }
      }, 750);
      return () => clearTimeout(t);
    }
  }, [state]);

  // settle
  useEffect(() => {
    if (state.result && !settledRef.current && !settlingRef.current) {
      settlingRef.current = true;
      (async () => {
        const cfg = configRef.current || {};
        const rake = (cfg.rake_percent || 0) / 100;
        const wager = betRef.current;
        let payout = 0, status = "lost", houseCut = 0;
        if (state.result.winner === "player") {
          houseCut = 2 * wager * rake;
          payout = 2 * wager - houseCut;
          status = "won";
        }
        if (status === "won") sfx.win();
        else sfx.lose();
        try {
          const nb = await settleMatch(matchRef.current, status, payout, houseCut);
          settledRef.current = true;
          settlingRef.current = false;
          setBalance(nb); refreshBalance?.();
          setUiResult({ winner: state.result.winner, payout, bet: wager, by: state.result.by });
        } catch (e) {
          settlingRef.current = false;
          setError(e.message);
        }
      })();
    }
  }, [state.result, refreshBalance]);

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

  const startMatch = async () => {
    setError("");
    const min = config?.min_bet ?? 10, max = config?.max_bet ?? 1000;
    if (bet < min) return setError(`Aposta mínima: ${min}`);
    if (bet > max) return setError(`Aposta máxima: ${max}`);
    if (balance < bet) return setError("Saldo insuficiente");
    setBusy(true);
    try {
      const m = await placeBet(bet, "truco");
      if (!mountedRef.current) {
        void abandonMatch(m, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      matchRef.current = m; betRef.current = bet;
      settledRef.current = false; settlingRef.current = false; setUiResult(null);
      dispatch({ type: "START", match: m, bet, dealt: deal() });
      const b = await getBalance(); setBalance(b); refreshBalance?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const reset = () => {
    const activeMatch = matchRef.current;
    if (activeMatch && !settledRef.current && !settlingRef.current) {
      void abandonMatch(activeMatch, "Você reiniciou a partida.").catch(() => {});
    }
    matchRef.current = null;
    dispatch({ type: "RESET" });
    setUiResult(null); setError("");
    (async () => { try { setBalance(await getBalance()); } catch {} })();
  };

  const endMatch = () => {
    const activeMatch = matchRef.current;
    if (!activeMatch || state.result || settledRef.current || settlingRef.current) {
      reset();
      return;
    }
    if (!window.confirm("Encerrar a partida agora conta como derrota e a aposta será perdida. Deseja continuar?")) return;
    settledRef.current = true;
    settlingRef.current = true;
    sfx.end();
    (async () => {
      try {
        await abandonMatch(activeMatch, "Você encerrou a partida.");
        setBalance(await getBalance());
        refreshBalance?.();
      } catch {
        // A carteira registra a derrota mesmo se a leitura de saldo falhar.
      } finally {
        matchRef.current = null;
        dispatch({ type: "RESET" });
        setUiResult(null);
        setError("");
      }
    })();
  };

  const playCard = (card) => {
    if (state.turn !== "player" || state.pendingTruco || state.result) return;
    sfx.card();
    dispatch({ type: "PLAYER_PLAY", card });
  };
  const playerCallTruco = () => {
    if (state.turn !== "player" || state.pendingTruco || state.result || state.calledBy.player) return;
    dispatch({ type: "CALL_TRUCO", by: "player" });
  };
  const respondTruco = (response) => {
    if (!state.pendingTruco || state.pendingTruco.by !== "ai") return;
    dispatch({ type: "RESPOND_TRUCO", response, responder: "player" });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  if (!user) return <LoginGate user={user} title="Entre para jogar Truco" />;

  // Bet screen
  if (state.phase === "bet") {
    return (
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar ao lobby
        </Link>
        <div className="rounded-3xl glass card-glow p-5 sm:p-8">
          <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 bg-gradient-to-br from-violet-500/30 to-violet-800/10 ring-1 ring-white/15 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-1 rounded-xl bg-black/25" />
            <span className="relative">🏏</span>
          </div>
          <h1 className="font-display text-2xl font-bold">Truco</h1>
          <p className="text-white/55 text-sm mt-1">Truco Paulista simplificado. Vença 2 das 3 vazas. A manilha é definida pela vira. Peça truco para pressione a IA a correr.</p>
          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-4 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-white/50">Seu saldo</span><span className="font-medium">{balance?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Comissão da casa</span><span className="text-emerald-300">{config?.rake_percent}%</span></div>
            <div className="flex justify-between"><span className="text-white/50">Prêmio ao vencer</span><span className="text-amber-300">{(2 * bet * (1 - (config?.rake_percent || 0) / 100)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
          </div>
          <label className="block mt-6 mb-2 text-sm text-white/60">Valor da aposta</label>
          <input type="number" value={bet} min={config?.min_bet} max={config?.max_bet}
            onChange={(e) => setBet(Number(e.target.value))}
            className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-emerald-500/50" />
          <div className="flex gap-2 mt-2">
            {[50, 100, 250, 500].map((v) => (
              <button key={v} onClick={() => setBet(v)} className={`flex-1 py-2 rounded-lg border text-sm transition ${bet === v ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-sm" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>{v}</button>
            ))}
          </div>
          {error && <div className="mt-4 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">{error}</div>}
          <button onClick={startMatch} disabled={balance < bet || busy}
            className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 text-black font-semibold hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-40 transition inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
            {busy ? "Distribuindo…" : `Distribuir mão · ${bet}`}
          </button>
        </div>
      </div>
    );
  }

  const pWins = state.tricks.filter((t) => t.winner === "player").length;
  const aWins = state.tricks.filter((t) => t.winner === "ai").length;
  const aiTurn = state.turn === "ai" && !state.pendingTruco;
  const manilhaValueLabel = (() => {
    const order = { 4: 1, 5: 2, 6: 3, 7: 4, Q: 5, J: 6, K: 7, A: 8, 2: 9, 3: 10 };
    const vals = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
    const next = (order[state.vira.value] % 10) + 1;
    return vals[next - 1];
  })();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Lobby
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
            <span className="chip w-3.5 h-3.5 text-amber-400" /> Pote {bet}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">Vazas {pWins} × {aWins}</span>
          {!uiResult && (
            <button onClick={endMatch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition">
              <Flag className="w-3.5 h-3.5" /> Encerrar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="wood-frame rounded-3xl p-2">
      <div className="felt-table rounded-2xl border border-emerald-950/40 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)] p-4 sm:p-6">
        {/* AI hand */}
        <div className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">IA</div>
        <div className="flex items-center justify-center gap-2 min-h-24">
          {state.aiHand.map((_, i) => (
            <div key={i} className={aiTurn ? "animate-pulse" : ""}>
              <CardBack />
            </div>
          ))}
          {state.aiHand.length === 0 && <div className="text-white/30 text-sm">IA sem cartas</div>}
        </div>

        {/* Trick area + vira */}
        <div className="my-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <div className="text-center">
            <div className="text-xs text-white/40 mb-1">Vira · manilha {manilhaValueLabel}</div>
            <CardFace card={state.vira} />
          </div>
          <div className="text-white/30 text-2xl">vs</div>
          <div className="flex gap-3">
            {state.current.aiCard ? <CardFace card={state.current.aiCard} /> : !state.current.playerCard && state.tricks.length ? <CardFace card={state.tricks.at(-1).aiCard} dim /> : <div className="w-16 h-24 rounded-lg border-2 border-dashed border-white/10" />}
            {state.current.playerCard ? <CardFace card={state.current.playerCard} /> : !state.current.aiCard && state.tricks.length ? <CardFace card={state.tricks.at(-1).playerCard} dim /> : <div className="w-16 h-24 rounded-lg border-2 border-dashed border-white/10" />}
          </div>
        </div>

        {/* Player hand */}
        {state.tricks.length > 0 && <p className="mb-3 text-center text-xs text-white/65" role="status">Última vaza: {state.tricks.at(-1).winner === "tie" ? "empate" : state.tricks.at(-1).winner === "player" ? "você ganhou" : "a IA ganhou"}.</p>}
        <div className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">Sua mão</div>
        <div className="flex items-center justify-center gap-3 min-h-24">
          {state.playerHand.map((card, i) => {
            const playable = state.turn === "player" && !state.pendingTruco && !state.result;
            return (
              <button
                key={i}
                aria-label={`Jogar ${card.value} de ${card.suit}`}
                onClick={() => playCard(card)}
                disabled={!playable}
                className={`transition transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-lg ${playable ? "cursor-pointer ring-1 ring-transparent hover:-translate-y-2 hover:scale-105 hover:ring-amber-300/60 hover:shadow-lg hover:shadow-amber-400/20" : "opacity-50 grayscale-[0.2] cursor-default"}`}
              >
                <CardFace card={card} />
              </button>
            );
          })}
          {state.playerHand.length === 0 && <div className="text-white/30 text-sm">Sem cartas</div>}
        </div>

        {/* Status / actions */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="text-sm text-white/60 min-h-5">
            {state.result
              ? (state.result.winner === "player" ? "Você venceu a mão!" : "A IA venceu a mão.")
              : state.pendingTruco
                ? (state.pendingTruco.by === "ai" ? "A IA pediu Truco! Aceita ou corre?" : "Aguardando resposta da IA…")
                : aiTurn ? "IA pensando…" : state.current.lead === "player" ? "Sua vez — jogue uma carta" : "Responda à vaza da IA"}
          </div>

          {/* Player actions */}
          {!state.result && state.pendingTruco && state.pendingTruco.by === "ai" && (
            <div className="flex gap-3">
              <button onClick={() => respondTruco("accept")} className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30">
                <Check className="w-4 h-4" /> Aceitar
              </button>
              <button onClick={() => respondTruco("run")} className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 hover:bg-rose-500/30">
                <X className="w-4 h-4" /> Correr
              </button>
            </div>
          )}
          {!state.result && !state.pendingTruco && state.turn === "player" && !state.calledBy.player && (
            <button onClick={playerCallTruco} className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 hover:bg-amber-500/25">
              <Swords className="w-4 h-4" /> Pedir Truco
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Result modal */}
      {uiResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full rounded-3xl glass card-glow p-8 text-center">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${uiResult.winner === "player" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
              {uiResult.winner === "player" ? <Trophy className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
            </div>
            <h2 className="font-display text-2xl font-bold">{uiResult.winner === "player" ? "Você venceu!" : "Você perdeu"}</h2>
            <p className="text-white/55 text-sm mt-1">
              {uiResult.winner === "player"
                ? `${uiResult.by === "fold" ? "A IA correu! " : ""}Prêmio: +R$ ${(uiResult.payout - uiResult.bet).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`
                : `${uiResult.by === "fold" ? "Você correu. " : ""}Você perdeu R$ ${uiResult.bet}`}
            </p>
            <button onClick={reset} className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 text-black font-semibold inline-flex items-center justify-center gap-2 hover:from-emerald-300 hover:to-emerald-500">
              <RotateCcw className="w-4 h-4" /> Nova mão
            </button>
            <Link to="/" className="mt-3 block text-sm text-white/50 hover:text-white">Voltar ao lobby</Link>
          </div>
        </div>
      )}
    </div>
  );
}
