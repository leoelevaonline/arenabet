export const BOT_OPPONENT = {
  id: "bot-arenabet",
  name: "Bot ArenaBet",
  mode: "bot",
};

export const LOCAL_OPPONENT = {
  id: "local-p2",
  name: "Jogador 2",
  mode: "local",
};

export const isHumanOpponent = (opponent) => opponent?.mode === "online" || opponent?.mode === "local";

export const canControlTurn = (turn, opponent) => {
  if (turn === "player") return true;
  if (turn === "ai") return isHumanOpponent(opponent);
  return false;
};

export const sideLabel = (turn, opponent) => {
  if (turn === "player") return "Você";
  if (isHumanOpponent(opponent)) return opponent?.name || "Adversário";
  return "Bot ArenaBet";
};
