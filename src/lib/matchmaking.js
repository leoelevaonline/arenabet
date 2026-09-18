import { supabase } from "@/lib/supabaseClient";

const ROOMS_KEY = "arenabet.rooms.v1";
const CHANNEL_NAME = "arenabet-matchmaking";

const now = () => Date.now();
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readRooms = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(ROOMS_KEY) || "[]");
    const fresh = stored.filter((room) => now() - (room.updatedAt || 0) < 120000);
    if (fresh.length !== stored.length) localStorage.setItem(ROOMS_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
};

const writeRooms = (rooms) => {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    // noop
  }
  broadcast({ type: "rooms" });
};

let channel;
const getChannel = () => {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
};

const broadcast = (payload) => {
  try {
    getChannel()?.postMessage(payload);
  } catch {
    // noop
  }
};

export async function fetchRemoteRooms(game) {
  try {
    let query = supabase.from("arenabet_rooms").select("*").eq("status", "open");
    if (game) query = query.eq("game", game);
    const { data, error } = await query;
    if (!error && data) {
      const parsed = data.map((r) => ({
        id: r.id,
        game: r.game,
        bet: Number(r.bet_amount || 0),
        status: r.status,
        host: { id: r.host_id, name: r.host_name },
        guest: r.guest_id ? { id: r.guest_id, name: r.guest_name } : null,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
      }));
      return parsed;
    }
  } catch {
    // fallback to local
  }
  return listOpenRooms(game);
}

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

  // Sync to Supabase
  try {
    supabase.from("arenabet_rooms").insert({
      id: room.id,
      game,
      bet_amount: room.bet,
      host_id: host.id,
      host_name: host.full_name || host.name || "Jogador",
      status: "open",
    }).then();
  } catch {
    // noop
  }

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

  // Sync to Supabase
  try {
    supabase.from("arenabet_rooms").update({
      guest_id: guest.id,
      guest_name: guest.full_name || guest.name || "Desafiante",
      status: "matched",
      updated_at: new Date().toISOString(),
    }).eq("id", roomId).then();
  } catch {
    // noop
  }

  return room;
}

export function leaveRoom(roomId, userId) {
  const rooms = readRooms().filter((room) => {
    if (room.id !== roomId) return true;
    if (room.host.id === userId && room.status === "open") return false;
    return true;
  });
  writeRooms(rooms);

  try {
    supabase.from("arenabet_rooms").delete().eq("id", roomId).then();
  } catch {
    // noop
  }
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

  // Also poll Supabase every 10s to keep remote rooms fresh
  const timer = setInterval(async () => {
    try {
      const remote = await fetchRemoteRooms();
      if (remote && remote.length) {
        const local = readRooms();
        const mergedMap = new Map();
        local.forEach((r) => mergedMap.set(r.id, r));
        remote.forEach((r) => mergedMap.set(r.id, r));
        const merged = Array.from(mergedMap.values());
        localStorage.setItem(ROOMS_KEY, JSON.stringify(merged));
        onChange(merged);
      }
    } catch {
      // noop
    }
  }, 10000);

  return () => {
    clearInterval(timer);
    window.removeEventListener("storage", onStorage);
    current?.removeEventListener("message", onMessage);
  };
}
