import db from "@/api/localDatabase";

const STARTING_BALANCE = 1000;
const VALID_SETTLEMENTS = new Set(["won", "lost", "draw", "abandoned"]);

const roundCredits = (value) => Math.round(Number(value) * 100) / 100;

const record = (data, user, createId, now) => ({
  ...data,
  id: createId(),
  created_by: user.id,
  created_date: now(),
  updated_date: now(),
});

const userBalance = (user) => {
  const balance = Number(user.balance);
  return Number.isFinite(balance) ? roundCredits(balance) : STARTING_BALANCE;
};

export async function getBalance() {
  const me = await db.auth.me();
  if (!me) return null;
  if (me.balance == null) {
    await db.auth.updateMe({ balance: STARTING_BALANCE });
    return STARTING_BALANCE;
  }
  return me.balance;
}

export async function setBalance(value) {
  const nextBalance = roundCredits(value);
  return db.atomic(({ user, now }) => {
    user.balance = nextBalance;
    user.updated_date = now();
    return nextBalance;
  });
}

function normalizeTransactionAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Informe um valor maior que zero");
  }
  return Math.round(amount * 100) / 100;
}

export async function depositCredits(value, method = "pix") {
  const amount = normalizeTransactionAmount(value);
  return db.atomic(({ database, user, createId, now }) => {
    const balance_before = userBalance(user);
    const balance_after = roundCredits(balance_before + amount);
    user.balance = balance_after;
    user.updated_date = now();
    const transaction = record({
      type: "deposit",
      amount,
      method,
      status: "completed",
      description: `Depósito simulado via ${method.toUpperCase()}`,
      balance_before,
      balance_after,
    }, user, createId, now);
    database.entities.Transaction.push(transaction);
    return { transaction, balance: balance_after };
  });
}

export async function withdrawCredits(value, method = "pix") {
  const amount = normalizeTransactionAmount(value);
  return db.atomic(({ database, user, createId, now }) => {
    const balance_before = userBalance(user);
    if (amount > balance_before) throw new Error("Saldo insuficiente para o saque");
    const balance_after = roundCredits(balance_before - amount);
    user.balance = balance_after;
    user.updated_date = now();
    const transaction = record({
      type: "withdrawal",
      amount: -amount,
      method,
      status: "completed",
      description: `Saque simulado via ${method.toUpperCase()}`,
      balance_before,
      balance_after,
    }, user, createId, now);
    database.entities.Transaction.push(transaction);
    return { transaction, balance: balance_after };
  });
}

export async function getHouseConfig() {
  const list = await db.entities.HouseConfig.list();
  if (list && list.length) return list[0];
  return await db.entities.HouseConfig.create({
    label: "Principal",
    rake_percent: 10,
    house_edge_percent: 15,
    min_bet: 10,
    max_bet: 1000,
    house_balance: 0,
  });
}

export async function placeBet(amount, game) {
  const wager = normalizeTransactionAmount(amount);
  const config = await getHouseConfig();
  if (wager < Number(config.min_bet)) throw new Error(`Aposta mínima: ${config.min_bet}`);
  if (wager > Number(config.max_bet)) throw new Error(`Aposta máxima: ${config.max_bet}`);

  return db.atomic(({ database, user, createId, now }) => {
    const activeMatch = (database.entities.Match || []).find((item) => item.created_by === user.id && item.status === "playing");
    if (activeMatch) {
      throw new Error(`Você já tem uma partida em andamento em ${activeMatch.game}. Finalize ou abandone-a antes de apostar novamente.`);
    }
    const balance_before = userBalance(user);
    if (balance_before < wager) throw new Error("Saldo insuficiente para essa aposta");
    const balance_after = roundCredits(balance_before - wager);
    const matchId = createId();
    const match = record({
      game,
      bet_amount: wager,
      status: "playing",
      balance_before,
      balance_after,
      payout: 0,
      house_cut: 0,
      match_id: matchId,
    }, user, () => matchId, now);
    const transaction = record({
      type: "bet",
      amount: -wager,
      match_id: matchId,
      status: "completed",
      description: `Aposta em ${game}`,
      balance_before,
      balance_after,
    }, user, createId, now);
    user.balance = balance_after;
    user.updated_date = now();
    database.entities.Match.push(match);
    database.entities.Transaction.push(transaction);
    return match;
  });
}

export async function settleMatch(match, status, payout, houseCut, reason = "") {
  if (!match?.id) throw new Error("Partida inválida");
  if (!VALID_SETTLEMENTS.has(status)) throw new Error("Status de partida inválido");
  const payoutAmount = roundCredits(payout);
  const houseCutAmount = roundCredits(houseCut || 0);
  if (!Number.isFinite(payoutAmount) || payoutAmount < 0) throw new Error("Prêmio inválido");

  return db.atomic(({ database, user, now, createId }) => {
    const matches = database.entities.Match || [];
    const storedMatch = matches.find((item) => item.id === match.id && item.created_by === user.id);
    if (!storedMatch) throw new Error("Partida não encontrada");
    const balance = userBalance(user);

    // A second callback (or a retry after navigation) must not pay twice.
    if (storedMatch.status !== "playing") return balance;

    const transactions = database.entities.Transaction || [];
    const payoutTransaction = transactions.find((item) => item.match_id === storedMatch.id && item.type === "win");
    const balance_after = payoutTransaction ? balance : roundCredits(balance + payoutAmount);
    const settledAt = now();
    storedMatch.status = status;
    storedMatch.payout = payoutAmount;
    storedMatch.house_cut = houseCutAmount;
    storedMatch.settlement_balance_before = balance;
    storedMatch.balance_after = balance_after;
    storedMatch.settled_date = settledAt;
    if (reason) storedMatch.settlement_reason = reason;
    storedMatch.updated_date = settledAt;
    if (!payoutTransaction && payoutAmount > 0) {
      transactions.push(record({
        type: "win",
        amount: payoutAmount,
        match_id: storedMatch.id,
        status: "completed",
        description: status === "won" ? `Vitória em ${storedMatch.game}` : `Empate em ${storedMatch.game}`,
        balance_before: balance,
        balance_after,
      }, user, createId, now));
    }
    user.balance = balance_after;
    user.updated_date = settledAt;

    const cfg = (database.entities.HouseConfig || [])[0];
    if (cfg) {
      cfg.house_balance = roundCredits((cfg.house_balance || 0) + Number(storedMatch.bet_amount || 0) - payoutAmount);
      cfg.updated_date = settledAt;
    }
    return balance_after;
  });
}

export async function abandonMatch(match, reason = "Partida abandonada") {
  if (!match?.id) return getBalance();
  return settleMatch(match, "abandoned", 0, 0, reason);
}
