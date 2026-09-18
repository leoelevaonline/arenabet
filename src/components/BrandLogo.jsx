import { Link } from "react-router-dom";
import mark from "@/assets/arenabet-mark.png";

export function BrandMark({ className = "h-9 w-9" }) {
  return (
    <img
      src={mark}
      alt="ArenaBet"
      className={`${className} object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]`}
    />
  );
}

export default function BrandLogo({ to = "/", compact = false }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2.5">
      <BrandMark className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-bold leading-none tracking-[0.18em] text-[#E8D48B]">ARENABET</span>
        {!compact && <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-white/40">Apostas em jogos de habilidade</span>}
      </span>
    </Link>
  );
}
