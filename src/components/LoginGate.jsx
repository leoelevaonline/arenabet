import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export default function LoginGate({ user, children, title = "Entre para jogar" }) {
  if (user) return children;
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-[#C9A227]/25 bg-[#121826] p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A227]/15 text-[#E8D48B]">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-white/55">As mesas são com dinheiro real. Para proteger você e os outros jogadores, exigimos conta verificada e idade mínima de 18 anos.</p>
      <div className="mt-6 flex flex-col gap-2">
        <Link to="/cadastro" className="inline-flex h-12 items-center justify-center rounded-xl bg-[#C9A227] font-semibold text-[#14110A]">Criar conta verificada</Link>
        <Link to="/entrar" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 text-sm font-medium hover:bg-white/5">Já tenho conta</Link>
      </div>
    </div>
  );
}
