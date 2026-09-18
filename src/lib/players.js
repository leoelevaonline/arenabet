import { listPresentPlayers } from "@/lib/presence";

const PLAYER_POOL = [
  { name: "Rafaela", initials: "RA", color: "from-amber-500 to-yellow-700" },
  { name: "Cadu", initials: "CD", color: "from-slate-400 to-slate-700" },
  { name: "Bia Lima", initials: "BL", color: "from-emerald-700 to-teal-800" },
  { name: "Tio Zé", initials: "TZ", color: "from-amber-600 to-yellow-800" },
  { name: "Nina", initials: "NI", color: "from-stone-400 to-stone-700" },
  { name: "Marcio", initials: "MC", color: "from-cyan-700 to-slate-800" },
  { name: "Leo", initials: "LE", color: "from-lime-700 to-green-900" },
  { name: "Duda", initials: "DU", color: "from-orange-600 to-amber-800" },
];

const GAMES_MAP = {
  dama: { key: "dama", name: "Dama", icon: "♟️" },
  sinuca: { key: "sinuca", name: "Sinuca", icon: "🎱" },
  bocha: { key: "bocha", name: "Bocha", icon: "🟠" },
  futebol: { key: "futebol", name: "Futebol de mesa", icon: "⚽" },
};

const LOBBY = { key: "lobby", name: "Na mesa de espera", icon: "🎲" };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const BASE = PLAYER_POOL.map((p, i) => ({
  id: `house-${i + 1}`,
  ...p,
  level: rnd(3, 42),
  wins: rnd(2, 240),
}));

export function getOnlinePlayers() {
  const present = listPresentPlayers();
  const simulated = BASE.map((p) => {
    const inGame = Math.random() > 0.35;
    return {
      ...p,
      status: inGame ? "playing" : "lobby",
      game: inGame ? GAMES_MAP[pick(Object.keys(GAMES_MAP))] : LOBBY,
      onlineMinutes: rnd(1, 380),
      real: false,
    };
  });
  return [...present, ...simulated];
}
