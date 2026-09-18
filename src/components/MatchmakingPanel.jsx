import { useEffect, useRef, useState } from "react";
import { Loader2, Monitor, Swords, X } from "lucide-react";
import { createRoom, joinRoom, leaveRoom, listOpenRooms, subscribeMatchmaking } from "@/lib/matchmaking";
import { LOCAL_OPPONENT } from "@/lib/opponent";

export default function MatchmakingPanel({ game, bet, user, onMatched, onCancel }) {
  const [rooms, setRooms] = useState(() => listOpenRooms(game));
  const [mine, setMine] = useState(null);
  const [error, setError] = useState("");
  const matchedRef = useRef(false);

  useEffect(() => {
    const stop = subscribeMatchmaking((all) => {
      const open = all.filter((room) => room.status === "open" && room.game === game);
      setRooms(open);
      const matched = all.find((room) => room.status === "matched" && (room.host.id === user.id || room.guest?.id === user.id));
      if (matched && matched.guest && !matchedRef.current) {
        matchedRef.current = true;
        const opponent = matched.host.id === user.id ? matched.guest : matched.host;
        onMatched({
          id: opponent.id,
          name: opponent.name,
          mode: "online",
        });
      }
    });
    return stop;
  }, [game, onMatched, user.id]);

  useEffect(() => () => {
    if (mine?.id) leaveRoom(mine.id, user.id);
  }, [mine?.id, user.id]);

  const host = {
    id: user.id,
    name: user.full_name,
  };

  const openTable = () => {
    setError("");
    try {
      setMine(createRoom({ game, bet, host }));
    } catch (cause) {
      setError(cause.message || "Não foi possível abrir a mesa");
    }
  };

  const sit = (roomId) => {
    setError("");
    try {
      const room = joinRoom(roomId, host);
      matchedRef.current = true;
      const seated = room.host;
      onMatched({ id: seated.id, name: seated.name, mode: "online" });
    } catch (cause) {
      setError(cause.message || "Não foi possível entrar na mesa");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-[#C9A227]/25 bg-[#10141C] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E8D48B]/70">Fila da casa</div>
            <h2 className="mt-1 font-display text-xl font-bold">Encontrar adversário</h2>
            <p className="mt-1 text-sm text-white/50">Aposta {Number(bet).toLocaleString("pt-BR")} créditos. Outra conta neste navegador pode sentar na sua mesa.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Cancelar busca">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mine ? (
          <div className="mt-5 rounded-2xl border border-[#C9A227]/20 bg-[#C9A227]/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-[#E8D48B]">
              <Loader2 className="h-4 w-4 animate-spin" /> Mesa aberta · aguardando jogador
            </div>
            <p className="mt-2 text-white/55">Peça para outra pessoa entrar com a conta dela e escolher a mesma modalidade.</p>
          </div>
        ) : (
          <button type="button" onClick={openTable} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] font-semibold text-[#14110A]">
            <Swords className="h-4 w-4" /> Abrir mesa e esperar
          </button>
        )}

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/35">Mesas abertas</div>
          <div className="mt-2 space-y-2">
            {rooms.filter((room) => room.host.id !== user.id).length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-sm text-white/40">Nenhuma mesa à espera agora.</div>
            )}
            {rooms.filter((room) => room.host.id !== user.id).map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => sit(room.id)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left text-sm hover:border-[#C9A227]/40"
              >
                <span>
                  <span className="block font-semibold">{room.host.name}</span>
                  <span className="text-xs text-white/40">Aposta {Number(room.bet).toLocaleString("pt-BR")}</span>
                </span>
                <span className="text-xs font-semibold text-[#E8D48B]">Sentar</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onMatched(LOCAL_OPPONENT)}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold hover:bg-white/10"
        >
          <Monitor className="h-4 w-4" /> Dois jogadores neste aparelho
        </button>
        {error && <div className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      </div>
    </div>
  );
}
