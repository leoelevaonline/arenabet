import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  CircleDot,
  Coins,
  Flag,
  Flame,
  Gauge,
  Loader2,
  Map,
  Ruler,
  RotateCcw,
  Skull,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import confetti from "canvas-confetti";
import LoginGate from "@/components/LoginGate";
import MatchmakingPanel from "@/components/MatchmakingPanel";
import OpponentSelect from "@/components/OpponentSelect";
import { BOT_OPPONENT, canControlTurn, isHumanOpponent, sideLabel } from "@/lib/opponent";
import { abandonMatch, getHouseConfig, getBalance, placeBet, settleMatch } from "@/lib/wallet";
import { sfx } from "@/lib/sound";
import { drawSurface } from "@/lib/gameSurfaces";
import { tablePoint, tableTransform } from "@/lib/canvasTable";

const COURT_W = 1100;
const COURT_H = 560;
const FRAME = { left: 20, top: 20, right: 1080, bottom: 540 };
const FIELD = { left: 70, top: 72, right: 1030, bottom: 474 };
const BALL_RADIUS = 17;
const JACK_RADIUS = 11;
const MAX_SPEED = 920;
const PULL_MAX = 160;
const PHYSICS_STEP = 1 / 120;
const FRICTION = Math.pow(0.985, 0.5);
const STOP_SPEED = 5.2;
const WALL_RESTITUTION = 0.7;
const BALL_RESTITUTION = 0.8;
const COLLISION_FRICTION = 0.08;
const MAX_FRAME_STEPS = 180;
const MAX_SIMULATION_STEPS = 720;
const HAND_TARGET = 7;
const DISTANCE_EPSILON = 0.01;
const AI_DIFFICULTY = 0.72;

const TEAM_STYLE = {
  player: {
    name: "Vermelhas",
    shortName: "Você",
    fill: "#c83226",
    dark: "#54120f",
    light: "#ff9f92",
    groove: "#fde68a",
    text: "text-red-200",
    panel: "bg-red-500/10 border-red-400/25",
  },
  ai: {
    name: "Azuis",
    shortName: "IA",
    fill: "#1e64b2",
    dark: "#0b2650",
    light: "#9ecaff",
    groove: "#e0f2fe",
    text: "text-blue-200",
    panel: "bg-blue-500/10 border-blue-400/25",
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function rotate(vector, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return "--";
  const cm = value * 0.82;
  return cm < 100 ? `${cm.toFixed(1).replace(".", ",")} cm` : `${(cm / 100).toFixed(2).replace(".", ",")} m`;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getHeadGeometry(headSide) {
  const left = headSide === "left";
  const lineX = left ? FIELD.left + 88 : FIELD.right - 88;
  const direction = left ? 1 : -1;
  const near = lineX + direction * 230;
  const far = lineX + direction * ((FIELD.right - FIELD.left) - 190);
  return {
    side: headSide,
    label: left ? "esquerda" : "direita",
    lineX,
    direction,
    launchX: lineX + direction * (BALL_RADIUS + 6),
    validMinX: Math.min(near, far),
    validMaxX: Math.max(near, far),
    validMinY: FIELD.top + JACK_RADIUS + 18,
    validMaxY: FIELD.bottom - JACK_RADIUS - 18,
  };
}

function getJackPreview(headSide) {
  const geometry = getHeadGeometry(headSide);
  return {
    x: geometry.validMinX + (geometry.validMaxX - geometry.validMinX) * 0.55,
    y: (geometry.validMinY + geometry.validMaxY) / 2,
  };
}

function createWorld(handNumber, headSide, openingTeam) {
  const preview = getJackPreview(headSide);
  const geometry = getHeadGeometry(headSide);
  return {
    handNumber,
    headSide,
    openingTeam,
    trails: [],
    particles: [],
    jack: {
      id: "jack",
      x: preview.x,
      y: preview.y,
      vx: 0,
      vy: 0,
      r: JACK_RADIUS,
      invMass: 1 / (JACK_RADIUS * JACK_RADIUS * 0.45),
      placed: false,
      kind: "jack",
      rollAngle: 0,
      heading: 0,
    },
    balls: Array.from({ length: 8 }, (_, index) => ({
      id: `ball-${index}`,
      team: index < 4 ? "player" : "ai",
      x: geometry.launchX,
      y: FIELD.top + BALL_RADIUS,
      vx: 0,
      vy: 0,
      r: BALL_RADIUS,
      invMass: 1 / (BALL_RADIUS * BALL_RADIUS),
      played: false,
      active: false,
      number: (index % 4) + 1,
      rollAngle: 0,
      heading: 0,
    })),
    lastShotId: null,
    lastShotMode: null,
  };
}

function cloneWorld(world) {
  return {
    ...world,
    jack: { ...world.jack },
    balls: world.balls.map((ball) => ({ ...ball })),
    trails: [],
    particles: [],
  };
}

function snapshotWorld(world) {
  if (!world) return null;
  return {
    headSide: world.headSide,
    jack: { ...world.jack },
    balls: world.balls.filter((ball) => ball.active).map((ball) => ({ ...ball })),
    lastShotId: world.lastShotId,
  };
}

function getPlayedBalls(world, team) {
  return world.balls.filter((ball) => ball.active && ball.team === team);
}

function getRemainingBalls(world, team) {
  return world.balls.filter((ball) => !ball.played && ball.team === team);
}

function getNearestDistance(world, team) {
  const balls = getPlayedBalls(world, team);
  if (!world?.jack?.placed || !balls.length) return Infinity;
  return Math.min(...balls.map((ball) => distance(ball, world.jack)));
}

function getLiveLeader(nearest) {
  if (!Number.isFinite(nearest.player) && !Number.isFinite(nearest.ai)) return "Ainda sem bola";
  if (!Number.isFinite(nearest.player)) return "IA mais perto";
  if (!Number.isFinite(nearest.ai)) return "Você mais perto";
  if (Math.abs(nearest.player - nearest.ai) <= DISTANCE_EPSILON) return "Empate de distância";
  return nearest.player < nearest.ai ? "Você mais perto" : "IA mais perto";
}

function scoreHand(world) {
  const playerDistances = getPlayedBalls(world, "player")
    .map((ball) => distance(ball, world.jack))
    .sort((a, b) => a - b);
  const aiDistances = getPlayedBalls(world, "ai")
    .map((ball) => distance(ball, world.jack))
    .sort((a, b) => a - b);
  const bestPlayer = playerDistances[0] ?? Infinity;
  const bestAi = aiDistances[0] ?? Infinity;

  if (!Number.isFinite(bestPlayer) || !Number.isFinite(bestAi)) {
    return {
      player: 0,
      ai: 0,
      winner: null,
      playerNearest: bestPlayer,
      aiNearest: bestAi,
      playerDistances,
      aiDistances,
    };
  }

  if (Math.abs(bestPlayer - bestAi) <= DISTANCE_EPSILON) {
    return {
      player: 0,
      ai: 0,
      winner: null,
      playerNearest: bestPlayer,
      aiNearest: bestAi,
      playerDistances,
      aiDistances,
    };
  }

  const winner = bestPlayer < bestAi ? "player" : "ai";
  const opponentBest = winner === "player" ? bestAi : bestPlayer;
  const winnerDistances = winner === "player" ? playerDistances : aiDistances;
  const points = winnerDistances.filter((value) => value + DISTANCE_EPSILON < opponentBest).length;

  return {
    player: winner === "player" ? points : 0,
    ai: winner === "ai" ? points : 0,
    winner,
    points,
    playerNearest: bestPlayer,
    aiNearest: bestAi,
    playerDistances,
    aiDistances,
  };
}

function getNextTurn(world, shooter) {
  const playerHasRemaining = getRemainingBalls(world, "player").length > 0;
  const aiHasRemaining = getRemainingBalls(world, "ai").length > 0;
  if (!playerHasRemaining && !aiHasRemaining) return null;
  if (!playerHasRemaining) return "ai";
  if (!aiHasRemaining) return "player";

  const playerNearest = getNearestDistance(world, "player");
  const aiNearest = getNearestDistance(world, "ai");
  if (!Number.isFinite(playerNearest)) return "player";
  if (!Number.isFinite(aiNearest)) return "ai";
  if (playerNearest > aiNearest + DISTANCE_EPSILON) return "player";
  if (aiNearest > playerNearest + DISTANCE_EPSILON) return "ai";
  return shooter === "player" ? "ai" : "player";
}

function physicsObjects(world) {
  return [
    ...(world.jack.placed ? [world.jack] : []),
    ...world.balls.filter((ball) => ball.active),
  ];
}

function resolveWall(object, onWall = null) {
  let hit = false;
  let force = 0;
  if (object.x - object.r < FIELD.left) {
    object.x = FIELD.left + object.r;
    if (object.vx < 0) {
      force = Math.abs(object.vx);
      object.vx = -object.vx * WALL_RESTITUTION;
      hit = true;
    }
    object.vy *= 0.985;
  }
  if (object.x + object.r > FIELD.right) {
    object.x = FIELD.right - object.r;
    if (object.vx > 0) {
      force = Math.abs(object.vx);
      object.vx = -object.vx * WALL_RESTITUTION;
      hit = true;
    }
    object.vy *= 0.985;
  }
  if (object.y - object.r < FIELD.top) {
    object.y = FIELD.top + object.r;
    if (object.vy < 0) {
      force = Math.abs(object.vy);
      object.vy = -object.vy * WALL_RESTITUTION;
      hit = true;
    }
    object.vx *= 0.985;
  }
  if (object.y + object.r > FIELD.bottom) {
    object.y = FIELD.bottom - object.r;
    if (object.vy > 0) {
      force = Math.abs(object.vy);
      object.vy = -object.vy * WALL_RESTITUTION;
      hit = true;
    }
    object.vx *= 0.985;
  }
  if (hit && force > 20 && onWall) {
    onWall(object, force);
  }
}

function deterministicNormal(a, b) {
  const text = `${a.id}:${b.id}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  const angle = (Math.abs(hash) % 8) * (Math.PI / 4);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function resolveCollision(a, b, onCollision = null) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minimumDistance = a.r + b.r;
  const rawDistance = Math.hypot(dx, dy);
  if (rawDistance >= minimumDistance) return;

  const normal = rawDistance > 0.0001 ? { x: dx / rawDistance, y: dy / rawDistance } : deterministicNormal(a, b);
  const actualDistance = rawDistance || 0.0001;
  const overlap = minimumDistance - actualDistance;
  const inverseMass = a.invMass + b.invMass || 1;
  const correction = overlap / inverseMass;
  a.x -= normal.x * correction * a.invMass;
  a.y -= normal.y * correction * a.invMass;
  b.x += normal.x * correction * b.invMass;
  b.y += normal.y * correction * b.invMass;

  const relativeNormal = (b.vx - a.vx) * normal.x + (b.vy - a.vy) * normal.y;
  if (relativeNormal >= 0) return;

  const restitution = a.kind === "jack" || b.kind === "jack" ? BALL_RESTITUTION * 0.92 : BALL_RESTITUTION;
  const impulse = -(1 + restitution) * relativeNormal / inverseMass;
  a.vx -= impulse * normal.x * a.invMass;
  a.vy -= impulse * normal.y * a.invMass;
  b.vx += impulse * normal.x * b.invMass;
  b.vy += impulse * normal.y * b.invMass;

  const tangent = { x: -normal.y, y: normal.x };
  const relativeTangent = (b.vx - a.vx) * tangent.x + (b.vy - a.vy) * tangent.y;
  const maxTangentImpulse = Math.abs(impulse) * COLLISION_FRICTION;
  const tangentImpulse = clamp(-relativeTangent / inverseMass, -maxTangentImpulse, maxTangentImpulse);
  a.vx -= tangentImpulse * tangent.x * a.invMass;
  a.vy -= tangentImpulse * tangent.y * a.invMass;
  b.vx += tangentImpulse * tangent.x * b.invMass;
  b.vy += tangentImpulse * tangent.y * b.invMass;

  if (onCollision && Math.abs(relativeNormal) > 12) {
    onCollision(a, b, Math.abs(relativeNormal), (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
}

function stepPhysics(world, { isLive = false, onCollision = null, onWall = null } = {}) {
  const objects = physicsObjects(world);
  objects.forEach((object) => {
    object.x += object.vx * PHYSICS_STEP;
    object.y += object.vy * PHYSICS_STEP;

    const speed = Math.hypot(object.vx, object.vy);
    if (speed > 0.05) {
      // Rotação física de esfera rolando no chão
      object.rollAngle = (object.rollAngle || 0) + (speed * PHYSICS_STEP) / object.r;
      object.heading = Math.atan2(object.vy, object.vx);

      // Desaceleração realista do saibro/terra batida (rolling resistance de cancha tradicional)
      const clayDecel = 22 * PHYSICS_STEP;
      if (speed > clayDecel) {
        const factor = (speed - clayDecel) / speed;
        object.vx *= FRICTION * factor;
        object.vy *= FRICTION * factor;
      } else {
        object.vx = 0;
        object.vy = 0;
      }

      // Rastro sutil no saibro
      if (isLive && speed > 22) {
        if (!world.trails) world.trails = [];
        if (world.trails.length > 280) world.trails.shift();
        world.trails.push({
          x: object.x,
          y: object.y,
          r: object.r * 0.72,
        });
      }
    }

    resolveWall(object, onWall);
  });

  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 0; index < objects.length; index += 1) {
      for (let next = index + 1; next < objects.length; next += 1) {
        resolveCollision(objects[index], objects[next], onCollision);
      }
    }
    objects.forEach((obj) => resolveWall(obj, onWall));
  }

  // Atualiza partículas ativas
  if (isLive && world.particles && world.particles.length > 0) {
    world.particles.forEach((p) => {
      p.x += p.vx * PHYSICS_STEP;
      p.y += p.vy * PHYSICS_STEP;
      p.life -= PHYSICS_STEP * 2.8;
    });
    world.particles = world.particles.filter((p) => p.life > 0);
  }

  objects.forEach((object) => {
    if (Math.hypot(object.vx, object.vy) < STOP_SPEED) {
      object.vx = 0;
      object.vy = 0;
    }
  });
}

function isWorldMoving(world) {
  return physicsObjects(world).some((object) => Math.hypot(object.vx, object.vy) >= STOP_SPEED);
}

function availableLaunchY(world, preferredY) {
  const geometry = getHeadGeometry(world.headSide);
  const candidates = [
    preferredY,
    preferredY - 28,
    preferredY + 28,
    preferredY - 56,
    preferredY + 56,
    preferredY - 84,
    preferredY + 84,
    preferredY - 112,
    preferredY + 112,
  ].map((value) => clamp(value, FIELD.top + BALL_RADIUS + 2, FIELD.bottom - BALL_RADIUS - 2));
  const occupied = physicsObjects(world);
  const clear = (y) => occupied.every((object) => distance({ x: geometry.launchX, y }, object) > BALL_RADIUS + object.r + 4);
  const free = candidates.find(clear);
  if (free != null) return free;

  let best = candidates[0];
  let bestGap = -Infinity;
  for (let y = FIELD.top + BALL_RADIUS + 2; y <= FIELD.bottom - BALL_RADIUS - 2; y += 4) {
    const gap = Math.min(...occupied.map((object) => distance({ x: geometry.launchX, y }, object) - BALL_RADIUS - object.r));
    if (gap > bestGap) {
      bestGap = gap;
      best = y;
    }
  }
  return best;
}

function injectSimulationShot(world, candidate) {
  const simulation = cloneWorld(world);
  const simulatedBall = {
    id: "simulation-shot",
    team: candidate.team,
    x: candidate.launchX,
    y: candidate.launchY,
    vx: candidate.direction.x * MAX_SPEED * candidate.power,
    vy: candidate.direction.y * MAX_SPEED * candidate.power,
    r: BALL_RADIUS,
    invMass: 1 / (BALL_RADIUS * BALL_RADIUS),
    played: true,
    active: true,
    number: 0,
  };
  simulation.balls = [...simulation.balls.filter((ball) => ball.active), simulatedBall];
  return simulation;
}

function simulateShot(world, candidate) {
  const simulation = injectSimulationShot(world, candidate);
  const path = [{ x: candidate.launchX, y: candidate.launchY }];
  for (let step = 0; step < MAX_SIMULATION_STEPS; step += 1) {
    stepPhysics(simulation);
    if (step % 8 === 0) {
      const ball = simulation.balls[simulation.balls.length - 1];
      path.push({ x: ball.x, y: ball.y });
    }
    if (step > 12 && !isWorldMoving(simulation)) break;
  }
  const ball = simulation.balls[simulation.balls.length - 1];
  return { world: simulation, path, ball, stop: { x: ball.x, y: ball.y } };
}

function buildCourtBackground() {
  const background = document.createElement("canvas");
  background.width = COURT_W;
  background.height = COURT_H;
  const ctx = background.getContext("2d");
  if (!ctx) return background;

  // Piso do ginásio/galpão de bocha
  const night = ctx.createLinearGradient(0, 0, COURT_W, COURT_H);
  night.addColorStop(0, "#080b0b");
  night.addColorStop(0.5, "#151310");
  night.addColorStop(1, "#070909");
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, COURT_W, COURT_H);

  // Moldura de madeira nobre maciça (Ipê / Canela)
  roundedRectPath(ctx, FRAME.left, FRAME.top, FRAME.right - FRAME.left, FRAME.bottom - FRAME.top, 22);
  const wood = ctx.createLinearGradient(FRAME.left, FRAME.top, FRAME.right, FRAME.bottom);
  wood.addColorStop(0, "#6e3b1c");
  wood.addColorStop(0.2, "#3b2014");
  wood.addColorStop(0.55, "#613318");
  wood.addColorStop(1, "#1c0e09");
  ctx.fillStyle = wood;
  ctx.fill();

  // Veios naturais da madeira nobre
  ctx.save();
  roundedRectPath(ctx, FRAME.left, FRAME.top, FRAME.right - FRAME.left, FRAME.bottom - FRAME.top, 22);
  ctx.clip();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#f3b372";
  ctx.lineWidth = 1;
  for (let index = -15; index < 145; index += 1) {
    const y = FRAME.top + index * 4.6;
    ctx.beginPath();
    ctx.moveTo(FRAME.left - 20, y);
    ctx.bezierCurveTo(
      310,
      y + Math.sin(index) * 8,
      720,
      y - Math.cos(index * 0.75) * 9,
      FRAME.right + 20,
      y + Math.sin(index * 0.35) * 7
    );
    ctx.stroke();
  }
  ctx.restore();

  // Cantoneiras de latão com parafusos nas quinas da cancha
  const brassCorners = [
    { x: FRAME.left + 16, y: FRAME.top + 16 },
    { x: FRAME.right - 16, y: FRAME.top + 16 },
    { x: FRAME.left + 16, y: FRAME.bottom - 16 },
    { x: FRAME.right - 16, y: FRAME.bottom - 16 },
  ];
  brassCorners.forEach(({ x, y }) => {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#c99a3e";
    ctx.fill();
    ctx.strokeStyle = "#4a320c";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Fenda do parafuso
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 1);
    ctx.lineTo(x + 3, y + 1);
    ctx.strokeStyle = "#2e1e07";
    ctx.stroke();
  });

  // Guarnição interna em pedra/borracha de amortecimento
  roundedRectPath(ctx, 43, 43, COURT_W - 86, COURT_H - 86, 16);
  const stone = ctx.createLinearGradient(0, 43, 0, COURT_H - 43);
  stone.addColorStop(0, "#bfaf88");
  stone.addColorStop(0.08, "#635f55");
  stone.addColorStop(0.5, "#252826");
  stone.addColorStop(0.92, "#68655b");
  stone.addColorStop(1, "#bea878");
  ctx.fillStyle = stone;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,244,207,0.35)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Caixa da cancha
  roundedRectPath(ctx, FIELD.left - 10, FIELD.top - 10, FIELD.right - FIELD.left + 20, FIELD.bottom - FIELD.top + 20, 11);
  ctx.fillStyle = "#221410";
  ctx.fill();

  // Superfície de Saibro / Terra Batida Vermelha Tradicional
  const clay = ctx.createRadialGradient(550, 170, 30, 540, 290, 680);
  clay.addColorStop(0, "#e4985f");
  clay.addColorStop(0.35, "#cb7247");
  clay.addColorStop(0.72, "#a04c32");
  clay.addColorStop(1, "#5f261c");
  ctx.fillStyle = clay;
  ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

  // Granulação fina do saibro prensado
  ctx.save();
  ctx.beginPath();
  ctx.rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
  ctx.clip();
  for (let index = 0; index < 750; index += 1) {
    const x = FIELD.left + ((index * 83 + (index % 7) * 17) % (FIELD.right - FIELD.left));
    const y = FIELD.top + ((index * 47 + (index % 11) * 11) % (FIELD.bottom - FIELD.top));
    const size = 0.4 + (index % 5) * 0.32;
    ctx.fillStyle = index % 3 === 0 ? "rgba(255,225,165,0.18)" : "rgba(50,20,12,0.22)";
    ctx.fillRect(x, y, size, size);
  }

  // Estrias sutis de rastelo na terra batida
  ctx.globalAlpha = 0.11;
  ctx.strokeStyle = "#f8cb92";
  ctx.lineWidth = 1;
  for (let index = -12; index < 85; index += 1) {
    const y = FIELD.top + index * 6.5;
    ctx.beginPath();
    ctx.moveTo(FIELD.left, y);
    ctx.lineTo(FIELD.right, y + 15);
    ctx.stroke();
  }

  // Refletores de teto (iluminação cenográfica de ginásio de bocha)
  const lampCenter = ctx.createRadialGradient(COURT_W / 2, COURT_H / 2, 40, COURT_W / 2, COURT_H / 2, 450);
  lampCenter.addColorStop(0, "rgba(255, 235, 190, 0.16)");
  lampCenter.addColorStop(0.5, "rgba(255, 215, 150, 0.05)");
  lampCenter.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = lampCenter;
  ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

  ctx.restore();

  drawSurface(ctx, FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, "clay");

  // Bordas de madeira interna da cancha
  ctx.strokeStyle = "rgba(48,18,11,0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
  ctx.strokeStyle = "rgba(255,225,172,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(FIELD.left + 4, FIELD.top + 4, FIELD.right - FIELD.left - 8, FIELD.bottom - FIELD.top - 8);

  // Amortecedores laterais
  ctx.fillStyle = "rgba(30,16,12,0.36)";
  ctx.fillRect(FIELD.left - 1, FIELD.top - 8, FIELD.right - FIELD.left + 2, 8);
  ctx.fillRect(FIELD.left - 1, FIELD.bottom, FIELD.right - FIELD.left + 2, 8);
  ctx.strokeStyle = "rgba(255,228,183,0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FIELD.left, FIELD.top - 4);
  ctx.lineTo(FIELD.right, FIELD.top - 4);
  ctx.moveTo(FIELD.left, FIELD.bottom + 4);
  ctx.lineTo(FIELD.right, FIELD.bottom + 4);
  ctx.stroke();

  // Linhas de cabeceira oficiais
  ctx.save();
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = "rgba(255,235,200,0.52)";
  ctx.lineWidth = 1.6;
  [getHeadGeometry("left").lineX, getHeadGeometry("right").lineX].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, FIELD.top + 5);
    ctx.lineTo(x, FIELD.bottom - 5);
    ctx.stroke();
  });
  ctx.restore();

  // Linha do meio da cancha (Zona Neutra)
  const midCourtX = (FIELD.left + FIELD.right) / 2;
  ctx.strokeStyle = "rgba(255,237,204,0.22)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(midCourtX, FIELD.top + 10);
  ctx.lineTo(midCourtX, FIELD.bottom - 10);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,237,204,0.32)";
  ctx.font = "700 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LINHA DO MEIO · CANCHA NEUTRA", midCourtX, FIELD.top + 20);
  ctx.textAlign = "left";

  // Identificação da Cancha
  ctx.fillStyle = "rgba(255,241,215,0.62)";
  ctx.font = "800 10.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("CANCHA DE BOCHA GAÚCHA · ARENABET", 72, 38);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,241,215,0.38)";
  ctx.fillText("SAIBRO TRATADO / REGULAMENTO OFICIAL", 1028, 38);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,225,180,0.48)";
  ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("CABECEIRA ESQUERDA", getHeadGeometry("left").lineX - 42, FIELD.bottom + 26);
  ctx.fillText("CABECEIRA DIREITA", getHeadGeometry("right").lineX - 38, FIELD.bottom + 26);

  // Régua métrica ao longo da borda inferior em metros reais (0m a 12m)
  ctx.fillStyle = "rgba(255,229,181,0.52)";
  ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("RÉGUA DA CANCHA · METROS", 72, 528);
  for (let index = 0; index <= 12; index += 1) {
    const x = 240 + index * 60;
    const isMajor = index % 2 === 0;
    const tickHeight = isMajor ? 11 : 6;
    ctx.strokeStyle = isMajor ? "rgba(255,230,184,0.7)" : "rgba(255,230,184,0.32)";
    ctx.beginPath();
    ctx.moveTo(x, 526);
    ctx.lineTo(x, 526 - tickHeight);
    ctx.stroke();
    if (isMajor) ctx.fillText(`${index}m`, x - 7, 548);
  }
  return background;
}

function drawSandTrails(ctx, world) {
  if (!world.trails || !world.trails.length) return;
  ctx.save();
  world.trails.forEach((trail) => {
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, trail.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(45, 18, 10, 0.08)";
    ctx.fill();
  });
  ctx.restore();
}

function drawParticles(ctx, world) {
  if (!world.particles || !world.particles.length) return;
  ctx.save();
  world.particles.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fill();
  });
  ctx.restore();
}

function drawSphere(ctx, ball, { ghost = false, highlight = false } = {}) {
  const style = TEAM_STYLE[ball.team];
  ctx.save();
  ctx.globalAlpha = ghost ? 0.46 : 1;
  const speed = Math.hypot(ball.vx || 0, ball.vy || 0);
  const roll = ball.rollAngle || 0;
  const heading = ball.heading || 0;

  // 1. Sombra de oclusão no ponto de contato no saibro
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + ball.r * 0.82, ball.r * 0.84, ball.r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(18, 7, 4, 0.72)";
  ctx.fill();

  // 2. Sombra difusa projetada pela iluminação do ginásio
  const shadowDist = 6 + Math.min(4, speed * 0.008);
  ctx.beginPath();
  ctx.ellipse(ball.x + shadowDist * 0.6, ball.y + shadowDist, ball.r * 1.05, ball.r * 0.58, 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(22, 9, 5, 0.38)";
  ctx.fill();

  // 3. Gradiente esférico da resina polida de alta densidade
  const gradient = ctx.createRadialGradient(
    ball.x - ball.r * 0.38,
    ball.y - ball.r * 0.44,
    1,
    ball.x,
    ball.y,
    ball.r * 1.08
  );
  gradient.addColorStop(0, "#fffbf2");
  gradient.addColorStop(0.12, style.light);
  gradient.addColorStop(0.48, style.fill);
  gradient.addColorStop(0.85, style.dark);
  gradient.addColorStop(1, "#180a08");

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // 4. Ranhuras usinadas em relevo (bochas raiadas tradicionais de competição)
  // As ranhuras giram em perspectiva 3D conforme o rolamento e o trajeto!
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r - 0.5, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(ball.x, ball.y);
  ctx.rotate(heading);

  const grooveOffsets = [-ball.r * 0.35, 0, ball.r * 0.35];
  grooveOffsets.forEach((offsetY) => {
    const cosRoll = Math.cos(roll + offsetY * 0.1);
    const radiusY = Math.max(1.5, Math.abs(cosRoll) * ball.r * 0.7);
    ctx.beginPath();
    ctx.ellipse(offsetY * 0.4, 0, ball.r * 0.88, radiusY, 0, 0, Math.PI * 2);
    // Sombra interna da ranhura usinada
    ctx.strokeStyle = "rgba(18, 5, 3, 0.45)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Brilho na borda usinada da ranhura
    ctx.strokeStyle = style.groove ? `${style.groove}44` : "rgba(255, 240, 200, 0.28)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });

  ctx.restore();

  // 5. Contorno e anel de realce
  ctx.lineWidth = highlight ? 2.4 : 1.2;
  ctx.strokeStyle = highlight ? "rgba(255, 243, 192, 0.95)" : "rgba(35, 12, 8, 0.65)";
  ctx.stroke();

  // 6. Número oficial gravado em baixo relevo
  if (!ghost && ball.number) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 8, 6, 0.36)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 235, 190, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#fffaf0";
    ctx.font = "800 9.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ball.number, ball.x, ball.y + 0.5);
  }

  // 7. Reflexo especular duplo (luz difusa de ginásio + brilho pontual cristalino)
  const glint = ctx.createRadialGradient(
    ball.x - ball.r * 0.4,
    ball.y - ball.r * 0.46,
    0,
    ball.x - ball.r * 0.4,
    ball.y - ball.r * 0.46,
    ball.r * 0.42
  );
  glint.addColorStop(0, "rgba(255, 255, 255, 0.82)");
  glint.addColorStop(0.35, "rgba(255, 255, 255, 0.32)");
  glint.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.beginPath();
  ctx.arc(ball.x - ball.r * 0.4, ball.y - ball.r * 0.46, ball.r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = glint;
  ctx.fill();

  ctx.restore();
}

function drawJack(ctx, jack, { ghost = false, highlight = false } = {}) {
  ctx.save();
  ctx.globalAlpha = ghost ? 0.5 : 1;

  // Sombra de contato no saibro
  ctx.beginPath();
  ctx.ellipse(jack.x, jack.y + jack.r * 0.78, jack.r * 0.82, jack.r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20, 8, 4, 0.72)";
  ctx.fill();

  // Sombra suave difusa
  ctx.beginPath();
  ctx.ellipse(jack.x + 4, jack.y + 6, jack.r * 1.05, jack.r * 0.6, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(25, 11, 6, 0.4)";
  ctx.fill();

  // Halo sutil de localização na cancha
  const glow = ctx.createRadialGradient(jack.x, jack.y, jack.r, jack.x, jack.y, jack.r * 2.8);
  glow.addColorStop(0, "rgba(255, 224, 83, 0.32)");
  glow.addColorStop(1, "rgba(255, 224, 83, 0)");
  ctx.beginPath();
  ctx.arc(jack.x, jack.y, jack.r * 2.8, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Bolim esmaltado amarelo tradicional (canary yellow pallino)
  const gradient = ctx.createRadialGradient(
    jack.x - jack.r * 0.38,
    jack.y - jack.r * 0.42,
    1,
    jack.x,
    jack.y,
    jack.r * 1.15
  );
  gradient.addColorStop(0, "#fffff0");
  gradient.addColorStop(0.25, "#fff068");
  gradient.addColorStop(0.72, "#f0ab0a");
  gradient.addColorStop(1, "#8f5707");
  ctx.beginPath();
  ctx.arc(jack.x, jack.y, jack.r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = highlight ? 2.4 : 1.2;
  ctx.strokeStyle = highlight ? "rgba(255, 252, 190, 0.95)" : "rgba(100, 58, 6, 0.8)";
  ctx.stroke();

  // Ponto de brilho especular
  ctx.beginPath();
  ctx.arc(jack.x - jack.r * 0.35, jack.y - jack.r * 0.38, jack.r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fill();

  ctx.restore();
}

function drawJackZone(ctx, world, dragging) {
  const geometry = getHeadGeometry(world.headSide);
  const width = geometry.validMaxX - geometry.validMinX;
  const height = geometry.validMaxY - geometry.validMinY;
  ctx.save();
  ctx.fillStyle = dragging ? "rgba(255,222,118,0.14)" : "rgba(255,222,118,0.06)";
  ctx.fillRect(geometry.validMinX, geometry.validMinY, width, height);
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = dragging ? "rgba(255,238,160,0.92)" : "rgba(255,231,165,0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(geometry.validMinX, geometry.validMinY, width, height);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,243,195,0.8)";
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("ZONA REGULAMENTAR DO BOLIM", geometry.validMinX + 12, geometry.validMinY + 20);
  ctx.fillStyle = "rgba(255,243,195,0.48)";
  ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("solte nesta área para iniciar a mão", geometry.validMinX + 12, geometry.validMinY + 35);
  ctx.restore();
}

function drawAimGuide(ctx, aim, world) {
  const prediction = aim.prediction;
  const isBochada = aim.shotType === "bochada";
  const fallbackTravel = (MAX_SPEED * aim.power * PHYSICS_STEP) / Math.max(0.001, 1 - FRICTION);
  const fallbackStop = {
    x: aim.anchor.x + aim.dir.x * fallbackTravel,
    y: aim.anchor.y + aim.dir.y * fallbackTravel,
  };
  const stop = prediction?.stop || fallbackStop;
  const path = prediction?.path?.length > 1 ? prediction.path : [aim.anchor, fallbackStop];
  const style = TEAM_STYLE.player;
  ctx.save();
  ctx.globalAlpha = 0.92;

  // Trajetória: linha pontilhada enérgica se for tiro/bochada, suave se for ponto/arrimo
  ctx.setLineDash(isBochada ? [9, 6] : [6, 7]);
  ctx.strokeStyle = isBochada ? "rgba(251, 146, 60, 0.95)" : "rgba(255, 247, 215, 0.92)";
  ctx.lineWidth = isBochada ? 2.6 : 1.8;
  ctx.beginPath();
  path.forEach((point, index) => {
    const x = clamp(point.x, FIELD.left, FIELD.right);
    const y = clamp(point.y, FIELD.top, FIELD.bottom);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  const end = path[path.length - 1];
  const side = { x: -aim.dir.y, y: aim.dir.x };
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - aim.dir.x * 12 + side.x * 7, end.y - aim.dir.y * 12 + side.y * 7);
  ctx.lineTo(end.x - aim.dir.x * 12 - side.x * 7, end.y - aim.dir.y * 12 - side.y * 7);
  ctx.closePath();
  ctx.fillStyle = isBochada ? "rgba(251, 146, 60, 0.95)" : "rgba(255, 247, 215, 0.92)";
  ctx.fill();

  const zoneX = clamp(stop.x, FIELD.left + BALL_RADIUS, FIELD.right - BALL_RADIUS);
  const zoneY = clamp(stop.y, FIELD.top + BALL_RADIUS, FIELD.bottom - BALL_RADIUS);

  if (isBochada) {
    // Alvo de impacto de bochada
    ctx.beginPath();
    ctx.arc(zoneX, zoneY, 22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(251, 146, 60, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Mira em cruz
    ctx.beginPath();
    ctx.moveTo(zoneX - 10, zoneY);
    ctx.lineTo(zoneX + 10, zoneY);
    ctx.moveTo(zoneX, zoneY - 10);
    ctx.lineTo(zoneX, zoneY + 10);
    ctx.strokeStyle = "rgba(255, 237, 213, 0.9)";
    ctx.stroke();
  } else {
    // Zona de parada de precisão do arrimo
    ctx.beginPath();
    ctx.ellipse(zoneX, zoneY, 18 + aim.power * 20, 11 + aim.power * 11, Math.atan2(aim.dir.y, aim.dir.x), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,228,135,0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,240,167,0.85)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSphere(ctx, {
    id: "aim-ball",
    team: "player",
    x: aim.anchor.x,
    y: aim.anchor.y,
    vx: 0,
    vy: 0,
    r: BALL_RADIUS,
    number: 0,
  }, { ghost: true });

  ctx.fillStyle = isBochada ? "#fed7aa" : "rgba(255,247,215,0.88)";
  ctx.font = "800 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  if (isBochada) {
    ctx.fillText("💥 BOCHADA (TIRO POTENTE)", zoneX + 17, zoneY - 16);
  } else {
    ctx.fillText(`🎯 ARRIMADA ~ ${formatDistance(distance({ x: zoneX, y: zoneY }, world.jack))}`, zoneX + 17, zoneY - 16);
  }
  ctx.fillStyle = style.light;
  ctx.fillText(`${Math.round(aim.power * 100)}%`, aim.anchor.x + 21, aim.anchor.y - 18);
  ctx.restore();
}

function drawJackAimGuide(ctx, aim) {
  const target = aim.target;
  const start = aim.anchor;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "rgba(255,236,150,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, JACK_RADIUS + 12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,223,90,0.12)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,238,160,0.92)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawJack(ctx, { ...target, r: JACK_RADIUS }, { ghost: true, highlight: true });
  ctx.fillStyle = "rgba(255,246,193,0.88)";
  ctx.font = "800 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("SOLTE PARA FIXAR", target.x + 16, target.y + 4);
  ctx.restore();
}

function drawMeasurement(ctx, world) {
  if (!world.jack.placed) return;
  const activeBalls = world.balls.filter((ball) => ball.active);
  if (!activeBalls.length) return;

  const overallBest = activeBalls.slice().sort((left, right) => distance(left, world.jack) - distance(right, world.jack))[0];
  const bestDist = distance(overallBest, world.jack);

  ctx.save();

  // 1. Círculo regulamentar do raio do ponto (mostra a marca exata a ser batida)
  ctx.beginPath();
  ctx.arc(world.jack.x, world.jack.y, bestDist, 0, Math.PI * 2);
  ctx.strokeStyle = overallBest.team === "player" ? "rgba(239, 68, 68, 0.42)" : "rgba(59, 130, 246, 0.42)";
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Trena oficial milimétrica amarela esticada do bolim até a bola mais próxima
  const dx = overallBest.x - world.jack.x;
  const dy = overallBest.y - world.jack.y;
  const angle = Math.atan2(dy, dx);
  const perp = { x: -Math.sin(angle), y: Math.cos(angle) };

  // Fita amarela da trena
  ctx.beginPath();
  ctx.moveTo(world.jack.x, world.jack.y);
  ctx.lineTo(overallBest.x, overallBest.y);
  ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
  ctx.lineWidth = 3.2;
  ctx.stroke();

  // Traços milimétricos impressos na trena
  ctx.strokeStyle = "rgba(35, 18, 8, 0.8)";
  ctx.lineWidth = 1;
  const tickCount = Math.floor(bestDist / 12);
  for (let i = 1; i < tickCount; i += 1) {
    const t = (i * 12) / bestDist;
    const tx = world.jack.x + dx * t;
    const ty = world.jack.y + dy * t;
    const tickLen = i % 5 === 0 ? 4.5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(tx - perp.x * tickLen, ty - perp.y * tickLen);
    ctx.lineTo(tx + perp.x * tickLen, ty + perp.y * tickLen);
    ctx.stroke();
  }

  // 3. Emblema oficial com a indicação de liderança e a distância em cm
  const midX = (world.jack.x + overallBest.x) / 2;
  const midY = (world.jack.y + overallBest.y) / 2 - 14;

  const teamLabel = overallBest.team === "player" ? "SEU" : "IA";
  const badgeText = `PONTO ${teamLabel} · ${formatDistance(bestDist)}`;

  ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const textWidth = ctx.measureText(badgeText).width;
  const badgeW = textWidth + 18;
  const badgeH = 20;

  roundedRectPath(ctx, midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 6);
  ctx.fillStyle = overallBest.team === "player" ? "rgba(130, 25, 20, 0.94)" : "rgba(18, 48, 108, 0.94)";
  ctx.fill();
  ctx.strokeStyle = overallBest.team === "player" ? "rgba(252, 165, 165, 0.85)" : "rgba(147, 197, 253, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, midX, midY + 0.5);

  ctx.restore();
}

function drawReserve(ctx, world) {
  const drawTeam = (team, x) => {
    const style = TEAM_STYLE[team];
    ctx.fillStyle = "rgba(255,242,220,0.58)";
    ctx.font = "800 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(team === "player" ? "VERMELHAS" : "AZUIS", x, 514);
    world.balls.filter((ball) => ball.team === team).forEach((ball, index) => {
      const dotX = x + 61 + index * 18;
      ctx.beginPath();
      ctx.arc(dotX, 511, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = ball.played ? "rgba(255,241,219,0.16)" : style.fill;
      ctx.fill();
      ctx.strokeStyle = ball.played ? "rgba(255,241,219,0.2)" : style.light;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };
  drawTeam("player", 73);
  drawTeam("ai", 825);
}

function drawLaunchPrompt(ctx, world) {
  const geometry = getHeadGeometry(world.headSide);
  ctx.save();
  ctx.fillStyle = "rgba(255,242,209,0.08)";
  ctx.fillRect(geometry.lineX - 44, FIELD.top, 88, FIELD.bottom - FIELD.top);
  ctx.strokeStyle = "rgba(255,239,202,0.88)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(geometry.lineX, FIELD.top + 5);
  ctx.lineTo(geometry.lineX, FIELD.bottom - 5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,241,210,0.78)";
  ctx.font = "800 9px ui-sans-serif, system-ui, sans-serif";
  ctx.save();
  ctx.translate(geometry.lineX + (geometry.direction < 0 ? -24 : 24), (FIELD.top + FIELD.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("PUXE PARA TRÁS · SOLTE", 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawFocusRing(ctx, world) {
  if (!world.jack.placed) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,239,151,0.36)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.arc(world.jack.x, world.jack.y, 31, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function MiniMap({ snapshot }) {
  const mapPosition = (x, y) => ({
    left: `${clamp(((x - FIELD.left) / (FIELD.right - FIELD.left)) * 100, 2, 98)}%`,
    top: `${clamp(((y - FIELD.top) / (FIELD.bottom - FIELD.top)) * 100, 8, 92)}%`,
  });
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-[#d88a55]/30 bg-[#6f3928] shadow-inner" data-testid="bocha-minimap">
      <div className="absolute inset-x-2 top-2 h-1 rounded-full bg-[#e2ad78]/30" />
      <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-[#e2ad78]/30" />
      <div className="absolute inset-y-2 left-[10%] w-px bg-white/25" />
      <div className="absolute inset-y-2 right-[10%] w-px bg-white/25" />
      {snapshot?.jack?.placed && (
        <span className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-100 bg-yellow-300 shadow-[0_0_0_5px_rgba(253,224,71,0.16)]" style={mapPosition(snapshot.jack.x, snapshot.jack.y)} />
      )}
      {snapshot?.balls?.map((ball) => (
        <span
          key={ball.id}
          className={`absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${ball.team === "player" ? "border-red-100 bg-red-500" : "border-blue-100 bg-blue-500"} ${snapshot.lastShotId === ball.id ? "ring-2 ring-white/80" : ""}`}
          style={mapPosition(ball.x, ball.y)}
        />
      ))}
      <div className="absolute bottom-2 left-3 text-[9px] font-bold uppercase tracking-[0.18em] text-orange-100/55">visão integral</div>
      <div className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-[0.18em] text-orange-100/55">bolim + lançada</div>
    </div>
  );
}

export default function Bocha() {
  const { refreshBalance, user, authReady } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [opponentMode, setOpponentMode] = useState("bot");
  const [opponent, setOpponent] = useState(BOT_OPPONENT);
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState(null);
  const [phase, setPhase] = useState("bet");
  const [handNumber, setHandNumber] = useState(1);
  const [headSide, setHeadSide] = useState("left");
  const [turn, setTurn] = useState("player");
  const [playerLeft, setPlayerLeft] = useState(4);
  const [aiLeft, setAiLeft] = useState(4);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [nearest, setNearest] = useState({ player: Infinity, ai: Infinity });
  const [aiThinking, setAiThinking] = useState(false);
  const [aiMode, setAiMode] = useState(null);
  const [moving, setMoving] = useState(false);
  const [powerPct, setPowerPct] = useState(0);
  const [shotType, setShotType] = useState("ponto"); // "ponto" | "bochada"
  const shotTypeRef = useRef("ponto");
  shotTypeRef.current = shotType;
  const lastCollisionSoundRef = useRef(0);
  const lastWallSoundRef = useRef(0);
  const [handResult, setHandResult] = useState(null);
  const [handHistory, setHandHistory] = useState([]);
  const [miniSnapshot, setMiniSnapshot] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [worldVersion, setWorldVersion] = useState(0);

  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const drawRef = useRef(null);
  const worldRef = useRef(null);
  const matchRef = useRef(null);
  const resultRef = useRef(null);
  const configRef = useRef(null);
  const betRef = useRef(50);
  const phaseRef = useRef("bet");
  const handNumberRef = useRef(1);
  const headSideRef = useRef("left");
  const turnRef = useRef("player");
  const opponentRef = useRef(BOT_OPPONENT);
  opponentRef.current = opponent;
  const playerLeftRef = useRef(4);
  const aiLeftRef = useRef(4);
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);
  const handHistoryRef = useRef([]);
  const movingRef = useRef(false);
  const shotTeamRef = useRef(null);
  const resolvingRef = useRef(false);
  const settledRef = useRef(false);
  const handResolvingRef = useRef(false);
  const aimRef = useRef(null);
  const jackAimRef = useRef(null);
  const frameScheduleRef = useRef(null);
  const physicsTokenRef = useRef(0);
  const lastFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const animatingRef = useRef(false);
  const aiTimerRef = useRef(null);
  const handTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const setPhaseValue = (value) => {
    phaseRef.current = value;
    setPhase(value);
  };

  const setTurnValue = (value) => {
    turnRef.current = value;
    setTurn(value);
  };

  const setMovingValue = (value) => {
    movingRef.current = value;
    setMoving(value);
  };

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    (async () => {
      try {
        const [currentBalance, houseConfig] = await Promise.all([getBalance(), getHouseConfig()]);
        if (!active) return;
        setBalance(currentBalance);
        setConfig(houseConfig);
        configRef.current = houseConfig;
        if (50 < houseConfig.min_bet) setBet(houseConfig.min_bet);
      } catch {
        if (active) setError("Não foi possível carregar a carteira.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (result?.outcome === "win") {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#f4b942", "#ef6a58", "#ffffff"] });
    }
  }, [result]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || COURT_W;
    const cssHeight = rect.height || COURT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // The backing store maps directly from the logical court, not from CSS pixels.
    tableTransform(ctx, canvas, COURT_W, COURT_H);
    ctx.imageSmoothingEnabled = true;
    if (!backgroundRef.current) backgroundRef.current = buildCourtBackground();
    ctx.drawImage(backgroundRef.current, 0, 0, COURT_W, COURT_H);

    const world = worldRef.current;
    if (!world) return;
    const phaseNow = phaseRef.current;
    const activeAim = aimRef.current;
    const activeJackAim = jackAimRef.current;
    const isPlayerTurn = turnRef.current === "player" && !movingRef.current && !resultRef.current;

    // Rastro realista de saibro prensado deixado pelas bochas
    drawSandTrails(ctx, world);

    if (!world.jack.placed) {
      drawJackZone(ctx, world, Boolean(activeJackAim));
      if (activeJackAim) drawJackAimGuide(ctx, activeJackAim);
      else drawJack(ctx, world.jack, { ghost: true, highlight: true });
    }
    world.balls.filter((ball) => ball.active).forEach((ball) => {
      drawSphere(ctx, ball, { highlight: ball.id === world.lastShotId });
    });
    if (world.jack.placed) drawJack(ctx, world.jack, { highlight: Boolean(activeAim) });
    if (world.jack.placed) drawMeasurement(ctx, world);
    if (world.jack.placed) drawFocusRing(ctx, world);

    // Partículas de poeira e impacto na cancha
    drawParticles(ctx, world);

    drawReserve(ctx, world);

    if (phaseNow === "jack" && !world.jack.placed && turnRef.current === "player") {
      if (!activeJackAim) {
        const geometry = getHeadGeometry(world.headSide);
        ctx.save();
        ctx.fillStyle = "rgba(255,239,178,0.78)";
        ctx.font = "800 9px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText("ARRASTE O BOLIM DA LINHA", geometry.lineX + (geometry.direction > 0 ? 14 : -143), FIELD.bottom - 14);
        ctx.restore();
      }
    }
    if (phaseNow === "balls" && isPlayerTurn) {
      if (activeAim) drawAimGuide(ctx, activeAim, world);
      else drawLaunchPrompt(ctx, world);
    }
    void cssWidth;
    void cssHeight;
  };
  drawRef.current = draw;

  useEffect(() => {
    if (!match) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const syncCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round((rect.width || COURT_W) * Math.min(window.devicePixelRatio || 1, 2.5)));
      const height = Math.max(1, Math.round((rect.height || COURT_H) * Math.min(window.devicePixelRatio || 1, 2.5)));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawRef.current?.();
    };
    const observed = canvas.parentElement || canvas;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncCanvas) : null;
    observer?.observe(observed);
    window.addEventListener("resize", syncCanvas);
    syncCanvas();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncCanvas);
    };
  }, [match]);

  useEffect(() => {
    drawRef.current?.();
  }, [match, phase, handNumber, headSide, turn, playerLeft, aiLeft, playerScore, aiScore, moving, powerPct, result, handResult, worldVersion]);

  const cancelScheduledPhysics = () => {
    physicsTokenRef.current += 1;
    const scheduled = frameScheduleRef.current;
    if (scheduled?.rafId != null && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(scheduled.rafId);
    if (scheduled?.timerId != null) window.clearTimeout(scheduled.timerId);
    frameScheduleRef.current = null;
    animatingRef.current = false;
    lastFrameRef.current = 0;
    accumulatorRef.current = 0;
  };

  function runPhysicsFrame(now) {
    if (!animatingRef.current || !worldRef.current) return;
    const currentTime = Number.isFinite(now) ? now : performance.now();
    if (!lastFrameRef.current) lastFrameRef.current = currentTime - 16;
    const elapsed = clamp((currentTime - lastFrameRef.current) / 1000, 0, 0.2);
    lastFrameRef.current = currentTime;
    accumulatorRef.current = Math.min(accumulatorRef.current + elapsed, PHYSICS_STEP * MAX_FRAME_STEPS);

    const onCollision = (a, b, force, cx, cy) => {
      const timestamp = performance.now();
      if (timestamp - lastCollisionSoundRef.current > 42) {
        lastCollisionSoundRef.current = timestamp;
        sfx.bochaClack(clamp(force / 340, 0.25, 1));
      }
      const world = worldRef.current;
      if (world) {
        if (!world.particles) world.particles = [];
        const count = clamp(Math.round(force / 45), 3, 7);
        for (let i = 0; i < count; i += 1) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 20 + Math.random() * 85;
          world.particles.push({
            x: cx + (Math.random() - 0.5) * 6,
            y: cy + (Math.random() - 0.5) * 6,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 1 + Math.random() * 2.2,
            color: Math.random() > 0.4 ? "rgba(225, 150, 95, 0.75)" : "rgba(135, 65, 40, 0.65)",
            life: 0.7 + Math.random() * 0.4,
          });
        }
      }
    };

    const onWall = (obj, force) => {
      const timestamp = performance.now();
      if (timestamp - lastWallSoundRef.current > 60) {
        lastWallSoundRef.current = timestamp;
        sfx.bochaCushion(clamp(force / 260, 0.2, 0.9));
      }
    };

    let steps = 0;
    while (accumulatorRef.current >= PHYSICS_STEP && steps < MAX_FRAME_STEPS) {
      stepPhysics(worldRef.current, { isLive: true, onCollision, onWall });
      accumulatorRef.current -= PHYSICS_STEP;
      steps += 1;
    }
    if (steps >= MAX_FRAME_STEPS) accumulatorRef.current = 0;
    drawRef.current?.();

    if (isWorldMoving(worldRef.current)) {
      schedulePhysicsFrame();
      return;
    }

    animatingRef.current = false;
    setMovingValue(false);
    accumulatorRef.current = 0;
    lastFrameRef.current = 0;
    const shooter = shotTeamRef.current;
    shotTeamRef.current = null;
    handleShotEnd(shooter);
  }

  function schedulePhysicsFrame() {
    if (!animatingRef.current) return;
    const token = physicsTokenRef.current + 1;
    physicsTokenRef.current = token;
    const tick = (time) => {
      if (token !== physicsTokenRef.current || !animatingRef.current) return;
      const scheduled = frameScheduleRef.current;
      if (scheduled?.timerId != null) window.clearTimeout(scheduled.timerId);
      if (scheduled?.rafId != null) window.cancelAnimationFrame(scheduled.rafId);
      frameScheduleRef.current = null;
      runPhysicsFrame(time);
    };
    if (typeof window.requestAnimationFrame === "function") {
      const rafId = window.requestAnimationFrame(tick);
      const timerId = window.setTimeout(() => tick(performance.now()), 42);
      frameScheduleRef.current = { rafId, timerId };
    } else {
      const timerId = window.setTimeout(() => tick(performance.now()), 16);
      frameScheduleRef.current = { timerId };
    }
  }

  const setMiniFromWorld = (world) => {
    setMiniSnapshot(snapshotWorld(world));
    setWorldVersion((value) => value + 1);
  };

  function startPhysics() {
    cancelScheduledPhysics();
    animatingRef.current = true;
    setMovingValue(true);
    accumulatorRef.current = PHYSICS_STEP;
    lastFrameRef.current = performance.now() - 16;
    schedulePhysicsFrame();
  }

  function placeJackAt(target, placedBy) {
    const world = worldRef.current;
    if (!world || world.jack.placed || phaseRef.current !== "jack") return;
    const geometry = getHeadGeometry(world.headSide);
    world.jack.x = clamp(target.x, geometry.validMinX, geometry.validMaxX);
    world.jack.y = clamp(target.y, geometry.validMinY, geometry.validMaxY);
    world.jack.vx = 0;
    world.jack.vy = 0;
    world.jack.placed = true;
    jackAimRef.current = null;
    setPhaseValue("balls");
    setTurnValue(world.openingTeam);
    setAiThinking(false);
    setAiMode(null);
    setMessage(placedBy === "player" ? "Bolim fixado. Agora vale a força da sua primeira bocha." : "A IA marcou o bolim. Observe o primeiro lançamento.");
    setMiniFromWorld(world);
    drawRef.current?.();
  }

  function chooseAiJack(world) {
    const geometry = getHeadGeometry(world.headSide);
    const noise = (1 - AI_DIFFICULTY) * 0.18;
    return {
      x: clamp(geometry.validMinX + (geometry.validMaxX - geometry.validMinX) * (0.55 + (Math.random() - 0.5) * noise), geometry.validMinX, geometry.validMaxX),
      y: clamp((geometry.validMinY + geometry.validMaxY) / 2 + (Math.random() - 0.5) * (geometry.validMaxY - geometry.validMinY) * noise, geometry.validMinY, geometry.validMaxY),
    };
  }

  function chooseAiShot(world) {
    const geometry = getHeadGeometry(world.headSide);
    const playerBalls = getPlayedBalls(world, "player");
    const nearestPlayerBall = playerBalls.slice().sort((left, right) => distance(left, world.jack) - distance(right, world.jack))[0];
    const playerNearest = getNearestDistance(world, "player");
    const aiNearest = getNearestDistance(world, "ai");
    const playerHasThreat = Number.isFinite(playerNearest);
    const preferredMode = playerHasThreat && (!Number.isFinite(aiNearest) || playerNearest + 22 < aiNearest) ? "bochaco" : "aproximacao";
    const modes = preferredMode === "bochaco" ? ["bochaco", "aproximacao"] : ["aproximacao", "bochaco"];
    const powers = [0.34, 0.45, 0.56, 0.67, 0.78, 0.89, 0.98];
    const candidates = [];

    modes.forEach((mode) => {
      if (mode === "bochaco" && !nearestPlayerBall) return;
      const baseTarget = mode === "bochaco" ? nearestPlayerBall : world.jack;
      const offsets = mode === "bochaco"
        ? [{ x: 0, y: 0 }, { x: 0, y: -13 }, { x: 0, y: 13 }]
        : [{ x: 0, y: -28 }, { x: 0, y: 0 }, { x: 0, y: 28 }, { x: geometry.direction * 22, y: 0 }];
      offsets.forEach((offset) => {
        const target = {
          x: clamp(baseTarget.x + offset.x, FIELD.left + BALL_RADIUS, FIELD.right - BALL_RADIUS),
          y: clamp(baseTarget.y + offset.y, FIELD.top + BALL_RADIUS, FIELD.bottom - BALL_RADIUS),
        };
        const launchY = availableLaunchY(world, target.y);
        const aimDirection = normalize(target.x - geometry.launchX, target.y - launchY);
        const safeDirection = aimDirection.x * geometry.direction < 0.1
          ? normalize(geometry.direction * 0.12, aimDirection.y)
          : aimDirection;
        const targetDistance = distance({ x: geometry.launchX, y: launchY }, target);
        const idealPower = clamp(targetDistance / (mode === "bochaco" ? 690 : 820), 0.3, 0.96);
        powers.forEach((powerMultiplier) => {
          const power = clamp(idealPower * (0.72 + powerMultiplier * 0.42), 0.22, 1);
          const simulation = simulateShot(world, {
            team: "ai",
            launchX: geometry.launchX,
            launchY,
            direction: safeDirection,
            power,
          });
          const simulatedAi = getNearestDistance(simulation.world, "ai");
          const simulatedPlayer = getNearestDistance(simulation.world, "player");
          const ownImprovement = Number.isFinite(aiNearest) && Number.isFinite(simulatedAi) ? aiNearest - simulatedAi : 0;
          const opponentDisplacement = Number.isFinite(playerNearest) && Number.isFinite(simulatedPlayer) ? simulatedPlayer - playerNearest : 0;
          let value;
          if (mode === "bochaco") {
            value = opponentDisplacement * 1.55 - (Number.isFinite(simulatedAi) ? simulatedAi * 0.32 : 0);
          } else {
            value = -(Number.isFinite(simulatedAi) ? simulatedAi : 1400) * 1.25 + ownImprovement * 0.45;
          }
          if (Number.isFinite(simulatedAi) && Number.isFinite(simulatedPlayer) && simulatedAi < simulatedPlayer) value += 140;
          if (mode === preferredMode) value += 18;
          candidates.push({ mode, launchY, direction: safeDirection, power, value, simulation });
        });
      });
    });

    const best = candidates.sort((left, right) => right.value - left.value)[0];
    if (!best) {
      const target = world.jack;
      const launchY = availableLaunchY(world, target.y);
      return {
        mode: "aproximacao",
        launchY,
        direction: normalize(target.x - geometry.launchX, target.y - launchY),
        power: 0.58,
      };
    }

    const error = 0.025 + (1 - AI_DIFFICULTY) * 0.18;
    const rotatedDirection = rotate(best.direction, (Math.random() - 0.5) * error);
    const noisyDirection = normalize(rotatedDirection.x, rotatedDirection.y);
    const direction = noisyDirection.x * geometry.direction < 0.08
      ? normalize(geometry.direction * 0.12, noisyDirection.y)
      : noisyDirection;
    setAiMode(best.mode);
    return {
      mode: best.mode,
      launchY: clamp(best.launchY + (Math.random() - 0.5) * error * 80, FIELD.top + BALL_RADIUS, FIELD.bottom - BALL_RADIUS),
      direction,
      power: clamp(best.power * (1 + (Math.random() - 0.5) * error * 0.8), 0.2, 1),
    };
  }

  function fireShot(team, preferredY, direction, power, mode = "manual") {
    const world = worldRef.current;
    if (!world || !world.jack.placed || phaseRef.current !== "balls" || animatingRef.current || resultRef.current || resolvingRef.current) return false;
    const ball = world.balls.find((item) => item.team === team && !item.played);
    if (!ball) return false;
    const geometry = getHeadGeometry(world.headSide);
    const launchY = availableLaunchY(world, preferredY);
    const safeDirection = normalize(direction.x * geometry.direction < 0.08 ? geometry.direction * 0.12 : direction.x, direction.y);
    const isBochada = mode === "bochaco" || mode === "bochada";
    const powerMultiplier = isBochada ? 1.25 : 1;
    const safePower = clamp(power * powerMultiplier, 0.12, 1.25);
    ball.x = geometry.launchX;
    ball.y = launchY;
    ball.vx = safeDirection.x * MAX_SPEED * safePower;
    ball.vy = safeDirection.y * MAX_SPEED * safePower;
    sfx.bochaLaunch(Math.min(1, safePower), isBochada ? "bochada" : "ponto");

    // Poeira e atrito na linha de lançamento da cabeceira
    if (!world.particles) world.particles = [];
    for (let i = 0; i < 5; i += 1) {
      const ang = (Math.PI / 2) * (Math.random() - 0.5) + (geometry.direction > 0 ? 0 : Math.PI);
      const spd = 20 + Math.random() * 50;
      world.particles.push({
        x: ball.x,
        y: ball.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 1 + Math.random() * 2,
        color: "rgba(220, 145, 95, 0.7)",
        life: 0.6 + Math.random() * 0.3,
      });
    }

    ball.played = true;
    ball.active = true;
    world.lastShotId = ball.id;
    world.lastShotMode = mode;
    shotTeamRef.current = team;
    if (team === "player") {
      playerLeftRef.current -= 1;
      setPlayerLeft(playerLeftRef.current);
      setMessage(isBochada ? "Bochada desferida com força total!" : "Sua bocha está rolando com peso medido para arrimo.");
    } else {
      aiLeftRef.current -= 1;
      setAiLeft(aiLeftRef.current);
      setMessage("A IA realizou seu lançamento.");
    }
    aimRef.current = null;
    setPowerPct(0);
    setAiThinking(false);
    setPhaseValue("balls");
    setMiniFromWorld(world);
    startPhysics();
    drawRef.current?.();
    return true;
  }

  function resolveCurrentHand() {
    const world = worldRef.current;
    if (!world || handResolvingRef.current || resolvingRef.current) return;
    handResolvingRef.current = true;
    const hand = scoreHand(world);
    const finalScore = {
      player: playerScoreRef.current + hand.player,
      ai: aiScoreRef.current + hand.ai,
    };
    playerScoreRef.current = finalScore.player;
    aiScoreRef.current = finalScore.ai;
    const history = [...handHistoryRef.current, hand];
    handHistoryRef.current = history;
    setHandHistory(history);
    setPlayerScore(finalScore.player);
    setAiScore(finalScore.ai);
    setNearest({ player: hand.playerNearest, ai: hand.aiNearest });
    setHandResult({ ...hand, handNumber: handNumberRef.current, total: finalScore });
    setPhaseValue("hand-result");
    setTurnValue(null);
    setMovingValue(false);
    setMessage(hand.winner ? `${hand.winner === "player" ? "Você" : "A IA"} leva ${hand.points} ponto${hand.points === 1 ? "" : "s"} nesta mão.` : "Mão empatada: nenhum ponto entra no placar.");
    setMiniFromWorld(world);

    if (finalScore.player >= HAND_TARGET || finalScore.ai >= HAND_TARGET) {
      const outcome = finalScore.player === finalScore.ai ? "draw" : finalScore.player > finalScore.ai ? "win" : "lose";
      finishMatch(outcome, finalScore, hand, history);
      return;
    }

    if (handTimerRef.current) window.clearTimeout(handTimerRef.current);
    handTimerRef.current = window.setTimeout(() => {
      handTimerRef.current = null;
      beginHand(handNumberRef.current + 1);
    }, 1800);
  }

  function handleShotEnd(shooter) {
    const world = worldRef.current;
    if (!world || phaseRef.current !== "balls" || resolvingRef.current) return;
    const currentNearest = {
      player: getNearestDistance(world, "player"),
      ai: getNearestDistance(world, "ai"),
    };
    setNearest(currentNearest);
    setMiniFromWorld(world);
    const next = getNextTurn(world, shooter);
    if (!next) {
      resolveCurrentHand();
      return;
    }
    setTurnValue(next);
    setAiThinking(false);
    setMessage(next === "player" ? "Você está mais distante do bolim e joga agora." : "A IA está mais distante do bolim e prepara a próxima.");
    drawRef.current?.();
  }

  function beginHand(nextHandNumber) {
    if (resultRef.current || !matchRef.current) return;
    if (handTimerRef.current) {
      window.clearTimeout(handTimerRef.current);
      handTimerRef.current = null;
    }
    cancelScheduledPhysics();
    const nextHeadSide = nextHandNumber % 2 === 1 ? "left" : "right";
    const previousHand = handHistoryRef.current.at(-1);
    const openingTeam = previousHand?.winner || worldRef.current?.openingTeam || "player";
    const world = createWorld(nextHandNumber, nextHeadSide, openingTeam);
    worldRef.current = world;
    handNumberRef.current = nextHandNumber;
    headSideRef.current = nextHeadSide;
    turnRef.current = openingTeam;
    playerLeftRef.current = 4;
    aiLeftRef.current = 4;
    phaseRef.current = "jack";
    handResolvingRef.current = false;
    shotTeamRef.current = null;
    aimRef.current = null;
    jackAimRef.current = null;
    setHandNumber(nextHandNumber);
    setHeadSide(nextHeadSide);
    setTurn(openingTeam);
    setPlayerLeft(4);
    setAiLeft(4);
    setNearest({ player: Infinity, ai: Infinity });
    setHandResult(null);
    setAiMode(null);
    setPowerPct(0);
    setMovingValue(false);
    setPhase("jack");
    setAiThinking(openingTeam === "ai");
    setMessage(openingTeam === "player" ? `Mão ${nextHandNumber}: arraste o bolim na cabeceira ${getHeadGeometry(nextHeadSide).label}.` : `Mão ${nextHandNumber}: a IA marca a cabeceira ${getHeadGeometry(nextHeadSide).label}.`);
    setMiniFromWorld(world);
  }

  function finishMatch(outcome, finalScore, lastHand, history) {
    if (resolvingRef.current || settledRef.current || !matchRef.current) return;
    resolvingRef.current = true;
    settledRef.current = true;
    const cfg = configRef.current || {};
    const wager = betRef.current;
    const rake = (cfg.rake_percent || 0) / 100;
    let payout = 0;
    let status = "lost";
    let houseCut = 0;
    if (outcome === "win") {
      houseCut = 2 * wager * rake;
      payout = 2 * wager - houseCut;
      status = "won";
    } else if (outcome === "draw") {
      payout = wager;
      status = "draw";
    }
    if (status === "won") sfx.win();
    else if (status === "draw") sfx.draw();
    else sfx.lose();

    (async () => {
      try {
        const newBalance = await settleMatch(matchRef.current, status, payout, houseCut);
        const finalResult = {
          outcome,
          payout,
          houseCut,
          bet: wager,
          score: finalScore,
          lastHand,
          history,
        };
        resultRef.current = finalResult;
        setBalance(newBalance);
        refreshBalance?.();
        setResult(finalResult);
        setPhaseValue("match-result");
        setMovingValue(false);
        setAiThinking(false);
      } catch (cause) {
        resolvingRef.current = false;
        settledRef.current = false;
        setError(cause.message || "Não foi possível liquidar a partida.");
      }
    })();
  }

  useEffect(() => {
    if (!match || result || phase !== "jack" || turn !== "ai" || isHumanOpponent(opponent)) return undefined;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    setAiThinking(true);
    setMessage("IA posiciona o bolim em uma zona válida...");
    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (resultRef.current || phaseRef.current !== "jack" || turnRef.current !== "ai") return;
      const world = worldRef.current;
      if (world) placeJackAt(chooseAiJack(world), "ai");
    }, 820);
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [match, result, phase, turn, handNumber, opponent]);

  useEffect(() => {
    if (!match || result || phase !== "balls" || turn !== "ai" || moving || isHumanOpponent(opponent)) return undefined;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    setAiThinking(true);
    setMessage("Vez da IA...");
    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (resultRef.current || phaseRef.current !== "balls" || turnRef.current !== "ai" || movingRef.current) return;
      const world = worldRef.current;
      if (!world) return;
      const shot = chooseAiShot(world);
      fireShot("ai", shot.launchY, shot.direction, shot.power, shot.mode);
    }, 780);
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [match, result, phase, turn, moving, handNumber, playerLeft, aiLeft, opponent]);

  useEffect(() => () => {
    const activeMatch = matchRef.current;
    mountedRef.current = false;
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    if (handTimerRef.current) window.clearTimeout(handTimerRef.current);
    cancelScheduledPhysics();
    if (activeMatch && !resultRef.current && !resolvingRef.current) {
      void abandonMatch(activeMatch, "Você saiu da partida.").catch(() => {});
    }
  }, []);

  const toCanvasPoint = (event, shouldClamp = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const point = tablePoint(rect, event.clientX, event.clientY, COURT_W, COURT_H);
    if (!shouldClamp) return point;
    return { x: clamp(point.x, 0, COURT_W), y: clamp(point.y, 0, COURT_H) };
  };

  const releasePointer = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const updateJackAim = (point) => {
    const current = jackAimRef.current;
    const world = worldRef.current;
    if (!current || !world) return;
    const geometry = getHeadGeometry(world.headSide);
    const target = {
      x: clamp(point.x, geometry.validMinX, geometry.validMaxX),
      y: clamp(point.y, geometry.validMinY, geometry.validMaxY),
    };
    jackAimRef.current = { ...current, point, target };
    drawRef.current?.();
  };

  const updateAim = (point) => {
    const current = aimRef.current;
    const world = worldRef.current;
    if (!current || !world) return;
    const geometry = getHeadGeometry(world.headSide);
    const rawX = current.anchor.x - point.x;
    const rawY = current.anchor.y - point.y;
    const inwardX = rawX * geometry.direction >= 12 ? rawX : geometry.direction * 12;
    const dir = normalize(inwardX, rawY);
    const power = clamp(Math.hypot(rawX, rawY) / PULL_MAX, 0, 1);
    const isBochada = shotTypeRef.current === "bochada";
    const effectivePower = isBochada ? Math.min(1.25, power * 1.25) : power;
    const prediction = simulateShot(world, {
      team: "player",
      launchX: geometry.launchX,
      launchY: current.anchor.y,
      direction: dir,
      power: Math.max(0.12, effectivePower),
    });
    aimRef.current = { ...current, point, dir, power, effectivePower, prediction, shotType: shotTypeRef.current };
    setPowerPct(Math.round(power * 100));
    drawRef.current?.();
  };

  const onPointerDown = (event) => {
    if (aimRef.current || jackAimRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!match || result || moving || resolvingRef.current || !canControlTurn(turnRef.current, opponentRef.current)) return;
    const point = toCanvasPoint(event, false);
    const world = worldRef.current;
    if (!world) return;
    const geometry = getHeadGeometry(world.headSide);

    if (phaseRef.current === "jack" && !world.jack.placed) {
      const inTargetZone = point.x >= geometry.validMinX && point.x <= geometry.validMaxX && point.y >= geometry.validMinY && point.y <= geometry.validMaxY;
      const atLaunchLine = Math.abs(point.x - geometry.lineX) <= 72 && point.y >= FIELD.top - 32 && point.y <= FIELD.bottom + 32;
      if (!inTargetZone && !atLaunchLine) return;
      jackAimRef.current = {
        pointerId: event.pointerId,
        anchor: { x: geometry.lineX, y: clamp(point.y, geometry.validMinY, geometry.validMaxY) },
        point,
        target: inTargetZone ? point : { x: world.jack.x, y: world.jack.y },
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drawRef.current?.();
      return;
    }

    if (phaseRef.current !== "balls") return;
    if (point.x < geometry.lineX - 72 || point.x > geometry.lineX + 72 || point.y < FIELD.top - 34 || point.y > FIELD.bottom + 34) return;
    const anchor = {
      x: geometry.launchX,
      y: availableLaunchY(world, clamp(point.y, FIELD.top + BALL_RADIUS, FIELD.bottom - BALL_RADIUS)),
    };
    aimRef.current = {
      pointerId: event.pointerId,
      anchor,
      point,
      dir: { x: geometry.direction, y: 0 },
      power: 0,
      prediction: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPowerPct(0);
    drawRef.current?.();
  };

  const onPointerMove = (event) => {
    if (jackAimRef.current?.pointerId === event.pointerId) {
      updateJackAim(toCanvasPoint(event, false));
      return;
    }
    if (aimRef.current?.pointerId === event.pointerId && phaseRef.current === "balls" && !movingRef.current) updateAim(toCanvasPoint(event, false));
  };

  const onPointerUp = (event) => {
    if (jackAimRef.current?.pointerId === event.pointerId) {
      const current = jackAimRef.current;
      jackAimRef.current = null;
      releasePointer(event);
      if (!resultRef.current && phaseRef.current === "jack" && current.target) placeJackAt(current.target, turnRef.current);
      drawRef.current?.();
      return;
    }
    if (aimRef.current?.pointerId !== event.pointerId) return;
    const current = aimRef.current;
    aimRef.current = null;
    releasePointer(event);
    setPowerPct(0);
    if (current.power < 0.08 || resultRef.current || movingRef.current || phaseRef.current !== "balls" || !canControlTurn(turnRef.current, opponentRef.current)) {
      drawRef.current?.();
      return;
    }
    fireShot(turnRef.current, current.anchor.y, current.dir, current.power, shotTypeRef.current);
  };

  const onPointerCancel = (event) => {
    if (jackAimRef.current?.pointerId === event.pointerId) {
      jackAimRef.current = null;
      releasePointer(event);
      drawRef.current?.();
      return;
    }
    if (aimRef.current?.pointerId !== event.pointerId) return;
    aimRef.current = null;
    setPowerPct(0);
    releasePointer(event);
    drawRef.current?.();
  };

  const startMatch = async (nextOpponent = opponent) => {
    setError("");
    const wager = Number(bet);
    const min = config?.min_bet ?? 10;
    const max = config?.max_bet ?? 1000;
    if (!Number.isFinite(wager) || wager < min) return setError(`Aposta mínima: ${min}`);
    if (wager > max) return setError(`Aposta máxima: ${max}`);
    if (Number(balance ?? 0) < wager) return setError("Saldo insuficiente");
    if (opponentMode === "online" && !isHumanOpponent(nextOpponent)) {
      setSearching(true);
      return;
    }
    setBusy(true);
    try {
      setOpponent(nextOpponent);
      opponentRef.current = nextOpponent;
      const newMatch = await placeBet(wager, "bocha");
      if (!mountedRef.current) {
        void abandonMatch(newMatch, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      const world = createWorld(1, "left", "player");
      matchRef.current = newMatch;
      worldRef.current = world;
      resultRef.current = null;
      configRef.current = config;
      betRef.current = wager;
      settledRef.current = false;
      resolvingRef.current = false;
      handResolvingRef.current = false;
      playerScoreRef.current = 0;
      aiScoreRef.current = 0;
      handHistoryRef.current = [];
      handNumberRef.current = 1;
      headSideRef.current = "left";
      turnRef.current = "player";
      playerLeftRef.current = 4;
      aiLeftRef.current = 4;
      phaseRef.current = "jack";
      shotTeamRef.current = null;
      aimRef.current = null;
      jackAimRef.current = null;
      setMatch(newMatch);
      setResult(null);
      setPhase("jack");
      setHandNumber(1);
      setHeadSide("left");
      setTurn("player");
      setPlayerLeft(4);
      setAiLeft(4);
      setPlayerScore(0);
      setAiScore(0);
      setNearest({ player: Infinity, ai: Infinity });
      setHandHistory([]);
      setHandResult(null);
      setAiThinking(false);
      setAiMode(null);
      setMovingValue(false);
      setPowerPct(0);
      setMessage("Toque na zona marcada para posicionar o bolim, ou arraste-o até o ponto desejado.");
      setMiniFromWorld(world);
      setBalance(await getBalance());
      refreshBalance?.();
    } catch (cause) {
      setError(cause.message || "Erro ao iniciar a partida.");
    } finally {
      setBusy(false);
    }
  };

  const endMatch = () => {
    const activeMatch = matchRef.current;
    if (!activeMatch || resultRef.current || resolvingRef.current || settledRef.current) {
      reset();
      return;
    }
    if (!window.confirm("Encerrar a partida agora conta como derrota e a aposta será perdida. Deseja continuar?")) return;
    resolvingRef.current = true;
    settledRef.current = true;
    sfx.end();
    void abandonMatch(activeMatch, "Você encerrou a partida.")
      .catch(() => {})
      .finally(() => {
        reset();
      });
  };

  const reset = () => {
    const activeMatch = matchRef.current;
    if (activeMatch && !resultRef.current && !resolvingRef.current) {
      void abandonMatch(activeMatch, "Você reiniciou a partida.").catch(() => {});
    }
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    if (handTimerRef.current) window.clearTimeout(handTimerRef.current);
    aiTimerRef.current = null;
    handTimerRef.current = null;
    cancelScheduledPhysics();
    matchRef.current = null;
    worldRef.current = null;
    resultRef.current = null;
    aimRef.current = null;
    jackAimRef.current = null;
    settledRef.current = false;
    resolvingRef.current = false;
    handResolvingRef.current = false;
    setMatch(null);
    setResult(null);
    setPhase("bet");
    phaseRef.current = "bet";
    setError("");
    setHandNumber(1);
    setHeadSide("left");
    setTurn("player");
    setPlayerLeft(4);
    setAiLeft(4);
    setPlayerScore(0);
    setAiScore(0);
    setNearest({ player: Infinity, ai: Infinity });
    setHandResult(null);
    setHandHistory([]);
    setMiniSnapshot(null);
    setAiThinking(false);
    setAiMode(null);
    setMovingValue(false);
    setPowerPct(0);
    setMessage("");
    (async () => {
      try {
        setBalance(await getBalance());
      } catch {
        // The bet screen can still render while the local wallet is unavailable.
      }
    })();
  };

  if (!authReady || loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>;
  }
  if (!user) return <LoginGate user={user} title="Entre para jogar Bocha" />;

  if (!match) {
    const rake = (config?.rake_percent || 0) / 100;
    const projectedPrize = 2 * Number(bet || 0) * (1 - rake);
    return (
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar ao lobby
        </Link>
        <div className="card-glow rounded-3xl border border-orange-300/15 bg-gradient-to-br from-[#321812] via-[#17100d] to-[#0a0f0d] p-5 sm:p-8">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400/30 to-red-900/20 text-3xl ring-1 ring-orange-200/20 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-1 rounded-xl bg-black/25" />
            <CircleDot className="relative h-9 w-9 text-orange-200" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200/60">Jogo de cancha</div>
          <h1 className="mt-1 font-display text-2xl font-bold">Bocha gaúcha</h1>
          <p className="mt-1 text-sm text-white/55">Partida em mãos até 7 pontos. Bot ArenaBet ou adversário online.</p>

          <div className="mt-6">
            <OpponentSelect
              value={opponentMode}
              onChange={(mode) => {
                setOpponentMode(mode);
                setOpponent(BOT_OPPONENT);
              }}
            />
          </div>

          <div className="mt-6 space-y-2 rounded-xl border border-orange-200/10 bg-white/5 p-4 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Seu saldo</span><span className="font-medium">{formatMoney(balance)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Formato</span><span className="text-amber-200">Mãos até 7</span></div>
            <div className="flex justify-between"><span className="text-white/50">Comissão da casa</span><span className="text-emerald-300">{config?.rake_percent}%</span></div>
            <div className="flex justify-between"><span className="text-white/50">Retorno se vencer</span><span className="text-amber-300">{formatMoney(projectedPrize)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Empate</span><span className="text-white/70">aposta devolvida</span></div>
          </div>

          <div className="mt-4 rounded-xl border border-orange-200/10 bg-orange-300/5 p-3 text-xs leading-relaxed text-orange-100/65">
            <span className="font-semibold text-orange-100/90">Regra rápida:</span> o bolim alterna de cabeceira a cada mão. Após cada parada, joga a equipe mais distante; no fim, cada bola vencedora mais perto vale 1 ponto.
          </div>
          <label className="mb-2 mt-6 block text-sm text-white/60" htmlFor="bocha-bet">Valor da aposta</label>
          <input
            id="bocha-bet"
            type="number"
            value={bet}
            min={config?.min_bet}
            max={config?.max_bet}
            onChange={(event) => setBet(Number(event.target.value))}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-orange-300/50"
          />
          <div className="mt-2 flex gap-2">
            {[50, 100, 250, 500].map((value) => (
              <button
                key={value}
                onClick={() => setBet(value)}
                className={`flex-1 rounded-lg border py-2 text-sm transition ${bet === value ? "border-orange-300/50 bg-orange-400/15 text-orange-100 shadow-sm" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}
              >
                {value}
              </button>
            ))}
          </div>
          {error && <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          <button
            onClick={() => startMatch(opponentMode === "bot" ? BOT_OPPONENT : opponent)}
            disabled={busy || Number(balance ?? 0) < Number(bet || 0)}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] font-semibold text-[#14110A] transition hover:bg-[#E0C35A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {busy ? "Preparando a cancha..." : opponentMode === "online" ? `Procurar adversário · R$ ${formatMoney(bet)}` : `Armar partida · R$ ${formatMoney(bet)}`}
          </button>
        </div>
        {searching && user && (
          <MatchmakingPanel
            game="bocha"
            bet={bet}
            user={user}
            onMatched={(matched) => {
              setSearching(false);
              startMatch(matched);
            }}
            onCancel={() => setSearching(false)}
          />
        )}
      </div>
    );
  }

  const currentLeader = getLiveLeader(nearest);
  const playedCount = 8 - playerLeft - aiLeft;
  const statusText = result
    ? "Partida encerrada"
    : phase === "hand-result"
      ? "Mão encerrada"
      : moving
        ? `Bolas rolando${worldRef.current?.lastShotMode === "bochaco" ? " · bochaço" : ""}`
        : aiThinking
          ? phase === "jack" ? "IA posiciona o bolim" : "Vez da IA"
          : phase === "jack"
            ? "Posicione o bolim"
            : turn === "player"
              ? "Sua vez · puxe da linha"
              : "Vez da IA";
  const headLabel = getHeadGeometry(headSide).label;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_304px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Lobby
            </Link>
            {!result && (
              <button
                onClick={endMatch}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-500/20"
              >
                <Flag className="h-3.5 w-3.5" /> Encerrar
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {phase === "balls" && !result && (
              <div className="flex items-center rounded-full border border-orange-200/20 bg-stone-900/80 p-1 shadow-inner backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => {
                    setShotType("ponto");
                    sfx.click();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    shotType === "ponto"
                      ? "bg-amber-400 text-stone-950 shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                  title="Arrimada / Ponto: aproximação suave e controlada para colar no bolim"
                >
                  <Target className="h-3.5 w-3.5" /> Arrimo (Ponto)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShotType("bochada");
                    sfx.click();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    shotType === "bochada"
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                  title="Bochada / Tiro: arremesso forte e rasteiro para deslocar a bocha adversária"
                >
                  <Flame className="h-3.5 w-3.5" /> Bochada (Tiro)
                </button>
              </div>
            )}

            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${turn === "player" && !moving && !aiThinking ? "border-orange-300/30 bg-orange-400/10 text-orange-100" : "border-white/10 bg-white/5 text-white/60"}`} role="status" aria-live="polite">
              {aiThinking ? <BrainCircuit className="h-4 w-4 animate-pulse" /> : <CircleDot className="h-4 w-4" />}
              {statusText}
            </div>
          </div>
        </div>

        <div className="glass mb-3 rounded-2xl border border-orange-200/10 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
            <span>Placar até 7 · mão {handNumber}</span>
            <span className="text-amber-200/75">Cabeceira {headLabel}</span>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 sm:px-4">
              <div className="flex items-center justify-between gap-2 text-xs text-red-200/80"><span>Você · vermelhas</span><span>{playerLeft} por lançar</span></div>
              <div className="mt-1 flex items-end gap-1"><strong className="text-3xl tabular-nums text-red-100">{playerScore}</strong><span className="pb-1 text-xs text-red-200/45">/ 7</span></div>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{playedCount}/8<br /><span className="text-white/20">lançadas</span></div>
            <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-right sm:px-4">
              <div className="flex items-center justify-between gap-2 text-xs text-blue-200/80"><span>{aiLeft} por lançar</span><span>IA · azuis</span></div>
              <div className="mt-1 flex items-end justify-end gap-1"><strong className="text-3xl tabular-nums text-blue-100">{aiScore}</strong><span className="pb-1 text-xs text-blue-200/45">/ 7</span></div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs">
            <span className="text-white/45">Mais perto agora: <strong className="font-medium text-amber-100">{currentLeader}</strong></span>
            <span className="text-white/45">Bolas: <strong className="font-medium text-white/75">{playerLeft} + {aiLeft}</strong></span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#8e5c31]/50 bg-gradient-to-br from-[#5b321c] via-[#261812] to-[#120d0b] p-2 shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] sm:p-3">
          <canvas
            ref={canvasRef}
            width={COURT_W}
            height={COURT_H}
            aria-label="Cancha de bocha. Toque na zona válida para posicionar o bolim e depois puxe da linha para lançar uma bola."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            className="precision-canvas block h-auto w-full touch-none select-none rounded-xl shadow-inner ring-1 ring-white/10"
            style={{ "--table-width": COURT_W, "--table-height": COURT_H }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
          <span>{message || (phase === "jack" ? "Arraste da cabeceira para marcar o bolim." : moving ? "A física está resolvendo paredes e colisões..." : "Arraste para trás da linha e solte para lançar.")}</span>
          <span className="tabular-nums font-medium text-amber-200/80">{shotType === "bochada" ? "💥 Modo Bochada · Tiro potente ativo" : "🎯 Modo Arrimo · Aproximação suave"}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/30 ring-1 ring-white/10">
          <div className="h-full bg-gradient-to-r from-orange-300 via-red-400 to-blue-400 transition-[width]" style={{ width: `${(playedCount / 8) * 100}%` }} />
        </div>
        {powerPct > 0 && (
          <div className="mt-4 rounded-xl border border-orange-300/15 bg-orange-400/5 p-3">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-orange-200" /> Força do lançamento</span>
              <span className="font-semibold tabular-nums text-orange-200">{powerPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-gradient-to-r from-orange-300 via-amber-300 to-red-400 transition-[width]" style={{ width: `${powerPct}%` }} />
            </div>
          </div>
        )}
        {handResult && !result && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/65">Mão {handResult.handNumber} encerrada</div>
                <div className="mt-1 text-lg font-semibold text-amber-50">{handResult.winner ? `${handResult.winner === "player" ? "Você" : "A IA"} marcou ${handResult.points} ponto${handResult.points === 1 ? "" : "s"}.` : "Mão empatada: nenhum ponto."}</div>
                <div className="mt-1 text-xs text-white/50">Placar acumulado {handResult.total.player} × {handResult.total.ai}. A próxima cabeceira será {headSide === "left" ? "direita" : "esquerda"}.</div>
              </div>
              <button
                onClick={() => beginHand(handNumber + 1)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-[#2d1a0d] transition hover:bg-amber-200"
              >
                <Target className="h-4 w-4" /> Próxima mão
              </button>
            </div>
          </div>
        )}
        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      </div>

      <aside className="space-y-4">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-white/40">Leitura da mão</div>
            <div className="inline-flex items-center gap-1.5 text-xs text-amber-200/70"><Coins className="h-3.5 w-3.5" /> {formatMoney(match.bet_amount)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl border p-3 ${TEAM_STYLE.player.panel}`}>
              <div className={`text-xs ${TEAM_STYLE.player.text}`}>Você · vermelhas</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-red-200">{playerScore}<span className="text-base text-red-200/45"> / 7</span></div>
              <div className="mt-1 text-[11px] text-white/40">{playerLeft} por lançar</div>
              <div className="mt-2 text-[11px] text-white/40">Mais perto: <span className="text-white/70">{formatDistance(nearest.player)}</span></div>
            </div>
            <div className={`rounded-xl border p-3 ${TEAM_STYLE.ai.panel}`}>
              <div className={`text-xs ${TEAM_STYLE.ai.text}`}>IA · azuis</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-blue-200">{aiScore}<span className="text-base text-blue-200/45"> / 7</span></div>
              <div className="mt-1 text-[11px] text-white/40">{aiLeft} por lançar</div>
              <div className="mt-2 text-[11px] text-white/40">Mais perto: <span className="text-white/70">{formatDistance(nearest.ai)}</span></div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="text-white/45">Quem joga</span>
            <span className="font-medium text-amber-100">{phase === "jack" ? `${sideLabel(turn, opponent)} marca o bolim` : turn === "player" || turn === "ai" ? sideLabel(turn, opponent) : "Mão resolvida"}</span>
          </div>
          <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${aiThinking ? "border-blue-300/25 bg-blue-400/10 text-blue-100" : "border-white/10 bg-black/10 text-white/60"}`}>
            {aiThinking ? <BrainCircuit className="h-4 w-4 animate-pulse" /> : <Target className="h-4 w-4" />}
            {aiThinking ? "Vez da IA..." : "A equipe mais distante joga."}
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 font-medium text-white/85"><Map className="h-4 w-4 text-orange-200" /> Minimapa / foco</div>
          <MiniMap snapshot={miniSnapshot} />
          <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-white/50">
            <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/70" />
            <span>A cancha inteira permanece enquadrada; a régua no canvas e o traço até o bolim ampliam a leitura da bola lançada.</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 text-sm text-white/55">
          <div className="mb-3 flex items-center gap-2 font-medium text-white/85"><CircleDot className="h-4 w-4 text-amber-200" /> Tradição e Regras da Bocha</div>
          <ul className="list-inside list-disc space-y-2">
            <li><strong className="text-amber-100">Posicione o Bolim:</strong> Toque ou arraste na zona válida da cabeceira oposta para fixar o alvo da mão.</li>
            <li><strong className="text-amber-100">Arrimo (Ponto):</strong> Lançamento suave com controle fino de peso para colar a bocha ao lado do bolim.</li>
            <li><strong className="text-amber-100">Bochada (Tiro):</strong> Arremesso de impacto máximo para atingir e expulsar a bocha adversária do raio do ponto.</li>
            <li><strong className="text-amber-100">Dinâmica da Cancha:</strong> São 4 bochas por equipe. Joga sempre quem estiver mais distante do bolim no momento.</li>
            <li><strong className="text-amber-100">Medição com Trena:</strong> A trena afere a distância em centímetros. No fim da mão, cada bocha sua mais perto que a melhor adversária vale 1 ponto (partida até 7).</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-300/10 bg-amber-400/5 p-4 text-xs text-amber-100/60">
          <div className="font-medium text-amber-100/85">Aposta protegida</div>
          <p className="mt-1">A aposta já está debitada. Vitória paga o pote com a comissão da casa; empate devolve o valor integral.</p>
        </div>
      </aside>

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Resultado da partida de bocha">
          <div className="glass card-glow w-full max-w-sm rounded-3xl p-7 text-center sm:p-8">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${result.outcome === "win" ? "bg-orange-400/15 text-orange-200" : result.outcome === "draw" ? "bg-amber-400/15 text-amber-200" : "bg-rose-500/15 text-rose-300"}`}>
              {result.outcome === "win" ? <Trophy className="h-8 w-8" /> : result.outcome === "draw" ? <CircleDot className="h-8 w-8" /> : <Skull className="h-8 w-8" />}
            </div>
            <h2 className="font-display text-2xl font-bold">{result.outcome === "win" ? "Você venceu!" : result.outcome === "draw" ? "Empate na cancha" : "A IA levou a melhor"}</h2>
            <p className="mt-1 text-sm text-white/55">
              {result.outcome === "win"
                ? `Retorno: +R$ ${formatMoney(result.payout - result.bet)}`
                : result.outcome === "draw"
                  ? "Aposta devolvida integralmente"
                  : `Você perdeu R$ ${formatMoney(result.bet)}`}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-left"><div className="text-xs text-red-200/70">Você</div><div className="mt-1 text-2xl font-bold text-red-100">{result.score.player}</div></div>
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-left"><div className="text-xs text-blue-200/70">IA</div><div className="mt-1 text-2xl font-bold text-blue-100">{result.score.ai}</div></div>
            </div>
            <div className="mt-3 flex justify-between rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/45"><span>Aposta {formatMoney(result.bet)}</span><span>Retorno {formatMoney(result.payout)}</span></div>
            <div className="mt-3 text-left text-[11px] text-white/40">
              <div className="mb-1 uppercase tracking-[0.18em]">Mãos disputadas</div>
              <div className="flex flex-wrap gap-1.5">
                {result.history?.map((hand, index) => <span key={`history-${index}`} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">{index + 1}: {hand.player}-{hand.ai}</span>)}
              </div>
            </div>
            <button onClick={reset} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-300 to-red-500 font-semibold text-black hover:from-orange-200 hover:to-red-400">
              <RotateCcw className="h-4 w-4" /> Jogar novamente
            </button>
            <Link to="/" className="mt-3 block text-sm text-white/50 hover:text-white">Voltar ao lobby</Link>
          </div>
        </div>
      )}
    </div>
  );
}
