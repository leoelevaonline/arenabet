import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";
import { getHouseConfig } from "@/lib/wallet";
import {
  Activity, Coins, TrendingUp, Wallet, Trophy, Users, Shield, Percent, Clock, Loader2,
} from "lucide-react";
import { GAMES, fmt, fmtDate } from "./constants";

const txMeta = {
  deposit: { label: "Depósito", cls: "bg-emerald-500/15 text-emerald-300" },
  withdrawal: { label: "Saque", cls: "bg-rose-500/15 text-rose-300" },
  bet: { label: "Aposta", cls: "bg-white/10 text-white/70" },
  win: { label: "Prêmio", cls: "bg-amber-500/15 text-amber-300" },
};

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ matches: 0, wagered: 0, houseProfit: 0, wins: 0, losses: 0, draws: 0 });
  const [houseBalance, setHouseBalance] = useState(0);
  const [perGame, setPerGame] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const load = useCallback(async () => {
    try {
      const [cfg, matches, tx] = await Promise.all([
        getHouseConfig(),
        db.entities.Match.list("-created_date", 500),
        db.entities.Transaction.list("-created_date", 12),
      ]);
      setHouseBalance(Number(cfg?.house_balance || 0));

      const all = matches || [];
      const settled = all.filter((m) => m.status !== "playing");
      const wagered = all.reduce((s, m) => s + (m.bet_amount || 0), 0);
      const houseProfit = settled.reduce((s, m) => s + (m.bet_amount || 0) - (m.payout || 0), 0);
      const wins = settled.filter((m) => m.status === "won").length;
      const losses = settled.filter((m) => m.status === "lost" || m.status === "abandoned").length;
      const draws = settled.filter((m) => m.status === "draw").length;
      setStats({ matches: all.length, wagered, houseProfit, wins, losses, draws });
      setTransactions(tx || []);

      setPerGame(GAMES.map((g) => {
        const gm = all.filter((m) => m.game === g.key);
        const gs = gm.filter((m) => m.status !== "playing");
        return {
          ...g,
          matches: gm.length,
          wagered: gm.reduce((s, m) => s + (m.bet_amount || 0), 0),
          profit: gs.reduce((s, m) => s + (m.bet_amount || 0) - (m.payout || 0), 0),
          wins: gs.filter((m) => m.status === "won").length,
          losses: gs.filter((m) => m.status === "lost" || m.status === "abandoned").length,
        };
      }));
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  const total = stats.wins + stats.losses + stats.draws;
  const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Partidas totais", value: stats.matches, tone: "text-white", icon: Activity },
          { label: "Total apostado", value: fmt(stats.wagered), tone: "text-white", icon: Coins },
          { label: "Lucro da casa", value: fmt(stats.houseProfit), tone: stats.houseProfit >= 0 ? "text-emerald-300" : "text-rose-300", icon: TrendingUp },
          { label: "Saldo da casa", value: fmt(houseBalance), tone: "text-amber-300", icon: Wallet },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </div>
            <div className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-300" /> Vitórias: <span className="font-semibold">{stats.wins}</span>
        </div>
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-300" /> Derrotas: <span className="font-semibold">{stats.losses}</span>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-white/60" /> Empates: <span className="font-semibold">{stats.draws}</span>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-2">
          <Percent className="w-4 h-4 text-amber-300" /> Taxa de vitória: <span className="font-semibold">{winRate}%</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-display font-semibold mb-1">Métricas por jogo</h2>
        <p className="text-sm text-white/50 mb-4">Desempenho e receita por modalidade.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-white/40 border-b border-white/10">
                <th className="py-2 pr-4">Jogo</th>
                <th className="py-2 pr-4">Partidas</th>
                <th className="py-2 pr-4">Apostado</th>
                <th className="py-2 pr-4">Lucro casa</th>
                <th className="py-2 pr-4">Vitórias</th>
                <th className="py-2 pr-4">Derrotas</th>
              </tr>
            </thead>
            <tbody>
              {perGame.map((g) => (
                <tr key={g.key} className="border-b border-white/5">
                  <td className="py-2.5 pr-4 font-medium">
                    <span className="mr-2">{g.icon}</span>
                    <span className={g.accent}>{g.name}</span>
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums">{g.matches}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{fmt(g.wagered)}</td>
                  <td className={`py-2.5 pr-4 tabular-nums ${g.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmt(g.profit)}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-emerald-300">{g.wins}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-rose-300">{g.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-white/50" />
          <h2 className="font-display font-semibold">Transações recentes</h2>
        </div>
        <p className="text-sm text-white/50 mb-4">Últimos movimentos registrados no salão.</p>
        <div className="space-y-2">
          {transactions.length === 0 && <div className="text-sm text-white/40">Nenhuma transação registrada ainda.</div>}
          {transactions.map((t) => {
            const meta = txMeta[t.type] || { label: t.type, cls: "bg-white/10 text-white/70" };
            const negative = t.amount < 0 || t.type === "bet" || t.type === "withdrawal";
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-md ${meta.cls}`}>{meta.label}</span>
                  <div className="min-w-0">
                    <div className="text-sm text-white/80 truncate">{t.description || t.type}</div>
                    <div className="text-xs text-white/40">{fmtDate(t.created_date)}{t.method ? ` · ${String(t.method).toUpperCase()}` : ""}</div>
                  </div>
                </div>
                <span className={`shrink-0 tabular-nums font-semibold ${negative ? "text-rose-300" : "text-emerald-300"}`}>
                  {negative ? "-" : "+"}{fmt(Math.abs(t.amount || 0))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
