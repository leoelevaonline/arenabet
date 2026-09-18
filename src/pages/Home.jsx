
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { Coins, Lock, TrendingUp, ChevronRight, Zap, Trophy, ArrowRight, Cpu, Users } from "lucide-react";
import { getBalance, getHouseConfig } from "@/lib/wallet";
import { getOnlinePlayers } from "@/lib/players";
import heroImage from "@/assets/arena-hero.svg";

const games = [
  { key: "dama", name: "Dama", to: "/dama", tag: "Habilidade", desc: "Jogue contra a IA ou outras pessoas. Capture todas as peças e leve o pote.", icon: "♟️", accent: "from-emerald-500/25 to-emerald-800/5", ring: "ring-emerald-400/40", available: true },
  { key: "sinuca", name: "Sinuca", to: "/sinuca", tag: "Física", desc: "Mesa de sinuca com física realista, contra a IA ou outros jogadores. Limpe a mesa antes de acabarem as tacadas.", icon: "🎱", accent: "from-rose-500/25 to-rose-800/5", ring: "ring-rose-400/40", available: true },
  { key: "bocha", name: "Bocha", to: "/bocha", tag: "Gaúcha", desc: "Aproxime suas bolas do bolim, leia a cancha e vença a IA na bocha tradicional do Sul.", icon: "🟠", accent: "from-orange-500/25 to-red-800/5", ring: "ring-orange-400/40", available: true },
  { key: "futebol", name: "Futebol de mesa", to: "/futebol", tag: "Flick", desc: "Puxe, solte e faça a bola encontrar a rede em um duelo rápido de futebol de mesa.", icon: "⚽", accent: "from-sky-500/25 to-blue-900/5", ring: "ring-sky-400/40", available: true },
  { key: "truco", name: "Truco", to: "#", tag: "Em breve", desc: "Truco Paulista contra a IA. Peça truco e force o adversário a correr.", icon: "🃏", accent: "from-violet-500/25 to-violet-800/5", ring: "ring-violet-400/40", available: false },
  { key: "coinflip", name: "Cara ou Coroa", to: "#", tag: "Em breve", desc: "Escolha um lado da moeda e tente acertar o resultado da rodada.", icon: "🪙", accent: "from-amber-400/25 to-amber-700/5", ring: "ring-amber-400/40", available: false },
  { key: "xadrez", name: "Xadrez", to: "#", tag: "Em breve", desc: "Duelo de mentes com apostas. O tabuleiro abre em breve.", icon: "♚", accent: "from-slate-400/15 to-slate-700/5", ring: "ring-slate-400/20", available: false },
];

export default function Home() {
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [players, setPlayers] = useState(() => getOnlinePlayers());
  const [playerFilter, setPlayerFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([getBalance(), getHouseConfig()]);
      setBalance(b);
      setConfig(c);
    } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setPlayers(getOnlinePlayers()), 15000);
    return () => clearInterval(t);
  }, []);

  const onlineCount = players.length;
  const playersByGame = useMemo(() => players.reduce((acc, player) => {
    if (player.status === "playing") acc[player.game.key] = (acc[player.game.key] || 0) + 1;
    return acc;
  }, {}), [players]);
  const visiblePlayers = useMemo(() => playerFilter === "all"
    ? players
    : players.filter((player) => player.status === playerFilter || player.game.key === playerFilter), [playerFilter, players]);

  return (
    <div className="space-y-10">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 card-glow min-h-[440px] flex items-end">
        <div className="absolute inset-0">
          <Image src={heroImage} alt="Arena de jogos" fittingType="fill" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/10 to-transparent" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl" />
        </div>
        <div className="relative p-6 sm:p-8 md:p-12 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-emerald-300 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Mesas abertas agora · {onlineCount} jogadores online
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/70 backdrop-blur">
              <Cpu className="w-3.5 h-3.5" /> Modo simulado · IA como adversária
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
            Jogue com estilo,<br className="hidden sm:block" /> <span className="grad-gold">vença com estratégia</span>
          </h1>
          <p className="mt-4 text-white/70 max-w-lg text-base md:text-lg">
            Mesas de habilidade e sorte com créditos virtuais, física realista e oponentes com IA. Jogue contra outras pessoas quando quiser — por enquanto, tudo é simulado.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/dama" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 text-black font-semibold text-sm shadow-lg shadow-emerald-900/40 hover:from-emerald-300 hover:to-emerald-500 transition">
              <Zap className="w-4 h-4" /> Jogar agora
            </Link>
            <a href="#jogos" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-medium hover:bg-white/15 transition backdrop-blur">
              Ver jogos <ArrowRight className="w-4 h-4" />
            </a>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur">
              <Coins className="w-5 h-5 text-emerald-300" />
              <div>
                <div className="text-[11px] text-white/50 leading-none">Seu saldo</div>
                <div className="font-semibold text-sm mt-0.5 tabular-nums">{balance != null ? balance.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " créditos" : "…"}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      {config && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Comissão (rake)", value: `${config.rake_percent}%`, icon: TrendingUp, tone: "text-emerald-300" },
            { label: "Aposta mínima", value: config.min_bet, icon: Coins, tone: "text-white" },
            { label: "Aposta máxima", value: config.max_bet, icon: Coins, tone: "text-white" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl glass p-4">
              <div className="flex items-center gap-2 text-xs text-white/50">
                <s.icon className="w-3.5 h-3.5" /> {s.label}
              </div>
              <div className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </section>
      )}

      {/* GAMES */}
      <section id="jogos" className="scroll-mt-24">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl font-semibold">Escolha sua mesa</h2>
            <p className="text-sm text-white/50 mt-1">Cada jogo tem sua regra. A aposta é a sua.</p>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-white/40">
            <Cpu className="w-3.5 h-3.5" /> Oponentes com IA · pessoas em breve
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((g) => (
            <Link
              key={g.key}
              to={g.available ? g.to : "#"}
              className={`group relative rounded-2xl glass p-6 overflow-hidden transition hover:border-white/20 hover:-translate-y-1 ${g.available ? "" : "pointer-events-none"}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${g.accent} opacity-70 group-hover:opacity-100 transition`} />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br ${g.accent} ring-1 ring-white/15 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform`}>
                    <div className="absolute inset-1 rounded-xl bg-black/25" />
                    <span className="relative drop-shadow">{g.icon}</span>
                  </div>
                  {g.available ? (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-white/10 text-white/80 border border-white/15">{g.tag}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-white/5 text-white/40 border border-white/10">
                      <Lock className="w-3 h-3" /> {g.tag}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{g.name}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">{g.desc}</p>
                 <div className="mt-5 flex items-center justify-between gap-2 text-sm font-medium text-white">
                   <span className={`inline-flex items-center gap-1.5 ring-1 ${g.ring} rounded-lg px-3 py-2 group-hover:bg-white/5 transition`}>
                     {g.available ? "Jogar" : "Indisponível"} <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                   </span>
                   {g.available && <span className="text-xs font-normal text-white/40">{playersByGame[g.key] || 0} na mesa</span>}
                 </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ONLINE PLAYERS */}
      <section id="jogadores" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-semibold">Jogadores online</h2>
            <p className="text-sm text-white/50 mt-1">Quem está no salão agora — desafie alguém na sua mesa.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <Users className="w-3.5 h-3.5" /> {onlineCount} online
            </span>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar jogadores online">
          {[
            ["all", "Todos"],
            ["dama", "Dama"],
            ["sinuca", "Sinuca"],
            ["bocha", "Bocha"],
            ["futebol", "Futebol"],
            ["lobby", "Na espera"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={playerFilter === value}
              onClick={() => setPlayerFilter(value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${playerFilter === value ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.07] hover:text-white/80"}`}
            >
              {label}{value !== "all" && <span className="ml-1 text-white/35">{value === "lobby" ? players.filter((p) => p.status === "lobby").length : playersByGame[value] || 0}</span>}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visiblePlayers.map((p) => (
            <div key={p.id} className="rounded-2xl glass p-4 flex items-center gap-3 hover:border-white/20 transition">
              <div className="relative shrink-0">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/20 shadow-lg`}>
                  {p.initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{p.name}</span>
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-white/60">nv {p.level}</span>
                </div>
                <div className="text-xs text-white/50 mt-0.5 truncate">
                  {p.status === "playing" ? `Jogando ${p.game.name}` : p.game.name}
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className="text-xl leading-none">{p.game.icon}</div>
                <div className="text-[10px] text-white/40 mt-1">{p.onlineMinutes}min</div>
              </div>
            </div>
          ))}
        </div>
        {visiblePlayers.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/45">Nenhum jogador nessa mesa agora.</div>}
        <p className="mt-3 text-xs text-white/40">
          Presença simulada — jogadores de exemplo para demonstrar o salão. Multijogador real chega em breve.
        </p>
      </section>

      {/* CTA / WALLET */}
      <section className="relative overflow-hidden rounded-3xl glass card-glow p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-xs text-amber-300 mb-4">
            <Trophy className="w-3.5 h-3.5" /> Saldo demo recarregável
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold leading-tight">
            Sem saldo? Sem problema. <span className="grad-text">Recarregue e volte à mesa.</span>
          </h2>
          <p className="mt-3 text-white/60 max-w-lg">
            Adicione créditos demo na carteira, acompanhe seu histórico de partidas e veja quanto a casa já reteve em comissão.
          </p>
        </div>
        <div className="relative flex flex-col sm:flex-row gap-3">
          <Link to="/wallet" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-black font-semibold text-sm hover:from-amber-300 hover:to-amber-500 transition">
            <Coins className="w-4 h-4" /> Recarregar saldo
          </Link>
          <Link to="/wallet" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-medium hover:bg-white/15 transition">
            Ver histórico
          </Link>
        </div>
      </section>
    </div>
  );
}
