import React, { useEffect, useState, useCallback } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Coins, Landmark, LayoutGrid, LogOut, ShieldCheck, UserRound, Volume2, VolumeX, Wallet as WalletIcon } from "lucide-react";
import BrandLogo, { BrandMark } from "@/components/BrandLogo";
import { formatBRL } from "@/lib/money";
import { getCurrentUser, logoutAccount, subscribeAuth } from "@/lib/auth";
import { getOnlinePlayers } from "@/lib/players";
import { clearPresence, heartbeatPresence } from "@/lib/presence";
import { getBalance } from "@/lib/wallet";
import { isMuted, subscribeMuted, toggleMuted, sfx } from "@/lib/sound";

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [balance, setBalance] = useState(null);
  const [onlineCount, setOnlineCount] = useState(() => getOnlinePlayers().length);
  const [muted, setMuted] = useState(() => isMuted());
  const location = useLocation();

  useEffect(() => subscribeMuted(setMuted), []);

  const handleToggleMute = () => {
    const next = toggleMuted();
    if (!next) sfx.click();
  };

  const refreshAuth = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setBalance(await getBalance());
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  useEffect(() => subscribeAuth(refreshAuth), [refreshAuth]);
  useEffect(() => { load(); }, [load, location.pathname, user?.id]);
  useEffect(() => {
    const refresh = () => setOnlineCount(getOnlinePlayers().length);
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    heartbeatPresence(user, location.pathname);
    const timer = setInterval(() => heartbeatPresence(user, location.pathname), 15000);
    return () => clearInterval(timer);
  }, [user, location.pathname]);

  const nav = [
    { to: "/", label: "Lobby", icon: LayoutGrid },
    ...(user ? [
      { to: "/wallet", label: "Carteira", icon: WalletIcon },
      { to: "/cashier", label: "Caixa", icon: Landmark },
    ] : []),
  ];

  const signOut = async () => {
    if (user?.id) clearPresence(user.id);
    await logoutAccount();
    setBalance(null);
  };

  const protectedPaths = ["/wallet", "/cashier"];
  if (authReady && !user && protectedPaths.includes(location.pathname)) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="min-h-screen min-w-[360px] arena-bg noise-overlay text-white">
      <div className="border-b border-[#C9A227]/20 bg-[#0B1220] text-[11px] uppercase tracking-[0.16em] text-[#E8D48B]/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Somente maiores de 18 anos · jogue com responsabilidade</span>
          <span className="hidden sm:inline">{onlineCount} jogadores online · pagamentos via PIX</span>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1220]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center gap-4 px-4">
          <BrandLogo />
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {nav.map((n) => {
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                    active ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {active && <span className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10" />}
                  <n.icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{n.label}</span>
                  {active && <span className="absolute -bottom-[13px] left-3 right-3 h-0.5 rounded-full bg-[#C9A227]" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleToggleMute}
              className="rounded-full border border-white/10 p-2 text-white/55 transition hover:text-white"
              aria-label={muted ? "Ativar sons" : "Desativar sons"}
              aria-pressed={muted}
              title={muted ? "Sons desativados" : "Sons ativados"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {user ? (
              <>
                <Link to="/wallet" className="flex items-center gap-2 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-[#E8D48B] transition hover:bg-[#C9A227]/20">
                  <Coins className="h-4 w-4" />
                  {balance != null ? formatBRL(balance) : "…"}
                </Link>
                <div className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 md:flex">
                  <UserRound className="h-3.5 w-3.5" />
                  {user.full_name.split(" ")[0]}
                </div>
                <button type="button" onClick={signOut} className="rounded-full border border-white/10 p-2 text-white/55 hover:text-white" aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link to="/entrar" className="rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white">Entrar</Link>
                <Link to="/cadastro" className="rounded-lg bg-[#C9A227] px-3.5 py-2 text-sm font-semibold text-[#14110A] hover:bg-[#E0C35A]">Criar conta</Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
          {nav.map((n) => {
            const active = location.pathname === n.to;
            return (
              <Link key={n.to} to={n.to} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${active ? "bg-white/10 text-white" : "text-white/55"}`}>
                <n.icon className="h-3.5 w-3.5" /> {n.label}
              </Link>
            );
          })}
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6">
        <Outlet context={{ balance, refreshBalance: load, user, refreshAuth, authReady }} />
      </main>
      <footer className="relative z-10 border-t border-white/10 bg-[#0B1220]/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-9 w-9" />
              <span className="font-display text-sm font-bold tracking-[0.18em] text-[#E8D48B]">ARENABET</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
              Plataforma de apostas em jogos de habilidade com dinheiro real. Cadastro com verificação de identidade, comissão da casa informada antes de cada partida e extrato completo de todas as movimentações.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
              <span className="rounded-full border border-white/10 px-2.5 py-1">18+</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">PIX</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">Conexão segura</span>
            </div>
          </div>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Plataforma</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-white/65">
              <li><Link to="/" className="hover:text-white">Modalidades</Link></li>
              <li><Link to="/cadastro" className="hover:text-white">Criar conta</Link></li>
              <li><Link to="/entrar" className="hover:text-white">Entrar</Link></li>
              <li><Link to="/wallet" className="hover:text-white">Carteira e extrato</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Confiança</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-white/65">
              <li><a href="#confianca" className="hover:text-white">Segurança e pagamentos</a></li>
              <li><a href="#jogo-responsavel" className="hover:text-white">Jogo responsável</a></li>
              <li><a href="mailto:suporte@arenabet.com.br" className="hover:text-white">Suporte: suporte@arenabet.com.br</a></li>
            </ul>
          </div>
        </div>
        <div id="jogo-responsavel" className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-white/40 md:flex-row md:items-center md:justify-between">
            <p>Apostar envolve risco de perda financeira. Jogue apenas com valores que você pode perder e faça pausas.</p>
            <p>ArenaBet · Proibido para menores de 18 anos</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
