import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";
import { getHouseConfig, parseDisabledGames } from "@/lib/wallet";
import { Loader2, Gamepad2 } from "lucide-react";
import { GAMES } from "./constants";

export default function AdminGames() {
  const [config, setConfig] = useState(null);
  const [disabled, setDisabled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    try {
      const cfg = await getHouseConfig();
      setConfig(cfg);
      setDisabled(parseDisabledGames(cfg));
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (tone, msg) => {
    setFeedback({ tone, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const toggle = async (key) => {
    if (!config) return;
    const next = disabled.includes(key) ? disabled.filter((k) => k !== key) : [...disabled, key];
    setBusyKey(key);
    try {
      await db.entities.HouseConfig.update(config.id, { games_disabled: JSON.stringify(next) });
      setDisabled(next);
      const game = GAMES.find((g) => g.key === key);
      flash("emerald", `${game?.name || key} ${next.includes(key) ? "desativado" : "ativado"} no salão.`);
    } catch (e) {
      flash("rose", e.message || "Falha ao atualizar o jogo");
    } finally { setBusyKey(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  const activeCount = GAMES.length - disabled.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Gamepad2 className="w-4 h-4" /> {activeCount} de {GAMES.length} modalidades ativas
        </div>
        <span className="text-xs text-white/40">Jogos desativados somem do salão e recusam novas apostas.</span>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg text-sm ${feedback.tone === "emerald" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="space-y-2">
        {GAMES.map((g) => {
          const isActive = !disabled.includes(g.key);
          return (
            <div key={g.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{g.icon}</span>
                <div>
                  <div className={`font-medium ${g.accent}`}>{g.name}</div>
                  <div className="text-xs text-white/40">{isActive ? "Ativo no salão · liquidação no Supabase" : "Indisponível para os jogadores"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${isActive ? "text-emerald-400" : "text-white/40"}`}>
                  {isActive ? "Ativo" : "Inativo"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label={`${isActive ? "Desativar" : "Ativar"} ${g.name}`}
                  disabled={busyKey === g.key}
                  onClick={() => toggle(g.key)}
                  className={`relative w-11 h-6 rounded-full border transition disabled:opacity-50 ${isActive ? "bg-emerald-500/30 border-emerald-500/40" : "bg-white/10 border-white/15"}`}
                >
                  <span className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full transition-all ${isActive ? "right-0.5 bg-emerald-400" : "left-0.5 bg-white/50"}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
