export const GAMES = [
  { key: "dama", name: "Dama", icon: "♟️", accent: "text-emerald-300" },
  { key: "sinuca", name: "Sinuca", icon: "🎱", accent: "text-rose-300" },
  { key: "bocha", name: "Bocha", icon: "🟠", accent: "text-orange-300" },
  { key: "futebol", name: "Futebol de mesa", icon: "⚽", accent: "text-sky-300" },
  { key: "truco", name: "Truco", icon: "🃏", accent: "text-violet-300" },
  { key: "coinflip", name: "Cara ou Coroa", icon: "🪙", accent: "text-amber-300" },
  { key: "xadrez", name: "Xadrez", icon: "♚", accent: "text-slate-300" },
];

export const fmt = (value, digits = 2) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
