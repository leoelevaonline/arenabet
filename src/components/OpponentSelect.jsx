import { Bot, Globe } from "lucide-react";

export default function OpponentSelect({ value, onChange, disabled = false }) {
  const options = [
    { id: "bot", label: "Bot ArenaBet", hint: "IA da casa, disponível agora", icon: Bot },
    { id: "online", label: "Adversário online", hint: "Fila, mesa aberta ou mesmo aparelho", icon: Globe },
  ];

  return (
    <div>
      <div className="mb-2 text-sm text-white/60">Adversário</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Escolher adversário">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border p-3 text-left transition disabled:opacity-50 ${
                active
                  ? "border-[#C9A227]/55 bg-[#C9A227]/10 ring-1 ring-[#C9A227]/25"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <option.icon className={`h-4 w-4 ${active ? "text-[#E8D48B]" : "text-white/45"}`} />
              <div className="mt-2 text-sm font-semibold">{option.label}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/40">{option.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
