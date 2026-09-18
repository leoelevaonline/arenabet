import React, { useState, useEffect, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Loader2, ArrowLeft, Sparkles, Gem, Crown, Coins } from "lucide-react";
import confetti from "canvas-confetti";
import { abandonMatch, getHouseConfig, getBalance, placeBet, settleMatch } from "@/lib/wallet";

export default function CoinFlip() {
  const { refreshBalance } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [choice, setChoice] = useState("heads");
  const [flipping, setFlipping] = useState(false);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const activeMatch = matchRef.current;
      if (activeMatch && !settledRef.current && !settlingRef.current) {
        void abandonMatch(activeMatch, "Você saiu da partida.").catch(() => {});
      }
    };
  }, []);

  const winChance = config ? (50 * (1 - (config.house_edge_percent || 0) / 100)) : 50;

  const play = async () => {
    setError("");
    setResult(null);
    const min = config?.min_bet ?? 10;
    const max = config?.max_bet ?? 1000;
    if (bet < min) return setError(`Aposta mínima: ${min}`);
    if (bet > max) return setError(`Aposta máxima: ${max}`);
    if (balance < bet) return setError("Saldo insuficiente");
    setFlipping(true);
    try {
      const m = await placeBet(bet, "coinflip");
      if (!mountedRef.current) {
        void abandonMatch(m, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      matchRef.current = m;
      settledRef.current = false;
      settlingRef.current = false;
      const b = await getBalance();
      setBalance(b);
      refreshBalance?.();
      const roll = Math.random() * 100;
      const win = roll < winChance;
      const face = win ? choice : choice === "heads" ? "tails" : "heads";
      await new Promise((r) => setTimeout(r, 1300));
      if (!mountedRef.current) return;
      let payout = 0, status = "lost";
      if (win) { payout = 2 * bet; status = "won"; }
      settlingRef.current = true;
      const newBal = await settleMatch(m, status, payout, 0);
      settledRef.current = true;
      settlingRef.current = false;
      setBalance(newBal);
      refreshBalance?.();
      setResult({ face, win, payout, bet });
    } catch (e) {
      settlingRef.current = false;
      if (mountedRef.current) setError(e.message);
    }
    finally { setFlipping(false); }
  };

  useEffect(() => {
    if (result?.win) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.55 }, colors: ["#fbbf24", "#fde68a", "#ffffff"] });
    }
  }, [result]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;
  }

  const faceLabel = (f) => (f === "heads" ? "Cara" : "Coroa");

  return (
    <div className="max-w-md mx-auto">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar ao lobby
      </Link>

      <div className="rounded-3xl border border-amber-500/15 bg-gradient-to-br from-[#1a1408] via-[#0f0d08] to-[#0a0f0d] p-5 sm:p-8 card-glow">
        <h1 className="font-display text-2xl font-bold text-center">Cara ou Coroa</h1>
        <p className="text-white/55 text-sm mt-1 text-center">Aposta instantânea contra a casa. Acerte o lado e dobre sua aposta.</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute left-1/2 top-[88%] -translate-x-1/2 w-24 h-4 rounded-full bg-black/60 blur-md" />
            <div className={`coin-flip relative w-40 h-40 rounded-full border-[3px] transition-colors duration-300 ${
              flipping ? "coin-flip-active border-amber-200/70" :
              result ? (result.win ? "border-emerald-300/70" : "border-rose-300/60") :
              "border-amber-300/50"
            }`}>
              <div className="absolute inset-0 rounded-full" style={{ background: "repeating-conic-gradient(from 0deg, #fde68a 0deg 4deg, #92400e 4deg 8deg)" }} />
              <div className="absolute inset-[9%] rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_32%_26%,#fefce8,#fde68a_35%,#d97706_75%,#78350f_100%)] shadow-inner">
                <div className="absolute inset-[9%] rounded-full ring-2 ring-amber-900/30" />
                {flipping ? (
                  <Coins className="relative w-14 h-14 text-amber-900/60" />
                ) : result ? (
                  result.face === "heads" ? <Gem className="relative w-16 h-16 text-amber-900 drop-shadow-sm" /> : <Crown className="relative w-16 h-16 text-amber-900 drop-shadow-sm" />
                ) : choice === "heads" ? (
                  <Gem className="relative w-16 h-16 text-amber-900/70" />
                ) : (
                  <Crown className="relative w-16 h-16 text-amber-900/70" />
                )}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-wider">
            {flipping ? "Girando…" : result ? `Saiu ${faceLabel(result.face)}` : "Pronta para girar"}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setChoice("heads")}
            disabled={flipping}
            className={`inline-flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${
              choice === "heads" ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
            }`}
          ><Gem className="w-4 h-4" /> Cara</button>
          <button
            onClick={() => setChoice("tails")}
            disabled={flipping}
            className={`inline-flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${
              choice === "tails" ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
            }`}
          ><Crown className="w-4 h-4" /> Coroa</button>
        </div>

        <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-white/50">Seu saldo</span><span className="font-medium">{balance?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
          <div className="flex justify-between"><span className="text-white/50">Chance de vitória</span><span className="text-emerald-300">{winChance.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-white/50">Prêmio se acertar</span><span className="font-semibold">+{bet.toLocaleString("pt-BR")}</span></div>
        </div>

        <label className="block mt-5 mb-2 text-sm text-white/60">Valor da aposta</label>
        <input
          type="number"
          value={bet}
          min={config?.min_bet}
          max={config?.max_bet}
          disabled={flipping}
          onChange={(e) => setBet(Number(e.target.value))}
          className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-amber-500/50 disabled:opacity-50"
        />
        <div className="flex gap-2 mt-2">
          {[50, 100, 250, 500].map((v) => (
            <button key={v} disabled={flipping} onClick={() => setBet(v)} className={`flex-1 py-2 rounded-lg border text-sm transition disabled:opacity-50 ${bet === v ? "bg-amber-500/20 border-amber-400/50 text-amber-200 shadow-sm" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>{v}</button>
          ))}
        </div>

        {error && <div className="mt-4 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">{error}</div>}
        {result && !flipping && (
          <div className={`mt-4 p-4 rounded-xl border text-sm text-center font-medium ${result.win ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : "bg-rose-500/10 border-rose-500/25 text-rose-300"}`}>
            {result.win ? `🎉 Saiu ${faceLabel(result.face)}! Você ganhou +${result.bet}.` : `Saiu ${faceLabel(result.face)}. Você perdeu ${result.bet}.`}
          </div>
        )}

        <button
          onClick={play}
          disabled={flipping || balance < bet}
          className="mt-5 w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-black font-semibold inline-flex items-center justify-center gap-2 hover:from-amber-300 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {flipping ? <><Loader2 className="w-4 h-4 animate-spin" /> Girando…</> : <><Sparkles className="w-4 h-4" /> Jogar {bet}</>}
        </button>

      </div>
    </div>
  );
}
