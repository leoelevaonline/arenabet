import { Link } from "react-router-dom";
import logo from "@/assets/arenabet-logo.png";

export function BrandMark({ className = "h-9 w-9" }) {
  return (
    <img
      src={logo}
      alt="ArenaBet"
      className={`${className} rounded-md object-cover object-center ring-1 ring-[#C9A227]/40`}
    />
  );
}

export default function BrandLogo({ to = "/", compact = false }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 min-w-0">
      <BrandMark className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-bold tracking-[0.18em] text-[#E8D48B] leading-none">ARENABET</span>
        {!compact && <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-white/40">Casa de jogos</span>}
      </span>
    </Link>
  );
}
