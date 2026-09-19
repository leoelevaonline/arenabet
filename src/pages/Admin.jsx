import React, { useState } from "react";
import { Shield, BarChart3, Users, Gamepad2, SlidersHorizontal } from "lucide-react";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminGames from "@/components/admin/AdminGames";
import AdminBetSettings from "@/components/admin/AdminBetSettings";

const TABS = [
  { key: "overview", label: "Visão geral", icon: BarChart3, Component: AdminOverview },
  { key: "users", label: "Usuários", icon: Users, Component: AdminUsers },
  { key: "games", label: "Jogos", icon: Gamepad2, Component: AdminGames },
  { key: "settings", label: "Taxas e limites", icon: SlidersHorizontal, Component: AdminBetSettings },
];

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const Active = TABS.find((t) => t.key === tab)?.Component || AdminOverview;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Painel da Casa</h1>
          <p className="text-white/50 text-sm">Acesso restrito · /admin · gestão completa da plataforma.</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-500/15 text-emerald-300" : "text-white/55 hover:bg-white/5 hover:text-white/80"}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <Active />
    </div>
  );
}
