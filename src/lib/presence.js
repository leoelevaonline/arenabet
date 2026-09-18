const PRESENCE_KEY = "arenabet.presence.v1";

const readPresence = () => {
  try {
    return JSON.parse(localStorage.getItem(PRESENCE_KEY) || "[]");
  } catch {
    return [];
  }
};

const writePresence = (entries) => {
  localStorage.setItem(PRESENCE_KEY, JSON.stringify(entries));
};

export function heartbeatPresence(user, pathname = "/") {
  if (!user?.id) return;
  const game = {
    "/dama": { key: "dama", name: "Dama", icon: "♟️" },
    "/sinuca": { key: "sinuca", name: "Sinuca", icon: "🎱" },
    "/bocha": { key: "bocha", name: "Bocha", icon: "🟠" },
    "/futebol": { key: "futebol", name: "Futebol de mesa", icon: "⚽" },
  }[pathname] || { key: "lobby", name: "No salão", icon: "🎲" };
  const initials = String(user.full_name || "AB")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const entries = readPresence().filter((item) => item.id !== user.id && Date.now() - item.updatedAt < 45000);
  entries.push({
    id: user.id,
    name: user.full_name,
    initials: initials || "AB",
    color: "from-amber-500 to-yellow-700",
    level: 1,
    wins: 0,
    status: game.key === "lobby" ? "lobby" : "playing",
    game,
    onlineMinutes: 1,
    real: true,
    updatedAt: Date.now(),
  });
  writePresence(entries);
}

export function listPresentPlayers() {
  return readPresence().filter((item) => Date.now() - item.updatedAt < 45000);
}

export function clearPresence(userId) {
  writePresence(readPresence().filter((item) => item.id !== userId));
}
