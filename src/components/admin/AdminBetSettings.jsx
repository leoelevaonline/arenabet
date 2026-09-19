import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";
import { getHouseConfig } from "@/lib/wallet";
import { Save, Loader2, Percent, TrendingUp, Coins, Wallet } from "lucide-react";

const fields = [
  { key: "rake_percent", label: "Comissão da casa (rake) %", hint: "Percentual retido do pote nos jogos de habilidade.", icon: Percent },
  { key: "house_edge_percent", label: "Vantagem da casa (house edge) %", hint: "Margem teórica da casa em jogos de sorte.", icon: TrendingUp },
  { key: "min_bet", label: "Aposta mínima (R$)", icon: Coins },
  { key: "max_bet", label: "Aposta máxima (R$)", icon: Coins },
  { key: "house_balance", label: "Saldo da casa (R$)", hint: "Total acumulado pela casa.", icon: Wallet },
];

export default function AdminBetSettings() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

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
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  const save = async () => {
    const min = Number(form.min_bet);
    const max = Number(form.max_bet);
    if (min <= 0 || max <= 0) { setFeedback({ tone: "rose", msg: "As apostas mínima e máxima devem ser maiores que zero." }); return; }
    if (min > max) { setFeedback({ tone: "rose", msg: "A aposta mínima não pode ser maior que a máxima." }); return; }

    setSaving(true);
    setFeedback(null);
    try {
      await db.entities.HouseConfig.update(config.id, {
        rake_percent: Number(form.rake_percent),
        house_edge_percent: Number(form.house_edge_percent),
        min_bet: min,
        max_bet: max,
        house_balance: Number(form.house_balance) || 0,
      });
      setFeedback({ tone: "emerald", msg: "Configuração salva com sucesso." });
      await load();
    } catch (e) {
      setFeedback({ tone: "rose", msg: "Erro ao salvar: " + e.message });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="font-display font-semibold mb-1">Taxas e limites de aposta</h2>
      <p className="text-sm text-white/50 mb-4">Ajuste comissões, limites e o saldo da casa. Vale para todas as modalidades.</p>
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
      {feedback && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${feedback.tone === "emerald" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{feedback.msg}</div>
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
  );
}
