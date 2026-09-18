// Motor de Truco (simplificado, Paulista) - baralho de 40 cartas, manilha pela vira.
export const SUITS = ["ouros", "espadas", "copas", "paus"];
export const VALUES = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
const VALUE_ORDER = { "4": 1, "5": 2, "6": 3, "7": 4, "Q": 5, "J": 6, "K": 7, "A": 8, "2": 9, "3": 10 };
const SUIT_RANK = { ouros: 1, espadas: 2, copas: 3, paus: 4 };
export const SUIT_SYMBOL = { ouros: "♦", espadas: "♠", copas: "♥", paus: "♣" };
export const SUIT_COLOR = { ouros: "text-red-700", espadas: "text-slate-900", copas: "text-red-700", paus: "text-slate-900" };

export function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ value: v, suit: s });
  return deck;
}

export function shuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardRank(card, vira) {
  const manilhaOrder = (VALUE_ORDER[vira.value] % 10) + 1;
  if (VALUE_ORDER[card.value] === manilhaOrder) return 20 + SUIT_RANK[card.suit];
  return VALUE_ORDER[card.value];
}

export function compareCards(a, b, vira) {
  const ra = cardRank(a, vira), rb = cardRank(b, vira);
  if (ra > rb) return 1;
  if (ra < rb) return -1;
  return 0;
}

export function cardLabel(card) {
  return `${card.value}${SUIT_SYMBOL[card.suit]}`;
}

export function deal() {
  const deck = shuffle(createDeck());
  return {
    vira: deck[0],
    player: deck.slice(1, 4),
    ai: deck.slice(4, 7),
  };
}

export function resolveHand(tricks, openingPlayer = "player") {
  const p = tricks.filter((t) => t.winner === "player").length;
  const a = tricks.filter((t) => t.winner === "ai").length;
  if (p >= 2) return { winner: "player" };
  if (a >= 2) return { winner: "ai" };
  // A tied first trick makes the next decisive trick settle the hand.
  // A tied second trick awards the hand to the first trick's winner.
  if (tricks.length >= 2 && tricks.slice(0, 2).some(t => t.winner === "tie")) {
    const decisive = tricks.find(t => t.winner !== "tie");
    if (decisive) return { winner: decisive.winner };
  }
  if (tricks.length < 3) return null;
  for (const t of tricks) if (t.winner !== "tie") return { winner: t.winner };
  return { winner: openingPlayer };
}

export function aiHandStrength(hand, vira) {
  const ranks = hand.map((c) => cardRank(c, vira));
  const max = Math.max(...ranks);
  const manilhas = ranks.filter((r) => r >= 20).length;
  return { max, manilhas };
}
