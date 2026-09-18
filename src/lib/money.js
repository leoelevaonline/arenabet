const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return brl.format(number);
}
