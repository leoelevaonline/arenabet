import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { Coins, Lock, TrendingUp, ChevronRight, Zap, Trophy, ArrowRight, Bot, Users, QrCode, ShieldCheck, Scale, HeartHandshake } from "lucide-react";
import { getBalance, getHouseConfig } from "@/lib/wallet";
import { getOnlinePlayers } from "@/lib/players";
import { formatBRL } from "@/lib/money";
import heroImage from "@/assets/arena-hero.svg";

const trustPoints = [
  { icon: QrCode, title: "Depósito e saque via PIX", desc: "Entrada creditada na hora e saque direto para a sua chave PIX, em seu nome." },
  { icon: ShieldCheck, title: "Conta verificada", desc: "CPF, data de nascimento e e-mail validados. Só maiores de 18 anos jogam." },
  { icon: Scale, title: "Regras e comissão públicas", desc: "A comissão da casa é fixa e exibida antes de cada partida. Sem taxas escondidas." },
  { icon: HeartHandshake, title: "Jogo responsável", desc: "Limites de aposta por partida e histórico completo de todas as movimentações." },
];

const games = [
  { key: "dama", name: "Dama", to: "/dama", tag: "Habilidade", desc: "Escolha bot ArenaBet ou adversário online. Capture as peças e leve o pote.", icon: "♟️", accent: "from-amber-500/20 to-yellow-900/5", ring: "ring-[#C9A227]/40", available: true },
  { key: "sinuca", name: "Sinuca", to: "/sinuca", tag: "Mesa", desc: "Pool 8-ball com física realista contra a IA da casa ou outro jogador.", icon: "🎱", accent: "from-emerald-700/25 to-emerald-950/5", ring: "ring-emerald-400/30", available: true },
  { key: "bocha", name: "Bocha", to: "/bocha", tag: "Cancha", desc: "Bocha gaúcha até 7 pontos. Bot ou adversário no mesmo aparelho ou na fila.", icon: "🟠", accent: "from-orange-600/20 to-amber-950/5", ring: "ring-orange-400/30", available: true },
  { key: "futebol", name: "Futebol de mesa", to: "/futebol", tag: "Flick", desc: "Discos, gols e série de chutes. Enfrente o bot ou um jogador.", icon: "⚽", accent: "from-slate-500/20 to-slate-900/5", ring: "ring-slate-300/30", available: true },
  { key: "truco", name: "Truco", to: "#", tag: "Em breve", desc: "Truco Paulista contra a IA. Peça truco e force o adversário a correr.", icon: "🃏", accent: "from-stone-500/15 to-stone-800/5", ring: "ring-stone-400/20", available: false },
  { key: "coinflip", name: "Cara ou Coroa", to: "#", tag: "Em breve", desc: "Escolha um lado da moeda e tente acertar o resultado da rodada.", icon: "🪙", accent: "from-amber-400/20 to-amber-800/5", ring: "ring-amber-400/30", available: false },
  { key: "xadrez", name: "Xadrez", to: "#", tag: "Em breve", desc: "Duelo de mentes com apostas. O tabuleiro abre em breve.", icon: "♚", accent: "from-slate-400/15 to-slate-700/5", ring: "ring-slate-400/20", available: false },
];

export default function Home() {
  const { user } = useOutletContext() || {};
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
      <section className="relative flex min-h-[440px] items-end overflow-hidden rounded-3xl border border-[#C9A227]/20 card-glow">
        <div className="absolute inset-0">
          <Image src={heroImage} alt="Salão ArenaBet" fittingType="fill" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220] via-[#0B1220]/80 to-[#0B1220]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1220]/90 via-[#0B1220]/20 to-transparent" />
        </div>
        <div className="relative max-w-2xl p-6 sm:p-8 md:p-12">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A227]/30 bg-black/30 px-3 py-1 text-xs text-[#E8D48B] backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" /> Plataforma 18+ · dinheiro real
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/70 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> {onlineCount} jogadores online
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance md:text-6xl">
            Sua habilidade vale <span className="grad-gold">dinheiro de verdade.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-pretty text-white/70 md:text-lg">
            Aposte em Dama, Sinuca, Bocha e Futebol de mesa contra outros jogadores ou contra o Bot ArenaBet. Depósito por PIX, saque para a sua conta e comissão da casa informada antes de cada partida.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to={user ? "/dama" : "/cadastro"} className="inline-flex items-center gap-2 rounded-xl bg-[#C9A227] px-5 py-3 text-sm font-semibold text-[#14110A] shadow-lg shadow-black/40 transition hover:bg-[#E0C35A]">
              <Zap className="h-4 w-4" /> {user ? "Ir para as mesas" : "Abrir minha conta"}
            </Link>
            <a href="#jogos" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium backdrop-blur transition hover:bg-white/15">
              Ver modalidades <ArrowRight className="h-4 w-4" />
            </a>
            {user && (
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur">
                <Coins className="h-5 w-5 text-[#E8D48B]" />
                <div>
                  <div className="text-[11px] leading-none text-white/50">Saldo</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums">{balance != null ? formatBRL(balance) : "…"}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="confianca" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="confianca" className="font-display text-2xl font-semibold">Feita para você jogar com segurança</h2>
            <p className="mt-1 text-sm text-white/50">Transparência em cada etapa: do cadastro ao saque.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Dados protegidos
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((point) => (
            <div key={point.title} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/10 text-[#E8D48B]">
                <point.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/50">{point.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {config && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "Comissão da casa por partida", value: `${config.rake_percent}%`, icon: TrendingUp, tone: "text-[#E8D48B]" },
            { label: "Aposta mínima", value: formatBRL(config.min_bet), icon: Coins, tone: "text-white" },
            { label: "Aposta máxima", value: formatBRL(config.max_bet), icon: Coins, tone: "text-white" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl glass p-4">
              <div className="flex items-center gap-2 text-xs text-white/50">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <div className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </section>
      )}

      <section id="jogos" className="scroll-mt-24">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Modalidades disponíveis</h2>
            <p className="mt-1 text-sm text-white/50">Escolha a mesa, defina o valor da aposta e jogue contra o bot ou um adversário online.</p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-white/40 sm:flex">
            <Bot className="h-3.5 w-3.5" /> Bot ArenaBet · fila online
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <Link
              key={g.key}
              to={g.available ? g.to : "#"}
              className={`group relative overflow-hidden rounded-2xl glass p-6 transition hover:-translate-y-1 hover:border-[#C9A227]/30 ${g.available ? "" : "pointer-events-none"}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${g.accent} opacity-70 transition group-hover:opacity-100`} />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)] ring-1 ring-white/15 ${g.accent} transition-transform group-hover:scale-105`}>
                    <div className="absolute inset-1 rounded-xl bg-black/25" />
                    <span className="relative drop-shadow">{g.icon}</span>
                  </div>
                  {g.available ? (
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-white/80">{g.tag}</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">
                      <Lock className="h-3 w-3" /> {g.tag}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{g.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{g.desc}</p>
                <div className="mt-5 flex items-center justify-between gap-2 text-sm font-medium text-white">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ring-1 transition group-hover:bg-white/5 ${g.ring}`}>
                    {g.available ? "Abrir mesa" : "Indisponível"} <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  {g.available && <span className="text-xs font-normal text-white/40">{playersByGame[g.key] || 0} na mesa</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="jogadores" className="scroll-mt-24">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Salão ao vivo</h2>
            <p className="mt-1 text-sm text-white/50">Quem está nas mesas agora. Entre na fila e desafie um adversário real.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs text-[#E8D48B]">
            <Users className="h-3.5 w-3.5" /> {onlineCount} online
          </span>
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
              className={`rounded-full border px-3 py-1.5 text-xs transition ${playerFilter === value ? "border-[#C9A227]/40 bg-[#C9A227]/15 text-[#E8D48B]" : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.07] hover:text-white/80"}`}
            >
              {label}{value !== "all" && <span className="ml-1 text-white/35">{value === "lobby" ? players.filter((p) => p.status === "lobby").length : playersByGame[value] || 0}</span>}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiblePlayers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl glass p-4 transition hover:border-[#C9A227]/25">
              <div className="relative shrink-0">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg ring-2 ring-white/20 ${p.color}`}>
                  {p.initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-black/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  {p.real && <span className="shrink-0 rounded-md border border-[#C9A227]/30 bg-[#C9A227]/10 px-1.5 py-0.5 text-[10px] text-[#E8D48B]">conta</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-white/50">
                  {p.status === "playing" ? `Jogando ${p.game.name}` : p.game.name}
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className="text-xl leading-none">{p.game.icon}</div>
                <div className="mt-1 text-[10px] text-white/40">{p.onlineMinutes}min</div>
              </div>
            </div>
          ))}
        </div>
        {visiblePlayers.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/45">Nenhum jogador nessa mesa agora.</div>}
      </section>

      <section className="relative flex flex-col overflow-hidden rounded-3xl glass card-glow p-8 md:flex-row md:items-center md:p-10 gap-6">
        <div className="relative flex-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs text-[#E8D48B]">
            <Trophy className="h-3.5 w-3.5" /> {user ? "Sua carteira" : "Cadastro em poucos minutos"}
          </div>
          <h2 className="font-display text-2xl font-bold leading-tight text-balance md:text-3xl">
            {user ? <>Deposite, jogue e saque pela <span className="grad-text">carteira</span>.</> : <>Abra sua conta e comece com um <span className="grad-text">depósito via PIX</span>.</>}
          </h2>
          <p className="mt-3 max-w-lg text-pretty text-white/60">
            {user
              ? "Acompanhe cada depósito, aposta, prêmio e saque em um extrato completo. Seu saldo fica disponível para sacar a qualquer momento."
              : "Precisamos de nome, e-mail, CPF, telefone e data de nascimento para validar sua identidade. O cadastro é recusado para menores de 18 anos."}
          </p>
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row">
          {user ? (
            <>
              <Link to="/cashier?mode=deposit" className="inline-flex items-center gap-2 rounded-xl bg-[#C9A227] px-5 py-3 text-sm font-semibold text-[#14110A] hover:bg-[#E0C35A]">
                <Coins className="h-4 w-4" /> Depositar via PIX
              </Link>
              <Link to="/wallet" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium hover:bg-white/15">
                Ver carteira
              </Link>
            </>
          ) : (
            <>
              <Link to="/cadastro" className="inline-flex items-center gap-2 rounded-xl bg-[#C9A227] px-5 py-3 text-sm font-semibold text-[#14110A] hover:bg-[#E0C35A]">
                Criar conta
              </Link>
              <Link to="/entrar" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium hover:bg-white/15">
                Entrar
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
