const PLAYER_POOL = [
  { name: "Rafaela", initials: "RA", color: "from-rose-500 to-orange-500" },
  { name: "Cadu", initials: "CD", color: "from-sky-500 to-indigo-600" },
  { name: "Bia Lima", initials: "BL", color: "from-emerald-500 to-teal-600" },
  { name: "Tio Zé", initials: "TZ", color: "from-amber-500 to-yellow-600" },
  { name: "Nina", initials: "NI", color: "from-fuchsia-500 to-purple-600" },
  { name: "Marcio", initials: "MC", color: "from-cyan-500 to-blue-600" },
  { name: "Leo", initials: "LE", color: "from-lime-500 to-green-600" },
  { name: "Duda", initials: "DU", color: "from-pink-500 to-rose-600" },
  { name: "Paulo", initials: "PA", color: "from-violet-500 to-indigo-600" },
  { name: "Carol", initials: "CR", color: "from-orange-500 to-red-600" },
  { name: "Gustavo", initials: "GU", color: "from-teal-500 to-emerald-600" },
  { name: "Mari", initials: "MR", color: "from-blue-500 to-sky-600" },
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
  id: i + 1,
  ...p,
  level: rnd(3, 42),
  wins: rnd(2, 240),
}));

export function getOnlinePlayers() {
  return BASE.map((p) => {
    const inGame = Math.random() > 0.2;
    return {
      ...p,
      status: inGame ? "playing" : "lobby",
      game: inGame ? GAMES_MAP[pick(Object.keys(GAMES_MAP))] : LOBBY,
      onlineMinutes: rnd(1, 380),
    };
  });
}
