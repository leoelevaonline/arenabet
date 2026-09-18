import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";

import {
  Shield, Save, Loader2, TrendingUp, Coins, Lock,
  Activity, Users, Trophy, Percent, Wallet, Clock,
} from "lucide-react";
import { getHouseConfig } from "@/lib/wallet";

const GAMES = [
  { key: "dama", name: "Dama", icon: "♟️", accent: "text-emerald-300" },
  { key: "sinuca", name: "Sinuca", icon: "🎱", accent: "text-rose-300" },
  { key: "bocha", name: "Bocha", icon: "🟠", accent: "text-orange-300" },
  { key: "futebol", name: "Futebol de mesa", icon: "⚽", accent: "text-sky-300" },
  { key: "truco", name: "Truco", icon: "🃏", accent: "text-violet-300" },
  { key: "coinflip", name: "Cara ou Coroa", icon: "🪙", accent: "text-amber-300" },
  { key: "xadrez", name: "Xadrez", icon: "♚", accent: "text-slate-300" },
];

const fmt = (value, digits = 2) =>
  Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function Admin() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [stats, setStats] = useState({ matches: 0, wagered: 0, houseProfit: 0, wins: 0, losses: 0, draws: 0 });
  const [perGame, setPerGame] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState("emerald");

  const load = useCallback(async () => {
    try {
      const cfg = await getHouseConfig();
      setConfig(cfg);
      setForm({
        rake_percent: cfg.rake_percent,
        house_edge_percent: cfg.house_edge_percent ?? 15,
        min_bet: cfg.min_bet,
        max_bet: cfg.max_bet,
        house_balance: cfg.house_balance,
      });

      const [matches, tx] = await Promise.all([
        db.entities.Match.list("-created_date", 500),
        db.entities.Transaction.list("-created_date", 10),
      ]);
      const settled = (matches || []).filter((m) => m.status !== "playing");
      const wagered = (matches || []).reduce((s, m) => s + (m.bet_amount || 0), 0);
      const houseProfit = settled.reduce((s, m) => s + (m.bet_amount || 0) - (m.payout || 0), 0);
      const wins = settled.filter((m) => m.status === "won").length;
       const losses = settled.filter((m) => m.status === "lost" || m.status === "abandoned").length;
      const draws = settled.filter((m) => m.status === "draw").length;
      setStats({ matches: (matches || []).length, wagered, houseProfit, wins, losses, draws });
      setTransactions(tx || []);

      const byGame = GAMES.map((g) => {
        const gm = (matches || []).filter((m) => m.game === g.key);
        const gs = gm.filter((m) => m.status !== "playing");
        return {
          key: g.key,
          name: g.name,
          icon: g.icon,
          accent: g.accent,
          matches: gm.length,
          wagered: gm.reduce((s, m) => s + (m.bet_amount || 0), 0),
          profit: gs.reduce((s, m) => s + (m.bet_amount || 0) - (m.payout || 0), 0),
          wins: gs.filter((m) => m.status === "won").length,
           losses: gs.filter((m) => m.status === "lost" || m.status === "abandoned").length,
          draws: gs.filter((m) => m.status === "draw").length,
        };
      });
      setPerGame(byGame);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await db.entities.HouseConfig.update(config.id, {
        rake_percent: Number(form.rake_percent),
        house_edge_percent: Number(form.house_edge_percent),
        min_bet: Number(form.min_bet),
        max_bet: Number(form.max_bet),
        house_balance: Number(form.house_balance) || 0,
      });
      setMsgTone("emerald");
      setMsg("Configuração salva com sucesso.");
      await load();
    } catch (e) { setMsgTone("rose"); setMsg("Erro ao salvar: " + e.message); }
    finally { setSaving(false); }
  };

  const fields = [
    { key: "rake_percent", label: "Comissão da casa (rake) %", hint: "Percentual retido do pote nos jogos de habilidade.", icon: Percent },
    { key: "house_edge_percent", label: "Vantagem da casa (house edge) %", hint: "Margem teórica da casa em jogos de sorte.", icon: TrendingUp },
    { key: "min_bet", label: "Aposta mínima", icon: Coins },
    { key: "max_bet", label: "Aposta máxima", icon: Coins },
    { key: "house_balance", label: "Saldo da casa (R$)", hint: "Total acumulado pela casa.", icon: Wallet },
  ];

  const winRate = stats.wins + stats.losses + stats.draws > 0
    ? ((stats.wins / (stats.wins + stats.losses + stats.draws)) * 100).toFixed(1)
    : "0.0";

  const txMeta = {
    deposit: { label: "Depósito", cls: "bg-emerald-500/15 text-emerald-300", sign: "+" },
    withdrawal: { label: "Saque", cls: "bg-rose-500/15 text-rose-300", sign: "-" },
    bet: { label: "Aposta", cls: "bg-white/10 text-white/70", sign: "-" },
    win: { label: "Prêmio", cls: "bg-amber-500/15 text-amber-300", sign: "+" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Painel da Casa</h1>
          <p className="text-white/50 text-sm">Acesso restrito · /admin · métricas, configuração e gestão de jogos.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Partidas totais", value: stats.matches, tone: "text-white", icon: Activity },
          { label: "Total apostado", value: fmt(stats.wagered), tone: "text-white", icon: Coins },
          { label: "Lucro da casa", value: fmt(stats.houseProfit), tone: stats.houseProfit >= 0 ? "text-emerald-300" : "text-rose-300", icon: TrendingUp },
          { label: "Saldo da casa", value: fmt(form.house_balance || 0), tone: "text-amber-300", icon: Wallet },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </div>
            <div className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Player results */}
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

      {/* Metrics per game */}
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

      {/* Config form */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-display font-semibold mb-1">Configuração das apostas</h2>
        <p className="text-sm text-white/50 mb-4">Ajuste comissões, limites e saldo da casa.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="flex items-center gap-2 text-sm text-white/60 mb-1.5">
                <f.icon className="w-3.5 h-3.5" /> {f.label}
              </label>
              <input
                type="number"
                value={form[f.key] ?? 0}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-emerald-500/50"
              />
              {f.hint && <p className="mt-1 text-xs text-white/40">{f.hint}</p>}
            </div>
          ))}
        </div>
        {msg && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${msgTone === "emerald" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{msg}</div>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="mt-5 inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-semibold hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configuração
        </button>
        <p className="mt-3 text-xs text-white/40">
          A comissão (rake) é descontada do pote nas vitórias dos jogos de habilidade.
        </p>
      </div>

      {/* Game management */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display font-semibold">Gestão de jogos</h2>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Todos os 7 jogos liberados
          </span>
        </div>
        <p className="text-sm text-white/50 mb-4">Modalidades disponíveis para apostas e partidas contra bots ou adversários.</p>
        <div className="space-y-2">
          {GAMES.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{g.icon}</span>
                <div>
                  <div className={`font-medium ${g.accent}`}>{g.name}</div>
                  <div className="text-xs text-white/40">Operando com liquidação no Supabase</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  Ativo no Salão
                </span>
                <div className="w-11 h-6 rounded-full bg-emerald-500/30 border border-emerald-500/40 relative">
                  <span className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-white/50" />
          <h2 className="font-display font-semibold">Transações recentes</h2>
        </div>
        <p className="text-sm text-white/50 mb-4">Últimos movimentos registrados no salão.</p>
        <div className="space-y-2">
          {transactions.length === 0 && <div className="text-sm text-white/40">Nenhuma transação registrada ainda.</div>}
          {transactions.map((t) => {
            const meta = txMeta[t.type] || { label: t.type, cls: "bg-white/10 text-white/70", sign: "" };
            const negative = t.amount < 0 || t.type === "bet" || t.type === "withdrawal";
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-md ${meta.cls}`}>{meta.label}</span>
                  <div className="min-w-0">
                    <div className="text-sm text-white/80 truncate">{t.description || t.type}</div>
                    <div className="text-xs text-white/40">{fmtDate(t.created_date)}{t.method ? ` · ${t.method.toUpperCase()}` : ""}</div>
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
