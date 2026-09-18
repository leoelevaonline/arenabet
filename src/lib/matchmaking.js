const ROOMS_KEY = "arenabet.rooms.v1";
const CHANNEL_NAME = "arenabet-matchmaking";

const now = () => Date.now();
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readRooms = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(ROOMS_KEY) || "[]");
    const fresh = stored.filter((room) => now() - room.updatedAt < 120000);
    if (fresh.length !== stored.length) localStorage.setItem(ROOMS_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
};

const writeRooms = (rooms) => {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  broadcast({ type: "rooms" });
};

let channel;
const getChannel = () => {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
};

const broadcast = (payload) => {
  try { getChannel()?.postMessage(payload); } catch { /* noop */ }
};

export function listOpenRooms(game) {
  return readRooms().filter((room) => room.status === "open" && (!game || room.game === game));
}

export function createRoom({ game, bet, host }) {
  const rooms = readRooms().filter((room) => room.host.id !== host.id);
  const room = {
    id: createId(),
    game,
    bet: Number(bet) || 0,
    status: "open",
    host,
    guest: null,
    createdAt: now(),
    updatedAt: now(),
  };
  rooms.unshift(room);
  writeRooms(rooms);
  return room;
}

export function joinRoom(roomId, guest) {
  const rooms = readRooms();
  const room = rooms.find((item) => item.id === roomId);
  if (!room) throw new Error("Mesa não encontrada");
  if (room.status !== "open") throw new Error("Essa mesa já foi ocupada");
  if (room.host.id === guest.id) throw new Error("Você já é o anfitrião desta mesa");
  room.status = "matched";
  room.guest = guest;
  room.updatedAt = now();
  writeRooms(rooms);
  broadcast({ type: "matched", room });
  return room;
}

export function leaveRoom(roomId, userId) {
  const rooms = readRooms().filter((room) => {
    if (room.id !== roomId) return true;
    if (room.host.id === userId && room.status === "open") return false;
    return true;
  });
  writeRooms(rooms);
}

export function subscribeMatchmaking(onChange) {
  const notify = () => onChange(readRooms());
  const onStorage = (event) => {
    if (event.key === ROOMS_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  const current = getChannel();
  const onMessage = (event) => {
    if (event.data?.type === "rooms" || event.data?.type === "matched") notify();
  };
  current?.addEventListener("message", onMessage);
  notify();
  return () => {
    window.removeEventListener("storage", onStorage);
    current?.removeEventListener("message", onMessage);
  };
}
