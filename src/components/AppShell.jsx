import React, { useEffect, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Coins, Landmark, LayoutGrid, Wallet as WalletIcon, Spade, Users } from "lucide-react";
import { getBalance } from "@/lib/wallet";
import { getOnlinePlayers } from "@/lib/players";

export default function AppShell() {
  const [balance, setBalance] = useState(null);
  const [onlineCount, setOnlineCount] = useState(() => getOnlinePlayers().length);
  const location = useLocation();

  const load = useCallback(async () => {
    try { setBalance(await getBalance()); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const refresh = () => setOnlineCount(getOnlinePlayers().length);
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  const nav = [
    { to: "/", label: "Lobby", icon: LayoutGrid },
    { to: "/wallet", label: "Carteira", icon: WalletIcon },
    { to: "/cashier", label: "Caixa", icon: Landmark },
  ];

  return (
    <div className="min-h-screen min-w-[360px] arena-bg noise-overlay text-white">
      <header className="sticky top-0 z-40 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40 ring-1 ring-white/15">
              <Spade className="w-4 h-4 text-black" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070b0a]" />
            </span>
            <span className="grad-text">ArenaBet</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 ml-2">
            {nav.map((n) => {
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                    active ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {active && <span className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10" />}
                  <n.icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{n.label}</span>
                  {active && <span className="absolute -bottom-[9px] left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-200" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/#jogadores" className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/55 transition hover:border-emerald-400/30 hover:text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <Users className="h-3.5 w-3.5" />
              {onlineCount} online
            </Link>
            <Link to="/wallet" className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold tabular-nums hover:bg-emerald-500/20 transition">
              <Coins className="w-4 h-4" />
              {balance != null ? balance.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "…"}
            </Link>
          </div>
        </div>
        {/* mobile nav */}
        <div className="sm:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {nav.map((n) => {
            const active = location.pathname === n.to;
            return (
              <Link key={n.to} to={n.to} className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${active ? "bg-white/10 text-white" : "text-white/55"}`}>
                <n.icon className="w-3.5 h-3.5" /> {n.label}
              </Link>
            );
          })}
        </div>
      </header>
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-6">
        <Outlet context={{ balance, refreshBalance: load }} />
      </main>
    </div>
  );
}
