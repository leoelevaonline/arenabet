import React, { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  QrCode,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { depositCredits, getBalance, withdrawCredits } from "@/lib/wallet";
import { formatBRL } from "@/lib/money";

const methods = {
  deposit: [
    { id: "pix", label: "PIX", icon: QrCode, hint: "Crédito imediato após a confirmação" },
    { id: "card", label: "Cartão de crédito", icon: CreditCard, hint: "Visa, Mastercard e Elo" },
    { id: "bank", label: "Transferência bancária", icon: Building2, hint: "Crédito em até 1 dia útil" },
  ],
  withdrawal: [
    { id: "pix", label: "Chave PIX", icon: QrCode, hint: "Chave vinculada ao seu CPF" },
    { id: "bank", label: "Conta bancária", icon: Landmark, hint: "Conta de mesma titularidade" },
  ],
};

const quickAmounts = [50, 100, 250, 500, 1000];

export default function Cashier() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshBalance } = useOutletContext() || {};
  const mode = searchParams.get("mode") === "withdrawal" ? "withdrawal" : "deposit";
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState("pix");
  const [destination, setDestination] = useState("");
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    getBalance().then(setBalance).catch(() => setBalance(0));
  }, []);

  const changeMode = (nextMode) => {
    setSearchParams({ mode: nextMode });
    setMethod("pix");
    setError("");
    setReceipt(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setReceipt(null);
    try {
      const result = mode === "deposit"
        ? await depositCredits(amount, method)
        : await withdrawCredits(amount, method);
      setBalance(result.balance);
      setReceipt(result.transaction);
      refreshBalance?.();
    } catch (err) {
      setError(err.message || "Não foi possível concluir a operação");
    } finally {
      setLoading(false);
    }
  };

  const isDeposit = mode === "deposit";
  const operationMethods = methods[mode];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/wallet" className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Voltar para a carteira
          </Link>
          <h1 className="font-display text-3xl font-bold">Caixa</h1>
          <p className="mt-1 text-sm text-white/50">Deposite para jogar ou saque seu saldo para uma conta em seu nome.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-3 text-right">
          <div className="text-[11px] uppercase tracking-wider text-emerald-200/60">Saldo disponível</div>
          <div className="text-2xl font-bold text-emerald-200">{formatBRL(balance)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] card-glow">
          <div className="grid grid-cols-2 border-b border-white/10 bg-black/20 p-2">
            <button
              type="button"
              onClick={() => changeMode("deposit")}
              className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isDeposit ? "bg-emerald-500 text-black shadow-lg shadow-emerald-950/40" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <ArrowDownLeft className="h-4 w-4" /> Depositar
            </button>
            <button
              type="button"
              onClick={() => changeMode("withdrawal")}
              className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${!isDeposit ? "bg-amber-400 text-black shadow-lg shadow-amber-950/30" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <ArrowUpRight className="h-4 w-4" /> Sacar
            </button>
          </div>

          <form onSubmit={submit} className="space-y-6 p-5 sm:p-8">
            <div>
              <label htmlFor="amount" className="text-sm font-medium text-white/70">Valor (R$)</label>
              <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-black/25 px-4 focus-within:border-emerald-400/50 focus-within:ring-2 focus-within:ring-emerald-400/10">
                <span className="text-sm font-semibold text-white/35">R$</span>
                <input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-16 w-full bg-transparent px-3 text-3xl font-bold text-white outline-none"
                  required
                />
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {quickAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(value)}
                    className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${Number(amount) === value ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"}`}
                  >
                    R$ {value}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-white/70">Forma de pagamento</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {operationMethods.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMethod(item.id)}
                    className={`rounded-2xl border p-4 text-left transition ${method === item.id ? "border-emerald-400/45 bg-emerald-500/10 ring-1 ring-emerald-400/20" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                  >
                    <item.icon className={`h-5 w-5 ${method === item.id ? "text-emerald-300" : "text-white/45"}`} />
                    <div className="mt-3 text-sm font-semibold">{item.label}</div>
                    <div className="mt-1 text-[11px] text-white/40">{item.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {!isDeposit && (
              <div>
                <label htmlFor="destination" className="text-sm font-medium text-white/70">{method === "pix" ? "Chave PIX (CPF, e-mail ou celular)" : "Banco, agência e conta"}</label>
                <input
                  id="destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder={method === "pix" ? "000.000.000-00" : "Banco · agência · conta"}
                  className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-amber-400/40"
                  required
                />
              </div>
            )}

            {error && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-semibold text-black transition disabled:opacity-50 ${isDeposit ? "bg-gradient-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500" : "bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400"}`}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isDeposit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              {loading ? "Processando..." : isDeposit ? `Depositar ${formatBRL(amount)}` : `Solicitar saque de ${formatBRL(amount)}`}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          {receipt ? (
            <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-white/[0.03] p-6 card-glow">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
                <BadgeCheck className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-xl font-bold">Operação concluída</h2>
              <p className="mt-1 text-sm text-white/50">Guarde o número do comprovante para qualquer contato com o suporte.</p>
              <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex justify-between gap-3"><span className="text-white/40">Operação</span><span>{isDeposit ? "Depósito" : "Saque"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-white/40">Valor</span><span className="font-semibold">{formatBRL(Math.abs(receipt.amount))}</span></div>
                <div className="flex justify-between gap-3"><span className="text-white/40">Método</span><span className="uppercase">{receipt.method}</span></div>
                <div className="flex justify-between gap-3"><span className="text-white/40">Status</span><span className="text-emerald-300">Concluído</span></div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <span className="text-white/40">ID</span>
                  <span className="flex items-center gap-1 font-mono text-xs text-white/60"><Copy className="h-3 w-3" /> {receipt.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <WalletCards className="h-8 w-8 text-white/30" />
              <h2 className="mt-4 font-semibold">Como funciona</h2>
              <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-white/50">
                <li>Depósitos via PIX entram no saldo assim que o pagamento é confirmado.</li>
                <li>Saques só são enviados para chave PIX ou conta bancária no mesmo CPF do cadastro.</li>
                <li>Todas as movimentações ficam registradas no extrato da carteira.</li>
              </ul>
            </div>
          )}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100/70">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <p>Seus dados de pagamento são tratados com criptografia e nunca são compartilhados com outros jogadores.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
