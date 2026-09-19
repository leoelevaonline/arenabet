import React, { useEffect, useState, useCallback } from "react";
import db from "@/api/localDatabase";
import {
  Users, Search, Loader2, ShieldCheck, ShieldOff, Wallet, Plus, Minus, Check, X,
} from "lucide-react";
import { fmt, fmtDate } from "./constants";

const initialsOf = (name) =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const maskCpf = (cpf) => {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [meId, setMeId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([db.auth.me(), db.admin.listUsers()]);
      setMeId(me?.id || null);
      setUsers(list || []);
    } catch (e) {
      setFeedback({ tone: "rose", msg: e.message || "Falha ao carregar usuários" });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (tone, msg) => {
    setFeedback({ tone, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const toggleRole = async (u) => {
    const next = u.role === "admin" ? "user" : "admin";
    if (next === "user" && u.id === meId) {
      flash("rose", "Você não pode remover o próprio acesso de administrador.");
      return;
    }
    setBusyId(u.id);
    try {
      await db.admin.setRole(u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: next } : x)));
      flash("emerald", `${u.full_name || u.email} agora é ${next === "admin" ? "administrador" : "usuário"}.`);
    } catch (e) {
      flash("rose", e.message || "Falha ao alterar papel");
    } finally { setBusyId(null); }
  };

  const applyAdjust = async (u, sign) => {
    const amount = Number(editValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      flash("rose", "Informe um valor maior que zero.");
      return;
    }
    setBusyId(u.id);
    try {
      const newBalance = await db.admin.adjustBalance(
        u.id,
        sign * amount,
        sign > 0 ? "Crédito da administração" : "Débito da administração",
      );
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, balance: newBalance } : x)));
      setEditId(null);
      setEditValue("");
      flash("emerald", `Saldo de ${u.full_name || u.email} atualizado para ${fmt(newBalance)}.`);
    } catch (e) {
      flash("rose", e.message || "Falha ao ajustar saldo");
    } finally { setBusyId(null); }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.full_name, u.email, u.cpf, u.phone].some((v) => String(v || "").toLowerCase().includes(q)))
    : users;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Users className="w-4 h-4" /> {users.length} conta{users.length === 1 ? "" : "s"} cadastrada{users.length === 1 ? "" : "s"}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CPF"
            className="h-10 w-72 max-w-full pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg text-sm ${feedback.tone === "emerald" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/45">
            Nenhuma conta encontrada.
          </div>
        )}
        {filtered.map((u) => {
          const isAdmin = u.role === "admin";
          const editing = editId === u.id;
          return (
            <div key={u.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/40 to-emerald-800/30 text-sm font-bold ring-2 ring-white/10">
                  {initialsOf(u.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{u.full_name || "Sem nome"}</span>
                    {isAdmin && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        <ShieldCheck className="w-3 h-3" /> Admin
                      </span>
                    )}
                    {u.id === meId && (
                      <span className="shrink-0 rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">você</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-white/50">
                    {u.email} · CPF {maskCpf(u.cpf)} · desde {fmtDate(u.created_date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-xs text-white/40 justify-end">
                    <Wallet className="w-3.5 h-3.5" /> Saldo
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-amber-300">{fmt(u.balance)}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                {editing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Valor (R$)"
                      className="h-9 w-32 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-emerald-500/50"
                    />
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => applyAdjust(u, 1)}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-300 text-sm hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> Creditar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => applyAdjust(u, -1)}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-rose-500/15 text-rose-300 text-sm hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      <Minus className="w-3.5 h-3.5" /> Debitar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditId(null); setEditValue(""); }}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10"
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditId(u.id); setEditValue(""); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/5 text-white/80 text-sm hover:bg-white/10"
                  >
                    <Wallet className="w-3.5 h-3.5" /> Ajustar saldo
                  </button>
                )}

                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => toggleRole(u)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm disabled:opacity-50 ${isAdmin ? "bg-white/5 text-white/70 hover:bg-white/10" : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"}`}
                >
                  {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {isAdmin ? "Remover admin" : "Tornar admin"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
