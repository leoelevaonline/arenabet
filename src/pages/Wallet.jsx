import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";
import { Link } from "react-router-dom";

import { AlertTriangle, Coins, ArrowDownLeft, ArrowDownRight, ArrowUpRight, History, Loader2, Trophy, TrendingUp } from "lucide-react";
import { abandonMatch, getBalance } from "@/lib/wallet";
import { formatBRL } from "@/lib/money";

export default function Wallet() {
  const [balance, setBalance] = useState(null);
  const [txs, setTxs] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, t, m] = await Promise.all([
        getBalance(),
        db.entities.Transaction.list("-created_date", 50),
        db.entities.Match.list("-created_date"),
      ]);
      setBalance(b);
      setTxs(t || []);
      setMatches(m || []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);


  const gameLabel = (g) => ({ dama: "Dama", bocha: "Bocha", futebol: "Futebol de mesa", coinflip: "Cara ou Coroa", xadrez: "Xadrez", sinuca: "Sinuca", truco: "Truco" }[g] || g);
  const deposits = txs.filter((tx) => tx.type === "deposit").reduce((sum, tx) => sum + Math.max(0, tx.amount || 0), 0);
  const wagered = txs.filter((tx) => tx.type === "bet").reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
  const prizes = txs.filter((tx) => tx.type === "win").reduce((sum, tx) => sum + Math.max(0, tx.amount || 0), 0);
  const settledMatches = matches.filter((match) => match.status !== "playing");
  const wins = settledMatches.filter((match) => match.status === "won").length;
  const winRate = settledMatches.length ? `${Math.round((wins / settledMatches.length) * 100)}%` : "—";
  const activeMatches = matches.filter((match) => match.status === "playing");
  const recentMatches = matches.slice(0, 30);

  const recoverMatch = async (match) => {
    setRecovering(match.id);
    setError("");
    try {
      await abandonMatch(match, "Partida encerrada pela Carteira após interrupção.");
      await load();
    } catch (cause) {
      setError(cause.message || "Não foi possível encerrar a partida.");
    } finally {
      setRecovering(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1f17] to-[#0a0f0d] p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Coins className="w-7 h-7 text-emerald-300" />
          </div>
          <div>
            <div className="text-xs text-white/50 uppercase tracking-wider">Saldo disponível</div>
            <div className="text-3xl font-bold tabular-nums">{formatBRL(balance)}</div>
          </div>
        </div>
        <div className="md:ml-auto flex flex-wrap gap-3">
          <Link to="/cashier?mode=deposit" className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-500 px-5 font-semibold text-black transition hover:bg-emerald-400">
            <ArrowDownLeft className="h-4 w-4" /> Depositar
          </Link>
          <Link to="/cashier?mode=withdrawal" className="inline-flex h-12 items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 font-semibold text-amber-200 transition hover:bg-amber-400/20">
            <ArrowUpRight className="h-4 w-4" /> Sacar
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Depósitos", value: deposits, icon: ArrowDownLeft, tone: "text-emerald-300" },
          { label: "Total apostado", value: wagered, icon: Coins, tone: "text-amber-200" },
          { label: "Prêmios", value: prizes, icon: Trophy, tone: "text-sky-200" },
          { label: "Taxa de vitória", value: winRate, icon: TrendingUp, tone: "text-violet-200" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl glass p-4">
            <div className="flex items-center gap-2 text-xs text-white/45"><stat.icon className="h-3.5 w-3.5" /> {stat.label}</div>
            <div className={`mt-2 text-xl font-semibold tabular-nums ${stat.tone}`}>{typeof stat.value === "number" ? formatBRL(stat.value) : stat.value}</div>
          </div>
        ))}
      </div>

      {activeMatches.length > 0 && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-amber-100">Partida interrompida</h2>
              <p className="mt-1 text-sm leading-relaxed text-amber-100/60">Uma partida ainda está reservada no seu saldo. Se você fechou a aba ou saiu sem terminar, encerre-a aqui para liberar o próximo jogo. A partida será registrada como derrota.</p>
              <div className="mt-4 space-y-2">
                {activeMatches.map((match) => (
                  <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/10 bg-black/15 px-3 py-2.5">
                    <div className="text-sm text-white/80">
                      {gameLabel(match.game)} · aposta {formatBRL(match.bet_amount || 0)}
                    </div>
                    <button
                      type="button"
                      onClick={() => recoverMatch(match)}
                      disabled={recovering === match.id}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-amber-200/20 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-wait disabled:opacity-50"
                    >
                      {recovering === match.id ? "Encerrando..." : "Encerrar partida"}
                    </button>
                  </div>
                ))}
              </div>
              {error && <div className="mt-3 rounded-lg border border-rose-300/15 bg-rose-500/10 p-2.5 text-xs text-rose-200">{error}</div>}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4 font-display font-semibold"><History className="w-4 h-4 text-white/60" /> Histórico de transações</div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {txs.length === 0 && <div className="text-sm text-white/40 py-6 text-center">Nenhuma transação ainda.</div>}
            {txs.map((t) => {
              const positive = (t.amount || 0) >= 0;
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${positive ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                    {positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.description || t.type}</div>
                    <div className="text-xs text-white/40">{new Date(t.created_date).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className={`text-sm font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>
                    {positive ? "+" : ""}{formatBRL(t.amount || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4 font-display font-semibold"><History className="w-4 h-4 text-white/60" /> Partidas recentes</div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {recentMatches.length === 0 && <div className="text-sm text-white/40 py-6 text-center">Nenhuma partida ainda.</div>}
            {recentMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <div className="text-sm">
                  <div className="font-medium">{gameLabel(m.game)}</div>
                  <div className="text-xs text-white/40">{new Date(m.created_date).toLocaleString("pt-BR")}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                     m.status === "won" ? "bg-emerald-500/15 text-emerald-300" :
                     m.status === "lost" ? "bg-rose-500/15 text-rose-300" :
                     m.status === "draw" ? "bg-white/10 text-white/60" :
                     m.status === "abandoned" ? "bg-rose-500/10 text-rose-200" :
                     "bg-amber-500/15 text-amber-300"
                   }`}>
                    {m.status === "won" ? "Vitória" : m.status === "lost" ? "Derrota" : m.status === "draw" ? "Empate" : m.status === "abandoned" ? "Abandonada" : "Em jogo"}
                  </div>
                  <div className="text-xs text-white/50 mt-1">Aposta {formatBRL(m.bet_amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
