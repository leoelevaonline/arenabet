import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  CircleDot,
  Coins,
  Crosshair,
  Flag,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Skull,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import LoginGate from "@/components/LoginGate";
import MatchmakingPanel from "@/components/MatchmakingPanel";
import OpponentSelect from "@/components/OpponentSelect";
import { BOT_OPPONENT, canControlTurn, isHumanOpponent, sideLabel } from "@/lib/opponent";
import { abandonMatch, getBalance, getHouseConfig, placeBet, settleMatch } from "@/lib/wallet";
import { drawSurface } from "@/lib/gameSurfaces";
import { sfx } from "@/lib/sound";
import { requestGameFrame as requestFrame, cancelGameFrame as cancelFrame } from "@/lib/gameFrame";

const FIELD_W = 1000;
const FIELD_H = 620;
const FIELD_LEFT = 58;
const FIELD_RIGHT = FIELD_W - FIELD_LEFT;
const FIELD_TOP = 42;
const FIELD_BOTTOM = FIELD_H - FIELD_TOP;
const GOAL_Y = FIELD_H / 2;
const GOAL_H = 190;
const GOAL_TOP = GOAL_Y - GOAL_H / 2;
const GOAL_BOTTOM = GOAL_Y + GOAL_H / 2;
const GOAL_BACK_LEFT = 12;
const GOAL_BACK_RIGHT = FIELD_W - GOAL_BACK_LEFT;
const POST_RADIUS = 11;
const BAR_RADIUS = 5;
const DISK_RADIUS = 24;
const BALL_RADIUS = 14;
const FIXED_STEP = 1 / 120;
const MAX_FRAME_STEPS = 28;
const PHYSICS_SUBSTEPS = 3;
const SOLVER_ITERATIONS = 3;
const FRICTION_PER_60 = 0.978;
const BODY_RESTITUTION = 0.84;
const WALL_RESTITUTION = 0.78;
const POST_RESTITUTION = 0.91;
const STOP_SPEED = 6;
const MAX_PHYSICS_SPEED = 1500;
const MAX_SHOT_SPEED = 1060;
const MAX_PULL = 186;
const MAX_SHOT_TIME = 8;
const PREVIEW_TIME = 1.28;
const SHOTS_PER_SIDE = 6;
const WIN_SCORE = 3;
const AI_DIFFICULTY = 0.76;

const TEAM_COLORS = {
  blue: {
    base: "#2488e8",
    light: "#8bd6ff",
    dark: "#123b76",
    text: "#e2f3ff",
    glow: "rgba(56, 189, 248, 0.75)",
    jersey: "#1f7ae0",
    jerseyDark: "#0d4a9a",
    jerseyLight: "#7ec8ff",
    shorts: "#f4f7fb",
    socks: "#ffffff",
    collar: "#f8fbff",
    stripe: "#ffffff",
    skin: "#e8b892",
    hair: "#2a1c12",
    number: "#0c2d6e",
  },
  red: {
    base: "#e94a55",
    light: "#ff9a9d",
    dark: "#741e36",
    text: "#ffe5e4",
    glow: "rgba(251, 113, 133, 0.68)",
    jersey: "#d42132",
    jerseyDark: "#8a1422",
    jerseyLight: "#ff7a84",
    shorts: "#141414",
    socks: "#1a1a1a",
    collar: "#f5f5f5",
    stripe: "#f7f7f7",
    skin: "#d4a07a",
    hair: "#1a120c",
    number: "#3a0810",
  },
};

const GOAL_BARS = [
  { x1: GOAL_BACK_LEFT, y1: GOAL_TOP, x2: FIELD_LEFT, y2: GOAL_TOP, r: BAR_RADIUS },
  { x1: GOAL_BACK_LEFT, y1: GOAL_BOTTOM, x2: FIELD_LEFT, y2: GOAL_BOTTOM, r: BAR_RADIUS },
  { x1: FIELD_RIGHT, y1: GOAL_TOP, x2: GOAL_BACK_RIGHT, y2: GOAL_TOP, r: BAR_RADIUS },
  { x1: FIELD_RIGHT, y1: GOAL_BOTTOM, x2: GOAL_BACK_RIGHT, y2: GOAL_BOTTOM, r: BAR_RADIUS },
];

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

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function makeBody(id, kind, team, x, y, radius, mass = 1) {
  return {
    id,
    kind,
    team,
    x,
    y,
    r: radius,
    vx: 0,
    vy: 0,
    mass,
    static: false,
  };
}

function makePost(id, x, y) {
  return {
    ...makeBody(id, "post", null, x, y, POST_RADIUS, Infinity),
    static: true,
  };
}

function createKickoff() {
  const blue = [
    [196, 176],
    [164, 264],
    [214, GOAL_Y],
    [164, 356],
    [196, 444],
  ];
  const red = blue.map(([x, y]) => [FIELD_W - x, y]);
  const bodies = [
    ...blue.map(([x, y], index) => makeBody(`blue-${index + 1}`, "disk", "blue", x, y, DISK_RADIUS, 1.08)),
    ...red.map(([x, y], index) => makeBody(`red-${index + 1}`, "disk", "red", x, y, DISK_RADIUS, 1.08)),
    makeBody("ball", "ball", null, FIELD_W / 2, GOAL_Y, BALL_RADIUS, 0.72),
    makePost("post-left-top", FIELD_LEFT, GOAL_TOP),
    makePost("post-left-bottom", FIELD_LEFT, GOAL_BOTTOM),
    makePost("post-right-top", FIELD_RIGHT, GOAL_TOP),
    makePost("post-right-bottom", FIELD_RIGHT, GOAL_BOTTOM),
  ];
  return bodies;
}

function cloneBodies(bodies) {
  return bodies.map((body) => ({ ...body }));
}

function getSpeed(body) {
  return Math.hypot(body.vx, body.vy);
}

function isDynamic(body) {
  return !body.static;
}

function inverseMass(body) {
  return isDynamic(body) && Number.isFinite(body.mass) && body.mass > 0 ? 1 / body.mass : 0;
}

function stopBody(body) {
  if (getSpeed(body) < STOP_SPEED) {
    body.vx = 0;
    body.vy = 0;
  }
}

function deterministicNormal(a, b) {
  let hash = 17;
  const seed = `${a.id}:${b.id}`;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  const angle = ((Math.abs(hash) % 628) / 100) - Math.PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function applyStaticImpulse(body, normal, restitution) {
  const velocityAlongNormal = body.vx * normal.x + body.vy * normal.y;
  if (velocityAlongNormal >= 0) return true;
  const impulse = -(1 + restitution) * velocityAlongNormal;
  body.vx += impulse * normal.x;
  body.vy += impulse * normal.y;
  const tangent = { x: -normal.y, y: normal.x };
  const tangentVelocity = body.vx * tangent.x + body.vy * tangent.y;
  body.vx -= tangentVelocity * 0.08 * tangent.x;
  body.vy -= tangentVelocity * 0.08 * tangent.y;
  return true;
}

function resolveBodyCollision(a, b) {
  if (!isDynamic(a) && !isDynamic(b)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minimumDistance = a.r + b.r;
  const squaredDistance = dx * dx + dy * dy;
  if (squaredDistance > minimumDistance * minimumDistance) return false;

  const actualDistance = Math.sqrt(squaredDistance);
  const normal = actualDistance > 0.00001
    ? { x: dx / actualDistance, y: dy / actualDistance }
    : deterministicNormal(a, b);
  const overlap = Math.max(0, minimumDistance - (actualDistance || 0));
  const inverseA = inverseMass(a);
  const inverseB = inverseMass(b);
  const inverseTotal = inverseA + inverseB;
  if (inverseTotal === 0) return false;

  const correction = overlap / inverseTotal;
  if (inverseA > 0) {
    a.x -= normal.x * correction * inverseA;
    a.y -= normal.y * correction * inverseA;
  }
  if (inverseB > 0) {
    b.x += normal.x * correction * inverseB;
    b.y += normal.y * correction * inverseB;
  }

  const relativeVelocityX = b.vx - a.vx;
  const relativeVelocityY = b.vy - a.vy;
  const velocityAlongNormal = relativeVelocityX * normal.x + relativeVelocityY * normal.y;
  if (velocityAlongNormal >= 0) return true;

  const restitution = a.kind === "post" || b.kind === "post" ? POST_RESTITUTION : BODY_RESTITUTION;
  const impulse = -(1 + restitution) * velocityAlongNormal / inverseTotal;
  if (inverseA > 0) {
    a.vx -= impulse * inverseA * normal.x;
    a.vy -= impulse * inverseA * normal.y;
  }
  if (inverseB > 0) {
    b.vx += impulse * inverseB * normal.x;
    b.vy += impulse * inverseB * normal.y;
  }
  return true;
}

function resolveBarCollision(body, bar) {
  if (!isDynamic(body)) return false;
  const segmentX = bar.x2 - bar.x1;
  const segmentY = bar.y2 - bar.y1;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY || 1;
  const projection = clamp(((body.x - bar.x1) * segmentX + (body.y - bar.y1) * segmentY) / lengthSquared, 0, 1);
  const closest = { x: bar.x1 + segmentX * projection, y: bar.y1 + segmentY * projection };
  const dx = body.x - closest.x;
  const dy = body.y - closest.y;
  const squaredDistance = dx * dx + dy * dy;
  const minimumDistance = body.r + bar.r;
  if (squaredDistance > minimumDistance * minimumDistance) return false;

  const actualDistance = Math.sqrt(squaredDistance);
  const normal = actualDistance > 0.00001
    ? { x: dx / actualDistance, y: dy / actualDistance }
    : { x: 0, y: body.y <= GOAL_Y ? -1 : 1 };
  const overlap = Math.max(0, minimumDistance - (actualDistance || 0));
  body.x += normal.x * overlap;
  body.y += normal.y * overlap;
  applyStaticImpulse(body, normal, POST_RESTITUTION);
  return true;
}

function ballFitsGoalMouth(ball) {
  return ball.y - ball.r >= GOAL_TOP + 1 && ball.y + ball.r <= GOAL_BOTTOM - 1;
}

function bounceOffBounds(body) {
  if (!isDynamic(body)) return false;
  let hit = false;
  const openGoal = body.kind === "ball" && ballFitsGoalMouth(body);

  if (body.y - body.r < FIELD_TOP) {
    body.y = FIELD_TOP + body.r;
    if (body.vy < 0) body.vy = -body.vy * WALL_RESTITUTION;
    hit = true;
  }
  if (body.y + body.r > FIELD_BOTTOM) {
    body.y = FIELD_BOTTOM - body.r;
    if (body.vy > 0) body.vy = -body.vy * WALL_RESTITUTION;
    hit = true;
  }
  if (body.x - body.r < FIELD_LEFT && !openGoal) {
    body.x = FIELD_LEFT + body.r;
    if (body.vx < 0) body.vx = -body.vx * WALL_RESTITUTION;
    hit = true;
  }
  if (body.x + body.r > FIELD_RIGHT && !openGoal) {
    body.x = FIELD_RIGHT - body.r;
    if (body.vx > 0) body.vx = -body.vx * WALL_RESTITUTION;
    hit = true;
  }
  return hit;
}

function detectGoal(ball, previous) {
  if (!ball || !previous) return null;
  const leftLimit = FIELD_LEFT - ball.r;
  const rightLimit = FIELD_RIGHT + ball.r;
  let crossing = null;

  if (previous.x > leftLimit && ball.x <= leftLimit) {
    crossing = "left";
  } else if (previous.x < rightLimit && ball.x >= rightLimit) {
    crossing = "right";
  }
  if (!crossing) return null;

  const line = crossing === "left" ? leftLimit : rightLimit;
  const denominator = ball.x - previous.x;
  const progress = denominator === 0 ? 1 : clamp((line - previous.x) / denominator, 0, 1);
  const yAtLine = previous.y + (ball.y - previous.y) * progress;
  if (yAtLine - ball.r >= GOAL_TOP + 1 && yAtLine + ball.r <= GOAL_BOTTOM - 1) return crossing;
  return null;
}

function limitSpeed(body) {
  const speed = getSpeed(body);
  if (speed > MAX_PHYSICS_SPEED) {
    body.vx = body.vx / speed * MAX_PHYSICS_SPEED;
    body.vy = body.vy / speed * MAX_PHYSICS_SPEED;
  }
}

function stepWorld(bodies, delta) {
  const subDelta = delta / PHYSICS_SUBSTEPS;
  const friction = Math.pow(FRICTION_PER_60, subDelta * 60);
  let impacts = 0;

  for (let substep = 0; substep < PHYSICS_SUBSTEPS; substep += 1) {
    const ball = bodies.find((body) => body.kind === "ball");
    const previousBall = ball ? { x: ball.x, y: ball.y } : null;
    for (const body of bodies) {
      if (!isDynamic(body)) continue;
      body.x += body.vx * subDelta;
      body.y += body.vy * subDelta;
      limitSpeed(body);
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const body of bodies) {
        if (bounceOffBounds(body)) impacts += 1;
        if (!isDynamic(body)) continue;
        for (const bar of GOAL_BARS) {
          if (resolveBarCollision(body, bar)) impacts += 1;
        }
      }
      for (let first = 0; first < bodies.length; first += 1) {
        for (let second = first + 1; second < bodies.length; second += 1) {
          if (resolveBodyCollision(bodies[first], bodies[second])) impacts += 1;
        }
      }
    }

    const goal = detectGoal(ball, previousBall);
    if (goal) {
      for (const body of bodies) {
        if (isDynamic(body)) {
          body.vx = 0;
          body.vy = 0;
        }
      }
      return { goal, impacts };
    }

    for (const body of bodies) {
      if (!isDynamic(body)) continue;
      body.vx *= friction;
      body.vy *= friction;
      stopBody(body);
    }
  }
  return { goal: null, impacts };
}

function bodiesAreStill(bodies) {
  return bodies.filter(isDynamic).every((body) => getSpeed(body) <= STOP_SPEED);
}

function simulateShot(sourceBodies, bodyId, direction, power, duration = PREVIEW_TIME) {
  const bodies = cloneBodies(sourceBodies);
  const shooter = bodies.find((body) => body.id === bodyId);
  const ball = bodies.find((body) => body.kind === "ball");
  if (!shooter || !ball) return null;

  shooter.vx = direction.x * clamp(power, 0, 1) * MAX_SHOT_SPEED;
  shooter.vy = direction.y * clamp(power, 0, 1) * MAX_SHOT_SPEED;
  const path = [{ x: shooter.x, y: shooter.y }];
  let firstImpactIndex = null;
  let firstImpactPosition = null;
  let goal = null;
  const maxSteps = Math.ceil(duration / FIXED_STEP);

  for (let step = 0; step < maxSteps; step += 1) {
    const outcome = stepWorld(bodies, FIXED_STEP);
    if (outcome.impacts > 0 && firstImpactIndex === null) {
      firstImpactIndex = path.length;
      firstImpactPosition = { x: shooter.x, y: shooter.y };
    }
    if (step % 2 === 0) path.push({ x: shooter.x, y: shooter.y });
    if (outcome.goal) {
      goal = outcome.goal;
      break;
    }
    if (step > 24 && bodiesAreStill(bodies)) break;
  }

  return {
    bodies,
    path,
    firstImpactIndex,
    firstImpactPosition,
    goal,
    ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
  };
}

function makePreview(sourceBodies, bodyId, direction, power) {
  const simulation = simulateShot(sourceBodies, bodyId, direction, power, PREVIEW_TIME);
  if (!simulation) return null;
  return {
    ...simulation,
    ghost: simulation.firstImpactPosition || simulation.path[simulation.path.length - 1],
  };
}

function aiModeLabel(mode) {
  if (mode === "goal") return "tentativa de gol";
  if (mode === "assist") return "assistência";
  return "cobertura defensiva";
}

function chooseAiShot(sourceBodies) {
  const ball = sourceBodies.find((body) => body.kind === "ball");
  const disks = sourceBodies.filter((body) => body.team === "red");
  if (!ball || disks.length === 0) return null;

  const goalPoint = { x: FIELD_LEFT - 20, y: GOAL_Y };
  const ownGoalPoint = { x: FIELD_RIGHT + 20, y: GOAL_Y };
  const danger = ball.x > FIELD_RIGHT - 270;
  const angleOffsets = [-0.4, -0.18, 0, 0.18, 0.4];
  const powers = [0.48, 0.64, 0.82];
  const candidates = [];

  for (const disk of disks) {
    const towardBall = normalize(ball.x - disk.x, ball.y - disk.y);
    const behindBall = normalize(ball.x - goalPoint.x, ball.y - goalPoint.y);
    const modes = [
      { mode: "goal", target: { x: ball.x + behindBall.x * 34, y: ball.y + behindBall.y * 34 }, bias: 24 },
      { mode: "assist", target: { x: ball.x + behindBall.x * 26, y: ball.y + behindBall.y * 26 + (ball.y - GOAL_Y) * 0.18 }, bias: 16 },
      { mode: "defense", target: danger
        ? { x: ball.x + (ownGoalPoint.x - ball.x) * 0.15, y: ball.y }
        : { x: ball.x + 18, y: ball.y + (GOAL_Y - ball.y) * 0.3 }, bias: danger ? 29 : 4 },
    ];

    for (const plan of modes) {
      const baseDirection = normalize(plan.target.x - disk.x, plan.target.y - disk.y);
      for (const angle of angleOffsets) {
        const direction = rotate(baseDirection.x || towardBall.x ? baseDirection : towardBall, angle);
        for (const power of powers) {
          const simulation = simulateShot(sourceBodies, disk.id, direction, power, 1.18);
          if (!simulation) continue;
          const progressToGoal = clamp((ball.x - simulation.ball.x) / 310, -1.2, 1.2);
          const distanceToGoal = distance(simulation.ball, goalPoint);
          const startDistanceToGoal = distance(ball, goalPoint);
          const ballTowardGoal = clamp((startDistanceToGoal - distanceToGoal) / 300, -1.2, 1.2);
          const defensiveProgress = clamp((simulation.ball.x - ball.x) / 260, -1.2, 1.2);
          let score = plan.bias + progressToGoal * 52 + ballTowardGoal * 30;
          if (danger) score += defensiveProgress * 42;
          if (simulation.firstImpactIndex !== null) score += 8;
          if (simulation.goal === "left") score += 1500;
          if (simulation.goal === "right") score -= 1900;
          score += (Math.random() - 0.5) * (1 - AI_DIFFICULTY) * 32;
          candidates.push({ score, diskId: disk.id, direction, power, mode: plan.mode, simulation });
        }
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const noiseAngle = (Math.random() - 0.5) * (1 - AI_DIFFICULTY) * 0.2;
  const noisyDirection = rotate(best.direction, noiseAngle);
  return {
    diskId: best.diskId,
    direction: noisyDirection,
    power: clamp(best.power * (1 + (Math.random() - 0.5) * (1 - AI_DIFFICULTY) * 0.16), 0.28, 0.95),
    mode: aiModeLabel(best.mode),
  };
}

function roundedPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawNet(ctx, side) {
  const left = side === "left";
  const x = left ? GOAL_BACK_LEFT : FIELD_RIGHT;
  const width = left ? FIELD_LEFT - GOAL_BACK_LEFT : GOAL_BACK_RIGHT - FIELD_RIGHT;
  const backX = left ? GOAL_BACK_LEFT : GOAL_BACK_RIGHT;
  ctx.save();
  ctx.fillStyle = "rgba(3, 12, 10, 0.92)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 18;
  ctx.fillRect(x, GOAL_TOP, width, GOAL_H);
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.rect(x, GOAL_TOP, width, GOAL_H);
  ctx.clip();
  ctx.strokeStyle = "rgba(189, 231, 211, 0.2)";
  ctx.lineWidth = 1;
  for (let gridX = Math.min(x, backX); gridX <= Math.max(x, backX); gridX += 10) {
    ctx.beginPath();
    ctx.moveTo(gridX, GOAL_TOP);
    ctx.lineTo(gridX, GOAL_BOTTOM);
    ctx.stroke();
  }
  for (let gridY = GOAL_TOP; gridY <= GOAL_BOTTOM; gridY += 10) {
    ctx.beginPath();
    ctx.moveTo(Math.min(x, backX), gridY);
    ctx.lineTo(Math.max(x, backX), gridY);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(110, 231, 183, 0.12)";
  for (let diagonal = -GOAL_H; diagonal < width + GOAL_H; diagonal += 18) {
    ctx.beginPath();
    ctx.moveTo(x + diagonal, GOAL_TOP);
    ctx.lineTo(x + diagonal + GOAL_H, GOAL_BOTTOM);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(238, 252, 245, 0.92)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.moveTo(left ? FIELD_LEFT : FIELD_RIGHT, GOAL_TOP);
  ctx.lineTo(backX, GOAL_TOP);
  ctx.lineTo(backX, GOAL_BOTTOM);
  ctx.lineTo(left ? FIELD_LEFT : FIELD_RIGHT, GOAL_BOTTOM);
  ctx.stroke();
  ctx.restore();
}

function drawPost(ctx, x, y) {
  const gradient = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, POST_RADIUS * 1.4);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.45, "#d6e9df");
  gradient.addColorStop(1, "#6a8a7c");
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, POST_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.strokeStyle = "rgba(13, 39, 29, 0.92)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function paintField(ctx) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);

  const backdrop = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, 30, FIELD_W / 2, FIELD_H / 2, 690);
  backdrop.addColorStop(0, "#17442f");
  backdrop.addColorStop(0.68, "#0a2318");
  backdrop.addColorStop(1, "#030b08");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  drawNet(ctx, "left");
  drawNet(ctx, "right");

  const grass = ctx.createLinearGradient(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT, FIELD_BOTTOM);
  grass.addColorStop(0, "#2aa66b");
  grass.addColorStop(0.48, "#19784e");
  grass.addColorStop(1, "#0b4d34");
  ctx.save();
  roundedPath(ctx, FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP, 24);
  ctx.fillStyle = grass;
  ctx.fill();
  ctx.clip();
  const stripeWidth = (FIELD_RIGHT - FIELD_LEFT) / 12;
  for (let index = 0; index < 12; index += 1) {
    ctx.fillStyle = index % 2 === 0 ? "rgba(223, 255, 236, 0.035)" : "rgba(0, 34, 20, 0.07)";
    ctx.fillRect(FIELD_LEFT + index * stripeWidth, FIELD_TOP, stripeWidth + 1, FIELD_BOTTOM - FIELD_TOP);
  }
  drawSurface(ctx, FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP, "grass");
  for (const goalX of [FIELD_LEFT + 32, FIELD_RIGHT - 32]) {
    const wear = ctx.createRadialGradient(goalX, GOAL_Y, 8, goalX, GOAL_Y, 80);
    wear.addColorStop(0, "rgba(173,149,77,0.24)");
    wear.addColorStop(1, "rgba(173,149,77,0)");
    ctx.fillStyle = wear;
    ctx.fillRect(goalX - 80, GOAL_Y - 80, 160, 160);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(239, 255, 247, 0.78)";
  ctx.fillStyle = "rgba(239, 255, 247, 0.78)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(FIELD_LEFT, FIELD_TOP);
  ctx.lineTo(FIELD_RIGHT, FIELD_TOP);
  ctx.moveTo(FIELD_LEFT, FIELD_BOTTOM);
  ctx.lineTo(FIELD_RIGHT, FIELD_BOTTOM);
  ctx.moveTo(FIELD_LEFT, FIELD_TOP);
  ctx.lineTo(FIELD_LEFT, GOAL_TOP);
  ctx.moveTo(FIELD_LEFT, GOAL_BOTTOM);
  ctx.lineTo(FIELD_LEFT, FIELD_BOTTOM);
  ctx.moveTo(FIELD_RIGHT, FIELD_TOP);
  ctx.lineTo(FIELD_RIGHT, GOAL_TOP);
  ctx.moveTo(FIELD_RIGHT, GOAL_BOTTOM);
  ctx.lineTo(FIELD_RIGHT, FIELD_BOTTOM);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(FIELD_W / 2, FIELD_TOP);
  ctx.lineTo(FIELD_W / 2, FIELD_BOTTOM);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(FIELD_W / 2, GOAL_Y, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(FIELD_W / 2, GOAL_Y, 4, 0, Math.PI * 2);
  ctx.fill();

  const boxTop = GOAL_Y - 128;
  const boxHeight = 256;
  const boxWidth = 144;
  const smallBoxTop = GOAL_Y - 66;
  const smallBoxHeight = 132;
  const smallBoxWidth = 55;
  ctx.strokeRect(FIELD_LEFT, boxTop, boxWidth, boxHeight);
  ctx.strokeRect(FIELD_RIGHT - boxWidth, boxTop, boxWidth, boxHeight);
  ctx.strokeRect(FIELD_LEFT, smallBoxTop, smallBoxWidth, smallBoxHeight);
  ctx.strokeRect(FIELD_RIGHT - smallBoxWidth, smallBoxTop, smallBoxWidth, smallBoxHeight);
  ctx.beginPath();
  ctx.arc(FIELD_LEFT + 99, GOAL_Y, 3, 0, Math.PI * 2);
  ctx.arc(FIELD_RIGHT - 99, GOAL_Y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(FIELD_LEFT + 3, GOAL_Y, 16, -Math.PI / 2, Math.PI / 2);
  ctx.arc(FIELD_RIGHT - 3, GOAL_Y, 16, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();
  roundedPath(ctx, FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP, 24);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.stroke();
  ctx.restore();

  drawPost(ctx, FIELD_LEFT, GOAL_TOP);
  drawPost(ctx, FIELD_LEFT, GOAL_BOTTOM);
  drawPost(ctx, FIELD_RIGHT, GOAL_TOP);
  drawPost(ctx, FIELD_RIGHT, GOAL_BOTTOM);
}

let fieldBackground = null;
function drawField(ctx) {
  if (!fieldBackground) {
    fieldBackground = document.createElement("canvas");
    fieldBackground.width = FIELD_W * 2;
    fieldBackground.height = FIELD_H * 2;
    const surface = fieldBackground.getContext("2d");
    surface.scale(2, 2);
    paintField(surface);
  }
  ctx.drawImage(fieldBackground, 0, 0, FIELD_W, FIELD_H);
}

function drawShadow(ctx, body) {
  const speed = getSpeed(body);
  ctx.save();
  ctx.translate(body.x + 4 + Math.min(5, speed * 0.004), body.y + 7 + Math.min(4, speed * 0.003));
  ctx.scale(1, 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, body.r * 0.94, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 12, 7, 0.4)";
  ctx.filter = "blur(3px)";
  ctx.fill();
  ctx.restore();
}

function drawDisk(ctx, body, selected, active) {
  const kit = TEAM_COLORS[body.team];
  const number = String(body.id.split("-")[1] || "1");
  const r = body.r;
  drawShadow(ctx, body);
  ctx.save();
  if (active) {
    ctx.beginPath();
    ctx.arc(body.x, body.y, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = kit.glow;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (selected) {
    ctx.beginPath();
    ctx.arc(body.x, body.y, r + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(253, 224, 71, 0.98)";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.translate(body.x, body.y);

  const rim = ctx.createRadialGradient(-r * 0.28, -r * 0.32, 2, 0, 0, r);
  rim.addColorStop(0, kit.jerseyLight);
  rim.addColorStop(0.46, kit.jersey);
  rim.addColorStop(1, kit.jerseyDark);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.15, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = kit.jersey;
  ctx.fillRect(-r, -r * 0.12, r * 2, r * 1.4);

  ctx.fillStyle = kit.stripe;
  ctx.fillRect(-r * 0.18, -r * 0.16, r * 0.36, r * 1.35);

  ctx.fillStyle = kit.jerseyDark;
  ctx.beginPath();
  ctx.ellipse(-r * 0.78, r * 0.1, r * 0.3, r * 0.4, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.78, r * 0.1, r * 0.3, r * 0.4, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kit.collar;
  ctx.fillRect(-r * 0.92, r * 0.28, r * 0.28, r * 0.1);
  ctx.fillRect(r * 0.64, r * 0.28, r * 0.28, r * 0.1);

  ctx.fillStyle = kit.shorts;
  ctx.fillRect(-r * 0.46, r * 0.46, r * 0.92, r * 0.48);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-0.7, r * 0.46, 1.4, r * 0.48);

  ctx.fillStyle = kit.socks;
  ctx.fillRect(-r * 0.4, r * 0.86, r * 0.28, r * 0.22);
  ctx.fillRect(r * 0.12, r * 0.86, r * 0.28, r * 0.22);

  ctx.fillStyle = kit.collar;
  ctx.beginPath();
  ctx.moveTo(-r * 0.24, -r * 0.16);
  ctx.lineTo(0, r * 0.14);
  ctx.lineTo(r * 0.24, -r * 0.16);
  ctx.lineTo(r * 0.13, -r * 0.16);
  ctx.lineTo(0, r * 0.04);
  ctx.lineTo(-r * 0.13, -r * 0.16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = kit.hair;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.5, r * 0.4, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kit.skin;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.4, r * 0.33, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = kit.number;
  ctx.font = `800 ${Math.round(r * 0.7)}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.strokeText(number, 0, r * 0.16);
  ctx.fillText(number, 0, r * 0.16);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.15, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.38)";
  ctx.lineWidth = 1.05;
  ctx.stroke();

  const shine = ctx.createRadialGradient(-r * 0.38, -r * 0.42, 0, -r * 0.38, -r * 0.42, r * 0.55);
  shine.addColorStop(0, "rgba(255,255,255,0.38)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.38, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

function drawGhostDisk(ctx, body, point) {
  const kit = TEAM_COLORS[body.team];
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, body.r, 0, Math.PI * 2);
  ctx.fillStyle = kit.jersey;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = kit.stripe;
  ctx.fillRect(point.x - body.r * 0.16, point.y - body.r * 0.4, body.r * 0.32, body.r * 0.9);
  ctx.restore();
}

function drawBall(ctx, body) {
  drawShadow(ctx, body);
  ctx.save();
  const gradient = ctx.createRadialGradient(body.x - 5, body.y - 7, 1, body.x, body.y, body.r * 1.14);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.62, "#e3eee8");
  gradient.addColorStop(1, "#8ba69b");
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(18, 48, 36, 0.8)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "rgba(16, 37, 30, 0.72)";
  const roll = (body.x + body.y * 0.7) / body.r;
  const panel = (x, y, radius, angle) => {
    ctx.beginPath();
    for (let vertex = 0; vertex < 5; vertex += 1) {
      const a = angle + vertex * Math.PI * 2 / 5;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (vertex === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  panel(body.x, body.y, 4.3, roll);
  for (let index = 0; index < 5; index += 1) {
    const angle = index * (Math.PI * 2 / 5) + roll;
    const px = body.x + Math.cos(angle) * 9;
    const py = body.y + Math.sin(angle) * 9;
    panel(px, py, 2.7, angle);
    ctx.beginPath();
    ctx.moveTo(body.x + Math.cos(angle) * 4, body.y + Math.sin(angle) * 4);
    ctx.lineTo(px, py);
    ctx.strokeStyle = "rgba(21,35,29,0.42)";
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
  const shine = ctx.createRadialGradient(body.x - 6, body.y - 8, 0, body.x - 6, body.y - 8, 8);
  shine.addColorStop(0, "rgba(255, 255, 255, 0.82)");
  shine.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.beginPath();
  ctx.arc(body.x - 6, body.y - 8, 8, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

function drawAimGuide(ctx, body, pointer, preview) {
  const pullX = body.x - pointer.x;
  const pullY = body.y - pointer.y;
  const pullDistance = Math.hypot(pullX, pullY);
  if (pullDistance < 1) return;
  const direction = { x: pullX / pullDistance, y: pullY / pullDistance };
  const power = clamp(pullDistance, 0, MAX_PULL) / MAX_PULL;
  const guideLength = 84 + power * 214;
  const endX = body.x + direction.x * guideLength;
  const endY = body.y + direction.y * guideLength;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(253, 224, 71, 0.9)";
  ctx.setLineDash([9, 8]);
  ctx.beginPath();
  ctx.moveTo(body.x, body.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
  const arrowSize = 10;
  const perpendicular = { x: -direction.y, y: direction.x };
  ctx.fillStyle = "rgba(253, 224, 71, 0.98)";
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - direction.x * arrowSize + perpendicular.x * arrowSize * 0.72, endY - direction.y * arrowSize + perpendicular.y * arrowSize * 0.72);
  ctx.lineTo(endX - direction.x * arrowSize - perpendicular.x * arrowSize * 0.72, endY - direction.y * arrowSize - perpendicular.y * arrowSize * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(body.x, body.y);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (preview?.path?.length > 1) {
    const impactIndex = preview.firstImpactIndex ?? preview.path.length;
    const drawPath = (start, end, color, dash) => {
      if (end - start < 1) return;
      ctx.beginPath();
      ctx.moveTo(preview.path[start].x, preview.path[start].y);
      for (let index = start + 1; index < end; index += 1) ctx.lineTo(preview.path[index].x, preview.path[index].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.stroke();
    };
    drawPath(0, Math.min(impactIndex, preview.path.length), "rgba(255, 255, 255, 0.78)", [5, 7]);
    drawPath(Math.max(0, impactIndex - 1), preview.path.length, "rgba(110, 231, 183, 0.9)", [2, 7]);
    ctx.setLineDash([]);
    if (preview.ghost) drawGhostDisk(ctx, body, preview.ghost);
  }
  ctx.restore();
}

function drawGoalEffect(ctx, effect, now) {
  if (!effect) return;
  const elapsed = now - effect.started;
  if (elapsed >= effect.duration) return;
  const progress = clamp(elapsed / effect.duration, 0, 1);
  const alpha = 1 - progress;
  const originX = effect.side === "left" ? FIELD_LEFT - 3 : FIELD_RIGHT + 3;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(originX, GOAL_Y, 8, originX, GOAL_Y, 170 + progress * 80);
  glow.addColorStop(0, `rgba(253, 224, 71, ${0.34 * alpha})`);
  glow.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(originX - 190, GOAL_Y - 190, 380, 380);
  ctx.strokeStyle = `rgba(253, 224, 71, ${0.78 * alpha})`;
  ctx.lineWidth = 5 - progress * 3;
  ctx.beginPath();
  ctx.arc(originX, GOAL_Y, 38 + progress * 124, 0, Math.PI * 2);
  ctx.stroke();
  for (const particle of effect.particles) {
    const x = originX + particle.x * progress;
    const y = GOAL_Y + particle.y * progress + particle.gravity * progress * progress;
    ctx.fillStyle = `rgba(${particle.color}, ${alpha})`;
    ctx.fillRect(x, y, particle.size, particle.size);
  }
  ctx.restore();
}

function matchOutcome(playerScore, aiScore) {
  if (playerScore === aiScore) return "draw";
  return playerScore > aiScore ? "win" : "lose";
}

function formatCredits(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function ForceMeter({ powerPct, turn, compact = false }) {
  const contextual = turn !== "player"
    ? "Aguarde a IA concluir a jogada."
    : powerPct > 0
      ? "Solte para lançar; a linha verde mostra o primeiro quique."
      : "Puxe um disco azul para trás e solte na direção desejada.";
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#091712]/80 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-white/55">
        <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-300" /> Força contextual</span>
        <span className="font-bold tabular-nums text-amber-300">{powerPct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-rose-400 transition-[width] duration-75" style={{ width: `${powerPct}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">{contextual}</p>
    </div>
  );
}

function JerseyBadge({ team }) {
  const kit = TEAM_COLORS[team];
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
      <path
        d="M7 9 L12.5 6.5 L13 11 H19 L19.5 6.5 L25 9 L27.5 14.5 L23.5 16.5 V28 H8.5 V16.5 L4.5 14.5 Z"
        fill={kit.jersey}
        stroke={kit.jerseyDark}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M14.4 11 H17.6 V24 H14.4 Z" fill={kit.stripe} />
      <path d="M12.2 11 L16 16.2 L19.8 11 H17.4 L16 13.4 L14.6 11 Z" fill={kit.collar} />
      <rect x="10.2" y="24.2" width="11.6" height="3.8" fill={kit.shorts} />
    </svg>
  );
}

function ScorePanel({ playerScore, aiScore, playerShots, aiShots, turn, compact = false }) {
  const playerUsed = SHOTS_PER_SIDE - playerShots;
  const aiUsed = SHOTS_PER_SIDE - aiShots;
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#091712]/80 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
        <span>Placar de mesa</span>
        <span className="normal-case tracking-normal text-emerald-300/70">ao vivo</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-200/75">
            <JerseyBadge team="blue" />
            Azul · você
          </div>
          <div className="mt-0.5 text-3xl font-black tabular-nums text-sky-100">{playerScore}</div>
          <div className="mt-1 text-[10px] text-white/40">{playerUsed}/{SHOTS_PER_SIDE} chutes</div>
        </div>
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-200/75">
            <JerseyBadge team="red" />
            Vermelho · IA
          </div>
          <div className="mt-0.5 text-3xl font-black tabular-nums text-rose-100">{aiScore}</div>
          <div className="mt-1 text-[10px] text-white/40">{aiUsed}/{SHOTS_PER_SIDE} chutes</div>
        </div>
      </div>
      <div className={`mt-3 flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-sm ${turn === "player" ? "border-sky-400/25 bg-sky-500/10 text-sky-100" : "border-rose-400/25 bg-rose-500/10 text-rose-100"}`} role="status" aria-live="polite">
        <span className={`h-2 w-2 shrink-0 rounded-full ${turn === "player" ? "bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.85)]" : "bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.85)]"}`} />
        {turn === "player" ? "Sua vez" : "Vez da IA"}
      </div>
    </div>
  );
}

export default function Futebol() {
  const { refreshBalance, user, authReady } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [opponentMode, setOpponentMode] = useState("bot");
  const [opponent, setOpponent] = useState(BOT_OPPONENT);
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState(null);
  const [turn, setTurn] = useState("player");
  const [playerShots, setPlayerShots] = useState(SHOTS_PER_SIDE);
  const [aiShots, setAiShots] = useState(SHOTS_PER_SIDE);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [powerPct, setPowerPct] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vertical, setVertical] = useState(false);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const layoutRef = useRef({ width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1, vertical: false });
  const verticalRef = useRef(false);
  const bodiesRef = useRef(createKickoff());
  const matchRef = useRef(null);
  const configRef = useRef(null);
  const betRef = useRef(50);
  const turnRef = useRef("player");
  const opponentRef = useRef(BOT_OPPONENT);
  opponentRef.current = opponent;
  const playerShotsRef = useRef(SHOTS_PER_SIDE);
  const aiShotsRef = useRef(SHOTS_PER_SIDE);
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);
  const aimingRef = useRef(null);
  const aimPointRef = useRef(null);
  const aimPreviewRef = useRef(null);
  const animatingRef = useRef(false);
  const shotOwnerRef = useRef(null);
  const goalRef = useRef(null);
  const resolvingRef = useRef(false);
  const settledRef = useRef(false);
  const accumulatorRef = useRef(0);
  const lastFrameRef = useRef(0);
  const shotElapsedRef = useRef(0);
  const animationFrameRef = useRef(null);
  const kickoffFrameRef = useRef(null);
  const visualFrameRef = useRef(null);
  const aiTimerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const frameHandlerRef = useRef(null);
  const fireShotRef = useRef(null);
  const kickoffHandlerRef = useRef(null);
  const visualHandlerRef = useRef(null);
  const kickoffRef = useRef(null);
  const kickoffContinuationRef = useRef(null);
  const goalEffectRef = useRef(null);
  const mountedRef = useRef(true);

  const cancelPhysicsFrame = useCallback(() => {
    cancelFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const cancelKickoffFrame = useCallback(() => {
    cancelFrame(kickoffFrameRef.current);
    kickoffFrameRef.current = null;
  }, []);

  const cancelVisualFrame = useCallback(() => {
    cancelFrame(visualFrameRef.current);
    visualFrameRef.current = null;
  }, []);

  const schedulePhysicsFrame = useCallback(() => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = requestFrame(() => frameHandlerRef.current?.());
  }, []);

  const scheduleKickoffFrame = useCallback(() => {
    if (kickoffFrameRef.current) return;
    kickoffFrameRef.current = requestFrame(() => kickoffHandlerRef.current?.());
  }, []);

  const scheduleVisualFrame = useCallback(() => {
    if (visualFrameRef.current) return;
    visualFrameRef.current = requestFrame(() => visualHandlerRef.current?.());
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const currentLayout = layoutRef.current;
    const width = currentLayout.width || rect.width;
    const height = currentLayout.height || rect.height;
    const dpr = currentLayout.dpr || Math.min(window.devicePixelRatio || 1, 2.5);
    if (!width || !height) return;
    const currentVertical = currentLayout.vertical || verticalRef.current;
    const displayWorldWidth = currentVertical ? FIELD_H : FIELD_W;
    const displayWorldHeight = currentVertical ? FIELD_W : FIELD_H;
    const scale = currentLayout.scale || Math.min(width / displayWorldWidth, height / displayWorldHeight);
    const offsetX = currentLayout.offsetX || (width - displayWorldWidth * scale) / 2;
    const offsetY = currentLayout.offsetY || (height - displayWorldHeight * scale) / 2;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(offsetX, offsetY);
    if (currentVertical) context.transform(0, -scale, scale, 0, 0, FIELD_W * scale);
    else context.scale(scale, scale);
    context.imageSmoothingEnabled = true;
    drawField(context);

    let renderBodies = bodiesRef.current;
    const kickoff = kickoffRef.current;
    if (kickoff) {
      const progress = clamp((performance.now() - kickoff.started) / kickoff.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      renderBodies = kickoff.to.map((target) => {
        const origin = kickoff.from.find((body) => body.id === target.id) || target;
        return { ...target, x: lerp(origin.x, target.x, eased), y: lerp(origin.y, target.y, eased) };
      });
    }

    const selectedId = aimingRef.current?.id;
    for (const body of renderBodies) {
      if (body.kind !== "disk") continue;
      const expectedTeam = turnRef.current === "player" ? "blue" : "red";
      const active = body.team === expectedTeam && canControlTurn(turnRef.current, opponentRef.current) && !animatingRef.current && !kickoffRef.current;
      drawDisk(context, body, body.id === selectedId, active);
    }
    const ball = renderBodies.find((body) => body.kind === "ball");
    if (ball) drawBall(context, ball);

    if (aimingRef.current && aimPointRef.current && canControlTurn(turnRef.current, opponentRef.current) && !animatingRef.current && !kickoffRef.current) {
      const body = renderBodies.find((item) => item.id === aimingRef.current.id);
      if (body) drawAimGuide(context, body, aimPointRef.current, aimPreviewRef.current);
    }
    drawGoalEffect(context, goalEffectRef.current, performance.now());
  }, []);

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
        if (50 < Number(houseConfig.min_bet)) {
          setBet(Number(houseConfig.min_bet));
          betRef.current = Number(houseConfig.min_bet);
        }
      } catch {
        setError("Não foi possível carregar a configuração da arena.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!match) return undefined;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return undefined;

    const syncCanvas = () => {
      const stageRect = stage.getBoundingClientRect();
      const nextVertical = stageRect.width < 720;
      verticalRef.current = nextVertical;
      setVertical((previous) => (previous === nextVertical ? previous : nextVertical));
      const canvasRect = canvas.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const displayWorldWidth = nextVertical ? FIELD_H : FIELD_W;
      const displayWorldHeight = nextVertical ? FIELD_W : FIELD_H;
      const scale = Math.min(canvasRect.width / displayWorldWidth, canvasRect.height / displayWorldHeight);
      layoutRef.current = {
        width: canvasRect.width,
        height: canvasRect.height,
        scale,
        offsetX: (canvasRect.width - displayWorldWidth * scale) / 2,
        offsetY: (canvasRect.height - displayWorldHeight * scale) / 2,
        dpr,
        vertical: nextVertical,
      };
      const width = Math.max(1, Math.round(canvasRect.width * dpr));
      const height = Math.max(1, Math.round(canvasRect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      draw();
    };

    syncCanvas();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncCanvas);
    observer?.observe(stage);
    observer?.observe(canvas);
    window.addEventListener("resize", syncCanvas);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncCanvas);
    };
  }, [draw, match, vertical]);

  const startGoalEffect = useCallback((side) => {
    const colors = ["253, 224, 71", "110, 231, 183", "255, 255, 255"];
    goalEffectRef.current = {
      side,
      started: performance.now(),
      duration: 1400,
      particles: Array.from({ length: 34 }, (_, index) => {
        const angle = (index / 34) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const speed = 80 + Math.random() * 190;
        return {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
          gravity: 30 + Math.random() * 48,
          size: 2 + Math.random() * 4,
          color: colors[index % colors.length],
        };
      }),
    };
    scheduleVisualFrame();
  }, [scheduleVisualFrame]);

  const visualFrame = useCallback(() => {
    visualFrameRef.current = null;
    const effect = goalEffectRef.current;
    if (!effect) return;
    if (performance.now() - effect.started >= effect.duration) {
      goalEffectRef.current = null;
      draw();
      return;
    }
    draw();
    scheduleVisualFrame();
  }, [draw, scheduleVisualFrame]);
  visualHandlerRef.current = visualFrame;

  const scheduleAiShot = useCallback(() => {
    if (isHumanOpponent(opponentRef.current)) return;
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    setAiThinking(true);
    setMessage("A IA lê ângulos, força e linhas de passe...");
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null;
      if (resolvingRef.current || animatingRef.current || kickoffRef.current || turnRef.current !== "ai" || !matchRef.current) return;
      const plan = chooseAiShot(bodiesRef.current);
      setAiThinking(false);
      if (!plan) {
        setMessage("A IA não encontrou uma linha segura; jogada curta.");
        const fallback = bodiesRef.current.find((body) => body.team === "red");
        if (fallback) fireShotRef.current?.(fallback.id, "ai", { x: -1, y: 0 }, 0.34);
        return;
      }
      setMessage(`IA: ${plan.mode}.`);
      fireShotRef.current?.(plan.diskId, "ai", plan.direction, plan.power);
    }, 760);
  }, []);

  const advanceTurn = useCallback((previousShooter) => {
    if (resolvingRef.current) return;
    let nextTurn = null;
    if (previousShooter === "player" && aiShotsRef.current > 0) nextTurn = "ai";
    else if (previousShooter === "ai" && playerShotsRef.current > 0) nextTurn = "player";
    else if (playerShotsRef.current > 0) nextTurn = "player";
    else if (aiShotsRef.current > 0) nextTurn = "ai";
    if (!nextTurn) return;
    turnRef.current = nextTurn;
    setTurn(nextTurn);
    if (nextTurn === "ai" && !isHumanOpponent(opponentRef.current)) scheduleAiShot();
    else {
      setAiThinking(false);
      setMessage(nextTurn === "ai"
        ? `${sideLabel("ai", opponentRef.current)}: puxe um disco vermelho.`
        : "Sua vez: puxe um disco azul para trás.");
    }
    draw();
  }, [draw, scheduleAiShot]);

  const startKickoffAnimation = useCallback((continuation) => {
    const from = cloneBodies(bodiesRef.current);
    const to = createKickoff();
    bodiesRef.current = to;
    kickoffRef.current = { from, to, started: performance.now(), duration: 620 };
    kickoffContinuationRef.current = continuation;
    scheduleKickoffFrame();
    draw();
  }, [draw, scheduleKickoffFrame]);

  const kickoffFrame = useCallback(() => {
    kickoffFrameRef.current = null;
    const kickoff = kickoffRef.current;
    if (!kickoff) return;
    if (performance.now() - kickoff.started >= kickoff.duration) {
      kickoffRef.current = null;
      const continuation = kickoffContinuationRef.current;
      kickoffContinuationRef.current = null;
      draw();
      continuation?.();
      return;
    }
    draw();
    scheduleKickoffFrame();
  }, [draw, scheduleKickoffFrame]);
  kickoffHandlerRef.current = kickoffFrame;

  const finishMatch = useCallback(async (outcome) => {
    if (resolvingRef.current || settledRef.current || !matchRef.current) return;
    resolvingRef.current = true;
    settledRef.current = true;
    animatingRef.current = false;
    aimingRef.current = null;
    aimPointRef.current = null;
    aimPreviewRef.current = null;
    turnRef.current = null;
    setTurn(null);
    setPowerPct(0);
    setAiThinking(false);
    cancelPhysicsFrame();
    cancelKickoffFrame();
    cancelVisualFrame();
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
    aiTimerRef.current = null;
    messageTimerRef.current = null;
    kickoffRef.current = null;
    kickoffContinuationRef.current = null;
    goalEffectRef.current = null;

    const houseConfig = configRef.current || {};
    const rake = Number(houseConfig.rake_percent || 0) / 100;
    const wager = betRef.current;
    let payout = 0;
    let houseCut = 0;
    let status = "lost";
    if (outcome === "win") {
      houseCut = 2 * wager * rake;
      payout = 2 * wager - houseCut;
      status = "won";
    } else if (outcome === "draw") {
      payout = wager;
      status = "draw";
    }

    setMessage("Liquidando a partida...");
    try {
      const newBalance = await settleMatch(matchRef.current, status, payout, houseCut);
      setBalance(newBalance);
      refreshBalance?.();
      setResult({
        outcome,
        payout,
        bet: wager,
        playerScore: playerScoreRef.current,
        aiScore: aiScoreRef.current,
      });
      if (outcome === "win") sfx.win();
      else if (outcome === "draw") sfx.draw();
      else sfx.lose();
    } catch (settlementError) {
      settledRef.current = false;
      resolvingRef.current = false;
      setError(settlementError.message || "Não foi possível liquidar a partida.");
      setMessage("A liquidação falhou. Tente novamente.");
    }
  }, [cancelKickoffFrame, cancelPhysicsFrame, cancelVisualFrame, refreshBalance]);

  const onShotEnd = useCallback(() => {
    if (resolvingRef.current) return;
    const shooter = shotOwnerRef.current;
    if (!shooter) return;
    const scoredSide = goalRef.current;
    goalRef.current = null;
    let nextPlayerScore = playerScoreRef.current;
    let nextAiScore = aiScoreRef.current;

    if (scoredSide) {
      const scorer = scoredSide === "right" ? "player" : "ai";
      if (scorer === "player") {
        nextPlayerScore += 1;
        playerScoreRef.current = nextPlayerScore;
        setPlayerScore(nextPlayerScore);
      } else {
        nextAiScore += 1;
        aiScoreRef.current = nextAiScore;
        setAiScore(nextAiScore);
      }
      setMessage(scorer === "player" ? "GOL AZUL · linha encontrada" : "GOL VERMELHO · a IA marcou");
      sfx.goal();
      startGoalEffect(scoredSide);
      if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
      messageTimerRef.current = setTimeout(() => setMessage(""), 1450);
    }

    const seriesComplete = playerShotsRef.current === 0 && aiShotsRef.current === 0;
    const firstToThree = nextPlayerScore >= WIN_SCORE || nextAiScore >= WIN_SCORE;
    if (firstToThree || seriesComplete) {
      finishMatch(matchOutcome(nextPlayerScore, nextAiScore));
      return;
    }

    turnRef.current = null;
    setTurn(null);
    if (scoredSide) {
      startKickoffAnimation(() => advanceTurn(shooter));
    } else {
      advanceTurn(shooter);
    }
  }, [advanceTurn, finishMatch, startGoalEffect, startKickoffAnimation]);

  const frameHandler = useCallback(() => {
    animationFrameRef.current = null;
    if (!animatingRef.current) return;
    const now = performance.now();
    const previous = lastFrameRef.current || now;
    const elapsed = clamp((now - previous) / 1000, 0, 0.12);
    lastFrameRef.current = now;
    shotElapsedRef.current += elapsed;
    accumulatorRef.current = Math.min(accumulatorRef.current + elapsed, 0.32);
    let steps = 0;
    while (accumulatorRef.current >= FIXED_STEP && steps < MAX_FRAME_STEPS) {
      const outcome = stepWorld(bodiesRef.current, FIXED_STEP);
      accumulatorRef.current -= FIXED_STEP;
      steps += 1;
      if (outcome.goal) {
        goalRef.current = outcome.goal;
        animatingRef.current = false;
        break;
      }
    }
    if (steps === MAX_FRAME_STEPS && accumulatorRef.current > FIXED_STEP * 2) accumulatorRef.current = FIXED_STEP * 2;
    draw();
    if (!animatingRef.current || bodiesAreStill(bodiesRef.current) || shotElapsedRef.current >= MAX_SHOT_TIME) {
      animatingRef.current = false;
      accumulatorRef.current = 0;
      shotElapsedRef.current = 0;
      onShotEnd();
      return;
    }
    schedulePhysicsFrame();
  }, [draw, onShotEnd, schedulePhysicsFrame]);
  frameHandlerRef.current = frameHandler;

  const fireShot = useCallback((bodyId, shooter, direction, power) => {
    if (animatingRef.current || resolvingRef.current || kickoffRef.current || !matchRef.current) return;
    const body = bodiesRef.current.find((item) => item.id === bodyId);
    if (!body || body.kind !== "disk") return;
    const normalizedDirection = normalize(direction.x, direction.y);
    const strength = clamp(power, 0, 1);
    sfx.kick();
    body.vx = normalizedDirection.x * strength * MAX_SHOT_SPEED;
    body.vy = normalizedDirection.y * strength * MAX_SHOT_SPEED;
    shotOwnerRef.current = shooter;
    goalRef.current = null;
    aimingRef.current = null;
    aimPointRef.current = null;
    aimPreviewRef.current = null;
    setPowerPct(0);
    setAiThinking(false);
    setMessage(shooter === "player" ? "Chute em movimento; observe o quique..." : "A IA disparou...");
    if (shooter === "player") {
      playerShotsRef.current -= 1;
      setPlayerShots(playerShotsRef.current);
    } else {
      aiShotsRef.current -= 1;
      setAiShots(aiShotsRef.current);
    }
    animatingRef.current = true;
    accumulatorRef.current = FIXED_STEP;
    shotElapsedRef.current = 0;
    lastFrameRef.current = performance.now() - FIXED_STEP * 1000;
    draw();
    schedulePhysicsFrame();
  }, [draw, schedulePhysicsFrame]);
  fireShotRef.current = fireShot;

  const toFieldPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const layout = layoutRef.current;
    if (!rect.width || !rect.height || !layout.scale) return null;
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const localX = (screenX - layout.offsetX) / layout.scale;
    const localY = (screenY - layout.offsetY) / layout.scale;
    if (layout.vertical) {
      return { x: clamp(FIELD_W - localY, 0, FIELD_W), y: clamp(localX, 0, FIELD_H) };
    }
    return { x: clamp(localX, 0, FIELD_W), y: clamp(localY, 0, FIELD_H) };
  }, []);

  const updateAim = useCallback((event) => {
    if (aimingRef.current?.pointerId !== event.pointerId) return;
    if (!aimingRef.current || !matchRef.current || !canControlTurn(turnRef.current, opponentRef.current) || animatingRef.current || kickoffRef.current) return;
    const point = toFieldPoint(event);
    if (!point) return;
    aimPointRef.current = point;
    const target = bodiesRef.current.find((body) => body.id === aimingRef.current.id);
    if (!target) return;
    const pullX = target.x - point.x;
    const pullY = target.y - point.y;
    const pullDistance = Math.hypot(pullX, pullY);
    const power = clamp(pullDistance, 0, MAX_PULL) / MAX_PULL;
    setPowerPct(Math.round(power * 100));
    aimPreviewRef.current = power >= 0.04 ? makePreview(bodiesRef.current, target.id, normalize(pullX, pullY), power) : null;
    draw();
  }, [draw, toFieldPoint]);

  const onPointerDown = useCallback((event) => {
    if (aimingRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!matchRef.current || result || resolvingRef.current || animatingRef.current || kickoffRef.current || !canControlTurn(turnRef.current, opponentRef.current)) return;
    const point = toFieldPoint(event);
    if (!point) return;
    const layout = layoutRef.current;
    const team = turnRef.current === "player" ? "blue" : "red";
    const target = bodiesRef.current
      .filter((body) => body.team === team)
      .sort((a, b) => distance(a, point) - distance(b, point))[0];
    if (!target) return;
    const hitRadius = Math.max(target.r + 16, 44 / Math.max(layout.scale, 0.01));
    if (distance(target, point) > hitRadius) return;
    aimingRef.current = { id: target.id, pointerId: event.pointerId };
    aimPointRef.current = point;
    aimPreviewRef.current = null;
    setPowerPct(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateAim(event);
    draw();
  }, [draw, result, toFieldPoint, updateAim]);

  const onPointerMove = useCallback((event) => {
    updateAim(event);
  }, [updateAim]);

  const clearAim = useCallback((event) => {
    if (!aimingRef.current || aimingRef.current.pointerId !== event.pointerId) return;
    const pointerId = aimingRef.current.pointerId;
    aimingRef.current = null;
    aimPointRef.current = null;
    aimPreviewRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
    setPowerPct(0);
    draw();
  }, [draw]);

  const onPointerUp = useCallback((event) => {
    if (!aimingRef.current || aimingRef.current.pointerId !== event.pointerId) return;
    const aim = aimingRef.current;
    const point = aimPointRef.current;
    const target = bodiesRef.current.find((body) => body.id === aim.id);
    aimingRef.current = null;
    aimPointRef.current = null;
    aimPreviewRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!point || !target || !matchRef.current || result || resolvingRef.current || animatingRef.current || kickoffRef.current || !canControlTurn(turnRef.current, opponentRef.current)) {
      setPowerPct(0);
      draw();
      return;
    }
    const pullX = target.x - point.x;
    const pullY = target.y - point.y;
    const pullDistance = Math.hypot(pullX, pullY);
    const power = clamp(pullDistance, 0, MAX_PULL) / MAX_PULL;
    if (power < 0.08) {
      setPowerPct(0);
      draw();
      return;
    }
    fireShotRef.current?.(target.id, turnRef.current, { x: pullX / pullDistance, y: pullY / pullDistance }, power);
  }, [draw, result]);

  const startMatch = async (nextOpponent = opponent) => {
    setError("");
    const wager = Number(bet);
    const min = Number(config?.min_bet ?? 10);
    const max = Number(config?.max_bet ?? 1000);
    if (!Number.isFinite(wager) || wager < min) {
      setError(`Aposta mínima: ${formatCredits(min)}`);
      return;
    }
    if (wager > max) {
      setError(`Aposta máxima: ${formatCredits(max)}`);
      return;
    }
    if (balance == null || balance < wager) {
      setError("Saldo insuficiente");
      return;
    }
    if (opponentMode === "online" && !isHumanOpponent(nextOpponent)) {
      setSearching(true);
      return;
    }
    setBusy(true);
    try {
      setOpponent(nextOpponent);
      opponentRef.current = nextOpponent;
      const newMatch = await placeBet(wager, "futebol");
      if (!mountedRef.current) {
        void abandonMatch(newMatch, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      matchRef.current = newMatch;
      betRef.current = wager;
      settledRef.current = false;
      resolvingRef.current = false;
      bodiesRef.current = createKickoff();
      playerShotsRef.current = SHOTS_PER_SIDE;
      aiShotsRef.current = SHOTS_PER_SIDE;
      playerScoreRef.current = 0;
      aiScoreRef.current = 0;
      turnRef.current = "player";
      shotOwnerRef.current = null;
      goalRef.current = null;
      animatingRef.current = false;
      kickoffRef.current = null;
      goalEffectRef.current = null;
      setMatch(newMatch);
      setResult(null);
      setTurn("player");
      setPlayerShots(SHOTS_PER_SIDE);
      setAiShots(SHOTS_PER_SIDE);
      setPlayerScore(0);
      setAiScore(0);
      setPowerPct(0);
      setAiThinking(false);
      setMessage("Sua vez: puxe um disco azul para trás.");
      setBalance(await getBalance());
      refreshBalance?.();
    } catch (startError) {
      setError(startError.message || "Não foi possível iniciar a partida.");
    } finally {
      setBusy(false);
    }
  };

  const endMatch = () => {
    const activeMatch = matchRef.current;
    if (!activeMatch || settledRef.current || resolvingRef.current) {
      resetGame();
      return;
    }
    if (!window.confirm("Encerrar a partida agora conta como derrota e a aposta será perdida. Deseja continuar?")) return;
    resolvingRef.current = true;
    animatingRef.current = false;
    sfx.end();
    (async () => {
      try {
        await abandonMatch(activeMatch, "Você encerrou a partida.");
        if (mountedRef.current) setBalance(await getBalance());
        refreshBalance?.();
      } catch {
        // A carteira registra a derrota mesmo se a leitura de saldo falhar.
      } finally {
        resetGame();
      }
    })();
  };

  const resetGame = () => {
    const activeMatch = matchRef.current;
    if (activeMatch && !settledRef.current && !resolvingRef.current) {
      void abandonMatch(activeMatch, "Você reiniciou a partida.").catch(() => {});
    }
    cancelPhysicsFrame();
    cancelKickoffFrame();
    cancelVisualFrame();
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
    aiTimerRef.current = null;
    messageTimerRef.current = null;
    animatingRef.current = false;
    resolvingRef.current = false;
    settledRef.current = false;
    aimingRef.current = null;
    aimPointRef.current = null;
    aimPreviewRef.current = null;
    kickoffRef.current = null;
    kickoffContinuationRef.current = null;
    goalEffectRef.current = null;
    bodiesRef.current = createKickoff();
    matchRef.current = null;
    turnRef.current = "player";
    playerShotsRef.current = SHOTS_PER_SIDE;
    aiShotsRef.current = SHOTS_PER_SIDE;
    playerScoreRef.current = 0;
    aiScoreRef.current = 0;
    setMatch(null);
    setResult(null);
    setError("");
    setTurn("player");
    setPlayerShots(SHOTS_PER_SIDE);
    setAiShots(SHOTS_PER_SIDE);
    setPlayerScore(0);
    setAiScore(0);
    setPowerPct(0);
    setAiThinking(false);
    setMessage("");
    (async () => {
      try {
        setBalance(await getBalance());
      } catch {
        // Mantém o último saldo conhecido na tela de aposta.
      }
    })();
  };

  useEffect(() => () => {
    const activeMatch = matchRef.current;
    mountedRef.current = false;
    cancelPhysicsFrame();
    cancelKickoffFrame();
    cancelVisualFrame();
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
    if (activeMatch && !settledRef.current && !resolvingRef.current) {
      void abandonMatch(activeMatch, "Você saiu da partida.").catch(() => {});
    }
  }, [cancelKickoffFrame, cancelPhysicsFrame, cancelVisualFrame]);

  if (!authReady || loading) {
    return <div className="flex justify-center py-20" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-white/40" /><span className="sr-only">Carregando arena</span></div>;
  }
  if (!user) return <LoginGate user={user} title="Entre para jogar Futebol de mesa" />;

  if (!match) {
    const rake = Number(config?.rake_percent || 0) / 100;
    const potentialPrize = 2 * Number(bet || 0) * (1 - rake);
    return (
      <div className="mx-auto max-w-lg">
        <Link to="/" className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar ao lobby
        </Link>
        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[#08130f] p-5 shadow-[0_34px_90px_-34px_rgba(0,0,0,0.95)] sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative mb-5 flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-gradient-to-br from-sky-400/25 via-emerald-500/15 to-rose-500/20 shadow-[0_12px_30px_-12px_rgba(56,189,248,0.8)]">
              <div className="absolute inset-1.5 rounded-xl border border-white/10" />
              <CircleDot className="relative h-8 w-8 text-sky-100" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300/70">Arena 04 · mesa verde</div>
              <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-white">Flick <span className="text-sky-300">football</span></h1>
            </div>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-white/55">Cinco discos por equipe, uma bola e linhas de passe. Bot ArenaBet ou adversário online.</p>
          <div className="mt-6">
            <OpponentSelect
              value={opponentMode}
              onChange={(mode) => {
                setOpponentMode(mode);
                setOpponent(BOT_OPPONENT);
              }}
            />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2 text-center">
            <div className="rounded-xl bg-sky-400/10 px-2 py-3"><div className="text-lg font-black text-sky-200">5</div><div className="text-[10px] uppercase tracking-wider text-white/40">discos azuis</div></div>
            <div className="rounded-xl bg-emerald-400/10 px-2 py-3"><div className="text-lg font-black text-emerald-200">3</div><div className="text-[10px] uppercase tracking-wider text-white/40">gols para vencer</div></div>
            <div className="rounded-xl bg-amber-400/10 px-2 py-3"><div className="text-lg font-black text-amber-200">6×</div><div className="text-[10px] uppercase tracking-wider text-white/40">série máxima</div></div>
          </div>
          <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm">
            <div className="flex justify-between"><span className="text-white/45">Seu saldo</span><span className="font-semibold text-white">{formatCredits(balance)}</span></div>
            <div className="flex justify-between"><span className="text-white/45">Comissão da casa</span><span className="text-emerald-300">{config?.rake_percent ?? 0}%</span></div>
            <div className="flex justify-between"><span className="text-white/45">Prêmio se vencer</span><span className="text-amber-300">{formatCredits(potentialPrize)}</span></div>
          </div>
          <label className="mb-2 mt-6 block text-sm font-medium text-white/65" htmlFor="futebol-bet">Valor da aposta</label>
          <div className="relative">
            <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300/70" />
            <input
              id="futebol-bet"
              type="number"
              value={bet}
              min={config?.min_bet}
              max={config?.max_bet}
              onChange={(event) => { const value = Number(event.target.value); setBet(value); betRef.current = value; }}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.055] pl-10 pr-4 text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15"
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[50, 100, 250, 500].map((value) => (
              <button key={value} type="button" onClick={() => { setBet(value); betRef.current = value; }} className={`min-h-[44px] rounded-xl border text-sm font-semibold transition ${bet === value ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-200" : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/10"}`}>
                {value}
              </button>
            ))}
          </div>
          {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</div>}
          <button
            type="button"
            onClick={() => startMatch(opponentMode === "bot" ? BOT_OPPONENT : opponent)}
            disabled={busy || balance == null || balance < Number(bet)}
            className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] px-4 font-bold text-[#14110A] transition hover:bg-[#E0C35A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            {busy ? "Abrindo arena..." : opponentMode === "online" ? `Procurar adversário · ${formatCredits(Number(bet || 0))}` : `Entrar na mesa · ${formatCredits(Number(bet || 0))}`}
          </button>
        </div>
        {searching && user && (
          <MatchmakingPanel
            game="futebol"
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

  const statusText = message || (aiThinking ? "Vez da IA..." : `${sideLabel(turn, opponent)}: arraste um disco ${turn === "player" ? "azul" : "vermelho"}`);
  const topMobileLabel = vertical ? "Gol da IA · ataque azul" : "";

  return (
    <div className="space-y-4 pb-6 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-white/50 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Lobby
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 text-amber-200"><Coins className="h-3.5 w-3.5" /> Aposta {formatCredits(bet)}</span>
          <span className={`inline-flex min-h-[40px] items-center rounded-full border px-3 ${turn === "player" ? "border-sky-400/25 bg-sky-400/10 text-sky-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`} role="status" aria-live="polite">{statusText}</span>
          <button
            type="button"
            onClick={endMatch}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 font-semibold text-rose-200 transition hover:bg-rose-500/20"
          >
            <Flag className="h-3.5 w-3.5" /> Encerrar partida
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_292px] lg:gap-5">
        <section className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-300/60">Flick lab / partida ao vivo</div>
              <h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">RINK<span className="text-emerald-300">//</span>04</h1>
            </div>
            <div className="hidden text-right text-[11px] leading-relaxed text-white/38 sm:block">Primeiro a 3 gols<br />ou 6 chutes por lado</div>
          </div>

          <div className="mb-3 lg:hidden">
            <ScorePanel playerScore={playerScore} aiScore={aiScore} playerShots={playerShots} aiShots={aiShots} turn={turn} compact />
            <div className="mt-3"><ForceMeter powerPct={powerPct} turn={turn} compact /></div>
          </div>

          {vertical && <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200/70"><span>{topMobileLabel}</span><span>{aiThinking ? "IA pensando" : "zona vermelha"}</span></div>}
          <div ref={stageRef} className={`relative overflow-hidden rounded-[1.45rem] border border-emerald-300/15 bg-[#03100b] p-1.5 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] sm:p-2 ${vertical ? "mx-auto w-full max-w-[620px]" : "w-full"}`}>
            <canvas
              ref={canvasRef}
              width={FIELD_W}
              height={FIELD_H}
              aria-label="Campo de flick football. No turno azul, arraste a partir de um dos cinco discos azuis e solte para chutar."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={clearAim}
              className="block w-full cursor-crosshair select-none rounded-[1.05rem] touch-none ring-1 ring-white/10"
              style={{ aspectRatio: vertical ? `${FIELD_H} / ${FIELD_W}` : `${FIELD_W} / ${FIELD_H}` }}
            />
          </div>
          {vertical && <div className="mt-2 flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-200/75"><span>zona azul</span><span>Seu gol · defesa</span></div>}
          <div className="mt-3 hidden lg:block"><ForceMeter powerPct={powerPct} turn={turn} /></div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
            <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
            <span>{turn === "player" ? "Os anéis azuis mostram discos prontos. Puxe para trás, confira o fantasma e a linha verde após o primeiro impacto, então solte." : "O turno alterna depois que todos os corpos param. Postes e traves são obstáculos físicos, não decoração."}</span>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="hidden lg:block"><ScorePanel playerScore={playerScore} aiScore={aiScore} playerShots={playerShots} aiShots={aiShots} turn={turn} /></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55 sm:p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold text-white/85"><Target className="h-4 w-4 text-emerald-300" /> Regras da mesa</div>
            <ul className="space-y-2 leading-relaxed">
              <li>Primeiro a <strong className="text-white/80">3 gols</strong> encerra a partida.</li>
              <li>Se ninguém chegar lá, a série termina em <strong className="text-white/80">6 chutes por lado</strong>; maior placar vence.</li>
              <li>Empate na série devolve a aposta.</li>
              <li>Arraste um disco azul para trás; a força é proporcional ao recuo.</li>
            </ul>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100/70"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Física fixa em 120 Hz + substeps</div>
          </div>
          {error && <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</div>}
        </aside>
      </div>

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020805]/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="futebol-result-title">
          <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-[#08150f] p-7 text-center shadow-[0_30px_100px_-25px_rgba(0,0,0,0.95)] sm:p-8">
            <div className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className={`relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${result.outcome === "win" ? "bg-emerald-500/15 text-emerald-300" : result.outcome === "draw" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>
              {result.outcome === "win" ? <Trophy className="h-8 w-8" /> : result.outcome === "draw" ? <span className="text-2xl font-bold">=</span> : <Skull className="h-8 w-8" />}
            </div>
            <h2 id="futebol-result-title" className="relative font-display text-2xl font-black">{result.outcome === "win" ? "Você venceu a mesa" : result.outcome === "draw" ? "Empate técnico" : "A IA levou a partida"}</h2>
            <p className="relative mt-1 text-sm leading-relaxed text-white/55">
              {result.outcome === "win" ? `Prêmio: +R$ ${formatCredits(result.payout - result.bet)}` : result.outcome === "draw" ? "A aposta foi devolvida ao saldo." : `Você perdeu R$ ${formatCredits(result.bet)}.`}
            </p>
            <div className="relative mt-5 flex items-center justify-center gap-5 text-sm"><span className="font-bold text-sky-200">Azul {result.playerScore}</span><span className="text-white/25">x</span><span className="font-bold text-rose-200">Vermelho {result.aiScore}</span></div>
            <button type="button" onClick={resetGame} className="relative mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-600 font-bold text-[#04120c] transition hover:from-emerald-300 hover:to-emerald-500"><RotateCcw className="h-4 w-4" /> Jogar novamente</button>
            <Link to="/" className="relative mt-3 inline-flex min-h-[44px] items-center text-sm text-white/50 hover:text-white">Voltar ao lobby</Link>
          </div>
        </div>
      )}
    </div>
  );
}
