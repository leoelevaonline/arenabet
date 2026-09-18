import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import {
  adultCutoffDate,
  formatCpf,
  formatPhone,
  isAdult,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  loginAccount,
  registerAccount,
} from "@/lib/auth";
import logo from "@/assets/arenabet-logo.png";

export default function Auth({ mode = "login" }) {
  const { user, authReady } = useOutletContext() || {};
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = mode === "register";
  const redirectTo = location.state?.from || "/";
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    cpf: "",
    phone: "",
    birth_date: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const maxBirth = useMemo(() => adultCutoffDate(), []);

  if (!authReady) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>;
  }
  if (user) return <Navigate to={redirectTo} replace />;

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        if (!isValidEmail(form.email)) throw new Error("E-mail inválido");
        if (!isValidCpf(form.cpf)) throw new Error("CPF inválido");
        if (!isValidPhone(form.phone)) throw new Error("Telefone inválido");
        if (!isAdult(form.birth_date)) throw new Error("Só é permitido cadastro para maiores de 18 anos");
        if (form.password !== form.confirm) throw new Error("As senhas não coincidem");
        await registerAccount({
          full_name: form.full_name,
          email: form.email,
          cpf: form.cpf,
          phone: form.phone,
          birth_date: form.birth_date,
          password: form.password,
        });
      } else {
        await loginAccount(form.email, form.password);
      }
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(cause.message || "Não foi possível concluir");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="hidden lg:block">
        <img src={logo} alt="Logo ArenaBet" className="w-full max-w-md rounded-3xl border border-[#C9A227]/25 object-cover shadow-[0_30px_80px_-30px_rgba(201,162,39,0.45)]" />
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/50">
          Casa de jogos de habilidade com créditos virtuais. Cadastro individual, verificação de idade e mesas contra bot ou adversário.
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-[#121826] p-5 sm:p-8">
        <div className="mb-6 lg:hidden">
          <BrandLogo compact />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E8D48B]/70">Acesso 18+</div>
        <h1 className="mt-2 font-display text-3xl font-bold">{isRegister ? "Abrir conta" : "Entrar"}</h1>
        <p className="mt-2 text-sm text-white/50">
          {isRegister
            ? "Preencha seus dados. O cadastro é bloqueado para menores de 18 anos."
            : "Use o e-mail e a senha da sua conta ArenaBet."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {isRegister && (
            <label className="block text-sm text-white/65">
              Nome completo
              <input
                required
                value={form.full_name}
                onChange={(event) => setField("full_name", event.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
                autoComplete="name"
              />
            </label>
          )}
          <label className="block text-sm text-white/65">
            E-mail
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
              autoComplete="email"
            />
          </label>
          {isRegister && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-white/65">
                  CPF
                  <input
                    required
                    value={form.cpf}
                    onChange={(event) => setField("cpf", formatCpf(event.target.value))}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm text-white/65">
                  Telefone
                  <input
                    required
                    value={form.phone}
                    onChange={(event) => setField("phone", formatPhone(event.target.value))}
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
                    autoComplete="tel"
                  />
                </label>
              </div>
              <label className="block text-sm text-white/65">
                Data de nascimento
                <input
                  required
                  type="date"
                  max={maxBirth}
                  value={form.birth_date}
                  onChange={(event) => setField("birth_date", event.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
                />
              </label>
            </>
          )}
          <label className="block text-sm text-white/65">
            Senha
            <input
              required
              type="password"
              minLength={6}
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </label>
          {isRegister && (
            <label className="block text-sm text-white/65">
              Confirmar senha
              <input
                required
                type="password"
                minLength={6}
                value={form.confirm}
                onChange={(event) => setField("confirm", event.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-[#C9A227]/50"
                autoComplete="new-password"
              />
            </label>
          )}

          {error && <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] font-semibold text-[#14110A] transition hover:bg-[#E0C35A] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? "Validando..." : isRegister ? "Criar conta 18+" : "Entrar na casa"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-white/45">
          {isRegister ? (
            <>Já tem conta? <Link to="/entrar" className="text-[#E8D48B] hover:underline">Entrar</Link></>
          ) : (
            <>Novo por aqui? <Link to="/cadastro" className="text-[#E8D48B] hover:underline">Cadastre-se</Link></>
          )}
        </p>
        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.16em] text-white/30">Proibido para menores de 18 anos · créditos virtuais</p>
      </div>
    </div>
  );
}
