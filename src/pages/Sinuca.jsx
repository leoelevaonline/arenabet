import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  CircleDot,
  Coins,
  Gauge,
  Loader2,
  RotateCcw,
  Skull,
  Target,
  Trophy,
} from "lucide-react";
import confetti from "canvas-confetti";
import LoginGate from "@/components/LoginGate";
import MatchmakingPanel from "@/components/MatchmakingPanel";
import OpponentSelect from "@/components/OpponentSelect";
import { BOT_OPPONENT, canControlTurn, isHumanOpponent, sideLabel } from "@/lib/opponent";
import { abandonMatch, getHouseConfig, getBalance, placeBet, settleMatch } from "@/lib/wallet";
import { drawSurface } from "@/lib/gameSurfaces";
import { tablePoint, tableTransform } from "@/lib/canvasTable";

const TABLE_W = 1120;
const TABLE_H = 620;
const BED = { left: 84, top: 76, right: 1036, bottom: 544 };
const BED_CENTER_Y = (BED.top + BED.bottom) / 2;
const BALL_RADIUS = 13;
const POCKET_MOUTH_RADIUS = 48;
const POCKET_SINK_RADIUS = 19;
const MAX_SHOT_SPEED = 1420;
const PULL_MAX = 245;
const PHYSICS_STEP = 1 / 120;
const PHYSICS_SUBSTEPS = 2;
const COLLISION_ITERATIONS = 3;
const MAX_CATCH_UP_STEPS = 36;
const BALL_RESTITUTION = 0.93;
const WALL_RESTITUTION = 0.76;
const FRICTION_PER_SECOND = 0.09;
const FRICTION_RATE = -Math.log(FRICTION_PER_SECOND);
const STOP_SPEED = 6.5;
const SLEEP_STEPS = 10;
const TOUCH_RADIUS = BALL_RADIUS + 24;
const AI_DIFFICULTY = {
  label: "normal",
  angularError: 0.022,
  powerError: 0.045,
};

const POCKETS = [
  { id: "top-left", label: "canto superior esquerdo", x: 56, y: 54, kind: "corner", corner: "tl" },
  { id: "top-center", label: "meio superior", x: TABLE_W / 2, y: 51, kind: "side", side: "top" },
  { id: "top-right", label: "canto superior direito", x: TABLE_W - 56, y: 54, kind: "corner", corner: "tr" },
  { id: "bottom-left", label: "canto inferior esquerdo", x: 56, y: TABLE_H - 54, kind: "corner", corner: "bl" },
  { id: "bottom-center", label: "meio inferior", x: TABLE_W / 2, y: TABLE_H - 51, kind: "side", side: "bottom" },
  { id: "bottom-right", label: "canto inferior direito", x: TABLE_W - 56, y: TABLE_H - 54, kind: "corner", corner: "br" },
];

const BALL_STYLES = {
  1: { fill: "#e9b935", light: "#fff1a7", dark: "#78500a" },
  2: { fill: "#2e7bc5", light: "#a8ddff", dark: "#123e70" },
  3: { fill: "#c9453c", light: "#ffb0a3", dark: "#681d1b" },
  4: { fill: "#7548b3", light: "#d2afff", dark: "#30175a" },
  5: { fill: "#d87933", light: "#ffd09d", dark: "#713516" },
  6: { fill: "#2a9b67", light: "#9df4bf", dark: "#0d5034" },
  7: { fill: "#8d3037", light: "#ef9ba0", dark: "#421219" },
  8: { fill: "#191b22", light: "#777b88", dark: "#020305" },
  9: { fill: "#e9b935", light: "#fff1a7", dark: "#78500a" },
  10: { fill: "#2e7bc5", light: "#a8ddff", dark: "#123e70" },
  11: { fill: "#c9453c", light: "#ffb0a3", dark: "#681d1b" },
  12: { fill: "#7548b3", light: "#d2afff", dark: "#30175a" },
  13: { fill: "#d87933", light: "#ffd09d", dark: "#713516" },
  14: { fill: "#2a9b67", light: "#9df4bf", dark: "#0d5034" },
  15: { fill: "#8d3037", light: "#ef9ba0", dark: "#421219" },
};

const RACK_ORDER = [1, 9, 2, 10, 8, 11, 3, 12, 4, 13, 5, 14, 6, 15, 7];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function unit(x, y) {
  const length = Math.hypot(x, y);
  return length > 0.000001 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function rotate(direction, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: direction.x * cosine - direction.y * sine,
    y: direction.x * sine + direction.y * cosine,
  };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function groupForNumber(number) {
  if (number >= 1 && number <= 7) return "solid";
  if (number >= 9 && number <= 15) return "stripe";
  if (number === 8) return "eight";
  return "cue";
}

function groupLabel(group) {
  if (group === "solid") return "lisas";
  if (group === "stripe") return "listradas";
  if (group === "eight") return "bola 8";
  return "mesa aberta";
}

function otherGroup(group) {
  return group === "solid" ? "stripe" : "solid";
}

function getPocket(id) {
  return POCKETS.find((pocket) => pocket.id === id) || null;
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

function pointInsideBed(point, padding = BALL_RADIUS) {
  return point.x >= BED.left + padding
    && point.x <= BED.right - padding
    && point.y >= BED.top + padding
    && point.y <= BED.bottom - padding;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.000001) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function isNearPocketOpening(ball) {
  return POCKETS.some((pocket) => distance(ball, pocket) < POCKET_MOUTH_RADIUS);
}

function segmentClear(start, end, world, ignoredIds = [], extraClearance = 0) {
  return world.balls.every((ball) => {
    if (ball.pocketed || ignoredIds.includes(ball.id)) return true;
    return pointToSegmentDistance(ball, start, end) > ball.r + extraClearance;
  });
}

function buildRackBall(number, x, y, index) {
  const style = BALL_STYLES[number];
  return {
    id: `ball-${number}`,
    index,
    number,
    group: groupForNumber(number),
    x,
    y,
    vx: 0,
    vy: 0,
    r: BALL_RADIUS,
    rotation: (number * 0.17) % (Math.PI * 2),
    fill: style.fill,
    light: style.light,
    dark: style.dark,
    pocketed: false,
    inPocket: false,
    pocketId: null,
    sleepSteps: 0,
  };
}

function createWorld() {
  const balls = [{
    id: "cue",
    index: 0,
    number: 0,
    group: "cue",
    x: BED.left + 190,
    y: BED_CENTER_Y,
    vx: 0,
    vy: 0,
    r: BALL_RADIUS,
    rotation: 0,
    fill: "#f5f3e9",
    light: "#ffffff",
    dark: "#a5a7a7",
    pocketed: false,
    inPocket: false,
    pocketId: null,
    sleepSteps: 0,
  }];
  const rackApexX = BED.right - 228;
  let rackIndex = 0;
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      const number = RACK_ORDER[rackIndex];
      balls.push(buildRackBall(
        number,
        rackApexX + row * BALL_RADIUS * Math.sqrt(3),
        BED_CENTER_Y + (column - row / 2) * BALL_RADIUS * 2,
        rackIndex + 1,
      ));
      rackIndex += 1;
    }
  }
  return {
    balls,
    breakOpen: true,
    groups: { player: null, ai: null },
    shot: null,
    shotCount: 0,
  };
}

function getCue(world) {
  return world?.balls.find((ball) => ball.group === "cue") || null;
}

function getBall(world, id) {
  return world?.balls.find((ball) => ball.id === id) || null;
}

function countRemaining(world) {
  return world.balls.filter((ball) => ball.group !== "cue" && !ball.pocketed).length;
}

function countRemainingGroup(world, group) {
  if (!group) return 0;
  return world.balls.filter((ball) => ball.group === group && !ball.pocketed).length;
}

function pocketedInShot(world, group, shot) {
  return shot.pocketed.filter((entry) => {
    const ball = getBall(world, entry.ballId);
    return ball && ball.group === group;
  }).length;
}

function groupRemainingBeforeShot(world, group, shot) {
  if (!group) return 0;
  const pocketedIds = new Set(shot.pocketed.map((entry) => entry.ballId));
  return world.balls.filter((ball) => ball.group === group && (!ball.pocketed || pocketedIds.has(ball.id))).length;
}

function findPocketEntry(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  let best = null;
  let bestDistance = Infinity;
  for (const pocket of POCKETS) {
    const gap = distance(ball, pocket);
    if (gap >= POCKET_MOUTH_RADIUS || gap >= bestDistance) continue;
    const towardPocket = unit(pocket.x - ball.x, pocket.y - ball.y);
    if (!ball.inPocket && (speed < 1 || dot(unit(ball.vx, ball.vy), towardPocket) < -0.08)) continue;
    best = pocket;
    bestDistance = gap;
  }
  return best;
}

function markPocketed(world, ball, pocket) {
  if (ball.pocketed) return;
  ball.pocketed = true;
  ball.inPocket = false;
  ball.pocketId = pocket.id;
  ball.x = pocket.x;
  ball.y = pocket.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.sleepSteps = SLEEP_STEPS;
  if (world.shot) world.shot.pocketed.push({ ballId: ball.id, pocketId: pocket.id });
}

function registerFirstContact(world, first, second, relativeVelocity) {
  if (!world.shot || world.shot.firstContactId) return;
  const cue = first.group === "cue" ? first : second.group === "cue" ? second : null;
  const target = cue === first ? second : cue === second ? first : null;
  if (cue && target && target.group !== "cue" && relativeVelocity < 0) {
    world.shot.firstContactId = target.id;
  }
}

function registerRailTouch(world, ball, side) {
  if (world.shot?.firstContactId) world.shot.railTouches.add(`${ball.id}:${side}`);
}

function resolveWalls(world, ball) {
  if (ball.pocketed || ball.inPocket) return;
  if (ball.x - ball.r < BED.left && !isNearPocketOpening(ball)) {
    ball.x = BED.left + ball.r;
    if (ball.vx < 0) {
      ball.vx = -ball.vx * WALL_RESTITUTION;
      registerRailTouch(world, ball, "left");
    }
  }
  if (ball.x + ball.r > BED.right && !isNearPocketOpening(ball)) {
    ball.x = BED.right - ball.r;
    if (ball.vx > 0) {
      ball.vx = -ball.vx * WALL_RESTITUTION;
      registerRailTouch(world, ball, "right");
    }
  }
  if (ball.y - ball.r < BED.top && !isNearPocketOpening(ball)) {
    ball.y = BED.top + ball.r;
    if (ball.vy < 0) {
      ball.vy = -ball.vy * WALL_RESTITUTION;
      registerRailTouch(world, ball, "top");
    }
  }
  if (ball.y + ball.r > BED.bottom && !isNearPocketOpening(ball)) {
    ball.y = BED.bottom - ball.r;
    if (ball.vy > 0) {
      ball.vy = -ball.vy * WALL_RESTITUTION;
      registerRailTouch(world, ball, "bottom");
    }
  }
}

function deterministicNormal(a, b) {
  const seed = ((a.index + 1) * 17 + (b.index + 1) * 31) % 360;
  const angle = (seed * Math.PI) / 180;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function resolveBallCollision(world, first, second) {
  if (first.pocketed || second.pocketed || first.inPocket || second.inPocket) return;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const rawDistance = Math.hypot(dx, dy);
  const minimumDistance = first.r + second.r;
  if (rawDistance >= minimumDistance) return;

  const normal = rawDistance > 0.000001 ? { x: dx / rawDistance, y: dy / rawDistance } : deterministicNormal(first, second);
  const overlap = minimumDistance - rawDistance;
  first.x -= normal.x * overlap * 0.51;
  first.y -= normal.y * overlap * 0.51;
  second.x += normal.x * overlap * 0.51;
  second.y += normal.y * overlap * 0.51;

  const relativeVelocity = (second.vx - first.vx) * normal.x + (second.vy - first.vy) * normal.y;
  registerFirstContact(world, first, second, relativeVelocity);
  if (relativeVelocity >= 0) return;

  const impulse = -(1 + BALL_RESTITUTION) * relativeVelocity / 2;
  first.vx -= impulse * normal.x;
  first.vy -= impulse * normal.y;
  second.vx += impulse * normal.x;
  second.vy += impulse * normal.y;
  first.sleepSteps = 0;
  second.sleepSteps = 0;
}

function advancePocket(world, ball, subStep) {
  if (ball.pocketed) return;
  if (!ball.inPocket) {
    const pocket = findPocketEntry(ball);
    if (!pocket) return;
    ball.inPocket = true;
    ball.pocketId = pocket.id;
  }
  const pocket = getPocket(ball.pocketId);
  if (!pocket) return;
  const direction = unit(pocket.x - ball.x, pocket.y - ball.y);
  ball.vx = ball.vx * 0.86 + direction.x * 520 * subStep;
  ball.vy = ball.vy * 0.86 + direction.y * 520 * subStep;
  if (distance(ball, pocket) < POCKET_SINK_RADIUS) markPocketed(world, ball, pocket);
}

function stepWorld(world) {
  const subStep = PHYSICS_STEP / PHYSICS_SUBSTEPS;
  const friction = Math.pow(FRICTION_PER_SECOND, subStep);
  for (let subStepIndex = 0; subStepIndex < PHYSICS_SUBSTEPS; subStepIndex += 1) {
    for (const ball of world.balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * subStep;
      ball.y += ball.vy * subStep;
      ball.rotation += (Math.hypot(ball.vx, ball.vy) * subStep) / Math.max(ball.r, 1);
      advancePocket(world, ball, subStep);
    }

    for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
      for (const ball of world.balls) resolveWalls(world, ball);
      for (let firstIndex = 0; firstIndex < world.balls.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < world.balls.length; secondIndex += 1) {
          resolveBallCollision(world, world.balls[firstIndex], world.balls[secondIndex]);
        }
      }
    }

    for (const ball of world.balls) {
      if (ball.pocketed || ball.inPocket) continue;
      ball.vx *= friction;
      ball.vy *= friction;
      if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
        ball.sleepSteps += 1;
        if (ball.sleepSteps >= SLEEP_STEPS) {
          ball.vx = 0;
          ball.vy = 0;
        }
      } else {
        ball.sleepSteps = 0;
      }
    }
  }
}

function isWorldMoving(world) {
  return world.balls.some((ball) => !ball.pocketed && Math.hypot(ball.vx, ball.vy) > 0.05);
}

function findTargetOnRay(cue, direction, world) {
  let best = null;
  let bestDistance = Infinity;
  for (const ball of world.balls) {
    if (ball.group === "cue" || ball.pocketed || ball.inPocket) continue;
    const relativeX = ball.x - cue.x;
    const relativeY = ball.y - cue.y;
    const projection = relativeX * direction.x + relativeY * direction.y;
    if (projection <= 0) continue;
    const perpendicularSquared = relativeX * relativeX + relativeY * relativeY - projection * projection;
    const contactRadius = cue.r + ball.r;
    if (perpendicularSquared > contactRadius * contactRadius) continue;
    const offset = Math.sqrt(Math.max(0, contactRadius * contactRadius - perpendicularSquared));
    const hitDistance = projection - offset;
    if (hitDistance <= 0 || hitDistance >= bestDistance) continue;
    const collisionCue = { x: cue.x + direction.x * hitDistance, y: cue.y + direction.y * hitDistance };
    const normal = unit(ball.x - collisionCue.x, ball.y - collisionCue.y);
    best = {
      target: ball,
      collisionCue,
      normal,
      ghost: { x: ball.x - normal.x * contactRadius, y: ball.y - normal.y * contactRadius },
      distance: hitDistance,
    };
    bestDistance = hitDistance;
  }
  return best;
}

function choosePreviewPocket(target, normal, world) {
  let best = null;
  for (const pocket of POCKETS) {
    const toPocket = unit(pocket.x - target.x, pocket.y - target.y);
    const alignment = dot(normal, toPocket);
    if (alignment < 0.08) continue;
    if (!segmentClear(target, pocket, world, [target.id, "cue"], 1.5)) continue;
    const score = alignment * 240 - distance(target, pocket) * 0.12;
    if (!best || score > best.score) best = { pocket, score };
  }
  return best?.pocket || null;
}

function getAimPreview(cue, direction, world) {
  const hit = findTargetOnRay(cue, direction, world);
  if (!hit) return { target: null, pocket: null, ghost: null, normal: null };
  return {
    ...hit,
    pocket: choosePreviewPocket(hit.target, hit.normal, world),
  };
}

function getLegalTargets(world, shooter) {
  const assignedGroup = world.groups[shooter];
  if (assignedGroup) {
    const groupBalls = world.balls.filter((ball) => ball.group === assignedGroup && !ball.pocketed);
    if (groupBalls.length) return groupBalls;
    const eight = world.balls.find((ball) => ball.number === 8 && !ball.pocketed);
    return eight ? [eight] : [];
  }
  return world.balls.filter((ball) => ball.group === "solid" || ball.group === "stripe");
}

function estimateShotPower(totalDistance) {
  const requiredSpeed = totalDistance * FRICTION_RATE * 0.52 + 130;
  return clamp(requiredSpeed / MAX_SHOT_SPEED, 0.16, 0.96);
}

function chooseAiShot(world) {
  const cue = getCue(world);
  if (!cue || cue.pocketed) return null;
  const targets = getLegalTargets(world, "ai");
  const combinations = [];

  for (const target of targets) {
    for (const pocket of POCKETS) {
      const toPocket = unit(pocket.x - target.x, pocket.y - target.y);
      const ghost = {
        x: target.x - toPocket.x * (target.r + cue.r),
        y: target.y - toPocket.y * (target.r + cue.r),
      };
      if (!pointInsideBed(ghost, cue.r + 1)) continue;
      if (!segmentClear(cue, ghost, world, [cue.id, target.id], 1.6)) continue;
      if (!segmentClear(target, pocket, world, [cue.id, target.id], 1.8)) continue;
      const cueDistance = distance(cue, ghost);
      const objectDistance = distance(target, pocket);
      combinations.push({
        target,
        pocket,
        ghost,
        direction: unit(ghost.x - cue.x, ghost.y - cue.y),
        power: estimateShotPower(cueDistance + objectDistance * 0.82),
        score: cueDistance + objectDistance * 0.72 + (target.number === 8 ? -18 : 0),
      });
    }
  }

  if (combinations.length) {
    combinations.sort((left, right) => left.score - right.score);
    return combinations[0];
  }

  const visibleTargets = targets
    .filter((target) => segmentClear(cue, target, world, [cue.id, target.id], 1.6))
    .sort((left, right) => distance(cue, left) - distance(cue, right));
  const safetyTarget = visibleTargets[0] || targets[0];
  if (!safetyTarget) return null;
  return {
    target: safetyTarget,
    pocket: null,
    ghost: { x: safetyTarget.x, y: safetyTarget.y },
    direction: unit(safetyTarget.x - cue.x, safetyTarget.y - cue.y),
    power: estimateShotPower(distance(cue, safetyTarget) + 80),
    score: distance(cue, safetyTarget) + 999,
  };
}

function signedNoise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function applyAiError(plan, shotNumber) {
  const angle = signedNoise(shotNumber + 1) * AI_DIFFICULTY.angularError;
  const powerDelta = signedNoise(shotNumber + 7) * AI_DIFFICULTY.powerError;
  return {
    direction: rotate(plan.direction, angle),
    power: clamp(plan.power + powerDelta, 0.12, 1),
  };
}

function isValidCuePlacement(world, point, ignoredId = "cue") {
  if (!pointInsideBed(point, BALL_RADIUS + 1) || isNearPocketOpening({ ...point, r: BALL_RADIUS })) return false;
  return world.balls.every((ball) => ball.id === ignoredId || ball.pocketed || distance(point, ball) > BALL_RADIUS * 2 + 3);
}

function findFreeCuePosition(world, preferred, ignoredId = "cue") {
  const candidates = [
    preferred,
    { x: BED.left + 190, y: BED_CENTER_Y },
    { x: BED.left + 140, y: BED.top + 80 },
    { x: BED.left + 140, y: BED.bottom - 80 },
  ];
  for (let ring = 1; ring <= 12; ring += 1) {
    const radius = ring * 34;
    for (let spoke = 0; spoke < 16; spoke += 1) {
      const angle = (spoke / 16) * Math.PI * 2;
      candidates.push({
        x: clamp(preferred.x + Math.cos(angle) * radius, BED.left + BALL_RADIUS + 2, BED.right - BALL_RADIUS - 2),
        y: clamp(preferred.y + Math.sin(angle) * radius, BED.top + BALL_RADIUS + 2, BED.bottom - BALL_RADIUS - 2),
      });
    }
  }
  return candidates.find((candidate) => isValidCuePlacement(world, candidate, ignoredId)) || { x: BED.left + 190, y: BED_CENTER_Y };
}

function placeCue(world, preferred) {
  const cue = getCue(world);
  if (!cue) return null;
  const position = findFreeCuePosition(world, preferred || { x: BED.left + 190, y: BED_CENTER_Y });
  cue.x = position.x;
  cue.y = position.y;
  cue.vx = 0;
  cue.vy = 0;
  cue.pocketed = false;
  cue.inPocket = false;
  cue.pocketId = null;
  cue.sleepSteps = 0;
  return position;
}

function analyseShot(world) {
  const shot = world.shot;
  const shooter = shot.shooter;
  const opponent = shooter === "player" ? "ai" : "player";
  const groupsBefore = { ...world.groups };
  const cuePocketed = shot.pocketed.some((entry) => entry.ballId === "cue");
  const eightEntry = shot.pocketed.find((entry) => entry.ballId === "ball-8");
  const targetEntries = shot.pocketed.filter((entry) => entry.ballId !== "cue");
  let foulReason = null;

  if (!shot.firstContactId) foulReason = "A branca não encontrou uma bola.";
  if (cuePocketed) foulReason = "Falta: a branca caiu na caçapa.";

  if (shot.wasBreak) {
    if (eightEntry) {
      const eight = getBall(world, "ball-8");
      const position = findFreeCuePosition(world, { x: 808, y: BED_CENTER_Y }, "ball-8");
      Object.assign(eight, position, { vx: 0, vy: 0, pocketed: false, inPocket: false, pocketId: null, sleepSteps: 0 });
      world.breakOpen = false;
      return {
        outcome: null,
        reason: cuePocketed ? "A bola 8 foi recolocada. Falta: a branca caiu na quebra." : "A bola 8 caiu na quebra e foi recolocada na mesa.",
        foul: Boolean(foulReason),
        nextTurn: foulReason ? opponent : shooter,
        scoreForShooter: 0,
      };
    }
    const objectBallsOnRail = new Set([...shot.railTouches].map(touch => touch.split(":")[0]).filter(id => id !== "cue"));
    if (!foulReason && targetEntries.length === 0 && objectBallsOnRail.size < 4) {
      foulReason = "Falta na quebra: quatro bolas não tocaram a tabela.";
    }
  } else if (shot.firstContactId) {
    const firstBall = getBall(world, shot.firstContactId);
    const assignedGroup = groupsBefore[shooter];
    if (firstBall) {
      if (assignedGroup) {
        const ownRemainingBefore = groupRemainingBeforeShot(world, assignedGroup, shot);
        const legalFirstContact = ownRemainingBefore > 0
          ? firstBall.group === assignedGroup
          : firstBall.group === "eight";
        if (!legalFirstContact) foulReason = `Falta: toque primeiro na ${groupLabel(firstBall.group)}.`;
      } else if (firstBall.group === "eight") {
        foulReason = "Falta: a bola 8 ainda não está liberada.";
      }
    }
  }

  if (!shot.wasBreak && !foulReason && targetEntries.length === 0 && shot.railTouches.size === 0) {
    foulReason = "Falta: após o contato, uma bola precisa tocar a tabela ou cair na caçapa.";
  }

  if (eightEntry) {
    const assignedGroup = groupsBefore[shooter];
    const ownWasClear = assignedGroup && groupRemainingBeforeShot(world, assignedGroup, shot) === 0;
    const calledCorrectly = shot.calledPocketId && shot.calledPocketId === eightEntry.pocketId;
    const validEight = !shot.wasBreak && !foulReason && !cuePocketed && ownWasClear && calledCorrectly;
    world.breakOpen = false;
    return {
      outcome: validEight ? shooter : opponent,
      reason: validEight ? "A bola 8 caiu na caçapa chamada." : "A bola 8 caiu antes da hora ou na caçapa errada.",
      foul: !validEight,
      nextTurn: validEight ? shooter : opponent,
      scoreForShooter: validEight ? 1 : 0,
    };
  }

  if (foulReason) {
    world.breakOpen = false;
    return {
      outcome: null,
      reason: foulReason,
      foul: true,
      nextTurn: opponent,
      scoreForShooter: 0,
    };
  }

  if (!shot.wasBreak && !groupsBefore.player && !groupsBefore.ai && targetEntries.length) {
    const firstPocketedBall = getBall(world, targetEntries[0].ballId);
    if (firstPocketedBall && (firstPocketedBall.group === "solid" || firstPocketedBall.group === "stripe")) {
      world.groups = {
        player: shooter === "player" ? firstPocketedBall.group : otherGroup(firstPocketedBall.group),
        ai: shooter === "ai" ? firstPocketedBall.group : otherGroup(firstPocketedBall.group),
      };
    }
  }

  const shooterGroup = world.groups[shooter];
  const ownPocketed = shooterGroup ? pocketedInShot(world, shooterGroup, shot) : targetEntries.length;
  const shooterLabel = shooter === "player" ? "Você" : "A IA";
  world.breakOpen = false;
  return {
    outcome: null,
    reason: ownPocketed ? `${shooterLabel} encaçapou uma bola ${groupLabel(shooterGroup)}.` : "Nenhuma bola do seu grupo caiu.",
    foul: false,
    nextTurn: ownPocketed ? shooter : opponent,
    scoreForShooter: ownPocketed,
  };
}

function drawPocketShape(ctx, pocket) {
  ctx.save();
  const mouth = { x: clamp(pocket.x, BED.left, BED.right), y: clamp(pocket.y, BED.top, BED.bottom) };
  const angle = Math.atan2(mouth.y - pocket.y, mouth.x - pocket.x);
  const length = distance(pocket, mouth);
  ctx.translate(pocket.x, pocket.y);
  ctx.rotate(angle);
  // Rounded leather liner and a recessed throat aligned with the real pocket.
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length - 5, 0);
  ctx.strokeStyle = "#392e22";
  ctx.lineWidth = 55;
  ctx.stroke();
  ctx.strokeStyle = "#100f0c";
  ctx.lineWidth = 48;
  ctx.stroke();
  const hole = ctx.createRadialGradient(-4, 0, 2, 0, 0, 34);
  hole.addColorStop(0, "#000000");
  hole.addColorStop(0.65, "#030505");
  hole.addColorStop(1, "#17231a");
  ctx.strokeStyle = hole;
  ctx.lineWidth = 41;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 25, Math.PI * 0.65, Math.PI * 1.35);
  ctx.strokeStyle = "rgba(218,185,130,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function buildTableBackground() {
  const background = document.createElement("canvas");
  background.width = TABLE_W;
  background.height = TABLE_H;
  const ctx = background.getContext("2d");
  if (!ctx) return background;

  const outer = ctx.createLinearGradient(0, 0, TABLE_W, TABLE_H);
  outer.addColorStop(0, "#090d0c");
  outer.addColorStop(0.45, "#171b18");
  outer.addColorStop(1, "#050806");
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, TABLE_W, TABLE_H);

  roundedRectPath(ctx, 20, 18, TABLE_W - 40, TABLE_H - 36, 29);
  const wood = ctx.createLinearGradient(0, 12, TABLE_W, TABLE_H);
  wood.addColorStop(0, "#754425");
  wood.addColorStop(0.22, "#392215");
  wood.addColorStop(0.58, "#6b3b1f");
  wood.addColorStop(1, "#1d110b");
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.save();
  roundedRectPath(ctx, 20, 18, TABLE_W - 40, TABLE_H - 36, 29);
  ctx.clip();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "#f4c17a";
  ctx.lineWidth = 1;
  for (let index = -20; index < 150; index += 1) {
    const y = 25 + index * 4.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(330, y + Math.sin(index) * 8, 760, y - Math.cos(index * 0.7) * 10, TABLE_W, y + Math.sin(index * 0.2) * 8);
    ctx.stroke();
  }
  ctx.restore();

  roundedRectPath(ctx, BED.left - 17, BED.top - 17, BED.right - BED.left + 34, BED.bottom - BED.top + 34, 15);
  const cushion = ctx.createLinearGradient(0, BED.top - 20, 0, BED.bottom + 20);
  cushion.addColorStop(0, "#154f37");
  cushion.addColorStop(0.48, "#0b3124");
  cushion.addColorStop(1, "#08251a");
  ctx.fillStyle = cushion;
  ctx.fill();
  ctx.strokeStyle = "rgba(229,194,131,0.28)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  roundedRectPath(ctx, BED.left, BED.top, BED.right - BED.left, BED.bottom - BED.top, 7);
  const felt = ctx.createRadialGradient(TABLE_W / 2, 170, 20, TABLE_W / 2, BED_CENTER_Y, 620);
  felt.addColorStop(0, "#1a8b5b");
  felt.addColorStop(0.52, "#0e5f3d");
  felt.addColorStop(1, "#062c1d");
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.save();
  roundedRectPath(ctx, BED.left, BED.top, BED.right - BED.left, BED.bottom - BED.top, 7);
  ctx.clip();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let x = -TABLE_H; x < TABLE_W; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, BED.top);
    ctx.lineTo(x + TABLE_H, BED.bottom);
    ctx.stroke();
  }
  ctx.restore();

  drawSurface(ctx, BED.left, BED.top, BED.right - BED.left, BED.bottom - BED.top, "felt");
  ctx.strokeStyle = "rgba(0,0,0,0.34)";
  ctx.lineWidth = 5;
  ctx.strokeRect(BED.left + 2, BED.top + 2, BED.right - BED.left - 4, BED.bottom - BED.top - 4);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.strokeRect(BED.left + 7, BED.top + 7, BED.right - BED.left - 14, BED.bottom - BED.top - 14);

  ctx.fillStyle = "rgba(253,230,138,0.65)";
  const diamond = (x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let index = 1; index < 8; index += 1) {
    if (index === 4) continue;
    const x = BED.left + (index / 8) * (BED.right - BED.left);
    diamond(x, BED.top - 28, 3.2);
    diamond(x, BED.bottom + 28, 3.2);
  }
  for (let index = 1; index < 4; index += 1) {
    const y = BED.top + (index / 4) * (BED.bottom - BED.top);
    diamond(BED.left - 28, y, 3.2);
    diamond(BED.right + 28, y, 3.2);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(BED.left + 190, BED.top + 6);
  ctx.lineTo(BED.left + 190, BED.bottom - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(BED.left + 190, BED_CENTER_Y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();

  ctx.fillStyle = "rgba(255,240,204,0.58)";
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("ARENA 8-BALL", 38, 42);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,240,204,0.35)";
  ctx.fillText("FELT / PRECISION TABLE", TABLE_W - 38, 42);
  ctx.textAlign = "left";

  for (const pocket of POCKETS) drawPocketShape(ctx, pocket);
  return background;
}

function drawBall(ctx, ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const opacity = ball.inPocket ? clamp(1 - distance(ball, getPocket(ball.pocketId) || ball) / POCKET_MOUTH_RADIUS, 0.25, 0.86) : 1;
  ctx.save();
  ctx.globalAlpha = opacity;
  const shadowOffset = Math.min(8, 3 + speed * 0.004);
  ctx.beginPath();
  ctx.ellipse(ball.x + shadowOffset, ball.y + shadowOffset, ball.r * 0.95, ball.r * 0.66, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.filter = "blur(2px)";
  ctx.fill();
  ctx.filter = "none";

  const gradient = ctx.createRadialGradient(ball.x - ball.r * 0.4, ball.y - ball.r * 0.48, 1, ball.x, ball.y, ball.r * 1.15);
  if (ball.group === "cue") {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.36, "#f7f5eb");
    gradient.addColorStop(0.86, "#d7d8d0");
    gradient.addColorStop(1, "#929797");
  } else if (ball.group === "stripe") {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.3, "#fbfaf3");
    gradient.addColorStop(0.82, "#dedfd7");
    gradient.addColorStop(1, "#8e9390");
  } else {
    gradient.addColorStop(0, ball.light);
    gradient.addColorStop(0.15, ball.fill);
    gradient.addColorStop(0.78, ball.fill);
    gradient.addColorStop(1, ball.dark);
  }
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  if (ball.group === "stripe") {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, ball.r - 0.2, 0, Math.PI * 2);
    ctx.clip();
    const stripe = ctx.createLinearGradient(0, -ball.r * 0.58, 0, ball.r * 0.58);
    stripe.addColorStop(0, `${ball.dark}cc`);
    stripe.addColorStop(0.2, ball.fill);
    stripe.addColorStop(0.5, ball.light);
    stripe.addColorStop(0.8, ball.fill);
    stripe.addColorStop(1, `${ball.dark}cc`);
    ctx.fillStyle = stripe;
    ctx.fillRect(-ball.r, -ball.r * 0.38, ball.r * 2, ball.r * 0.76);
    ctx.restore();
  }

  ctx.lineWidth = 1.25;
  ctx.strokeStyle = ball.dark;
  ctx.stroke();
  if (ball.number > 0) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.fillStyle = "#11151b";
    ctx.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ball.number, ball.x, ball.y + 0.4);
  } else {
    ctx.beginPath();
    ctx.arc(ball.x + 3, ball.y + 3, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(55,95,135,0.68)";
    ctx.fill();
  }

  const highlight = ctx.createRadialGradient(ball.x - ball.r * 0.43, ball.y - ball.r * 0.48, 0, ball.x - ball.r * 0.43, ball.y - ball.r * 0.48, ball.r * 0.4);
  highlight.addColorStop(0, "rgba(255,255,255,0.78)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(ball.x - ball.r * 0.4, ball.y - ball.r * 0.45, ball.r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = highlight;
  ctx.fill();
  ctx.restore();
}

function drawCueStick(ctx, cue, direction, power) {
  const gap = 18 + power * 50;
  const length = 270;
  const tip = { x: cue.x - direction.x * gap, y: cue.y - direction.y * gap };
  const butt = { x: cue.x - direction.x * (gap + length), y: cue.y - direction.y * (gap + length) };
  const perpendicular = { x: -direction.y, y: direction.x };
  ctx.save();
  const wood = ctx.createLinearGradient(tip.x, tip.y, butt.x, butt.y);
  wood.addColorStop(0, "#f2d8a4");
  wood.addColorStop(0.14, "#c88a3d");
  wood.addColorStop(0.7, "#75461d");
  wood.addColorStop(1, "#281509");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(tip.x + perpendicular.x * 2.2, tip.y + perpendicular.y * 2.2);
  ctx.lineTo(butt.x + perpendicular.x * 7, butt.y + perpendicular.y * 7);
  ctx.lineTo(butt.x - perpendicular.x * 7, butt.y - perpendicular.y * 7);
  ctx.lineTo(tip.x - perpendicular.x * 2.2, tip.y - perpendicular.y * 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,225,164,0.32)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#e8e9e0";
  ctx.fillRect(tip.x - direction.x * 11 - perpendicular.x * 2.4, tip.y - direction.y * 11 - perpendicular.y * 2.4, 4.8, 4.8);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = "#4c79a8";
  ctx.fill();
  ctx.restore();
}

function drawPocketCandidate(ctx, pocket) {
  if (!pocket) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(pocket.x, pocket.y, 37, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(251,191,36,0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(pocket.x, pocket.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fde68a";
  ctx.fill();
  ctx.restore();
}

function drawAimPreview(ctx, aim) {
  const preview = aim.preview;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(226,255,240,0.82)";
  ctx.lineWidth = 1.7;
  const cueGuideEnd = preview.ghost || {
    x: aim.anchor.x + aim.dir.x * (120 + aim.power * 240),
    y: aim.anchor.y + aim.dir.y * (120 + aim.power * 240),
  };
  ctx.beginPath();
  ctx.moveTo(aim.anchor.x, aim.anchor.y);
  ctx.lineTo(cueGuideEnd.x, cueGuideEnd.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (preview.target && preview.ghost && preview.normal) {
    ctx.beginPath();
    ctx.arc(preview.ghost.x, preview.ghost.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const postImpact = {
      x: preview.target.x + preview.normal.x * 155,
      y: preview.target.y + preview.normal.y * 155,
    };
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "rgba(251,191,36,0.9)";
    ctx.beginPath();
    ctx.moveTo(preview.target.x, preview.target.y);
    ctx.lineTo(postImpact.x, postImpact.y);
    ctx.stroke();
    if (preview.pocket) {
      ctx.strokeStyle = "rgba(253,230,138,0.45)";
      ctx.beginPath();
      ctx.moveTo(preview.target.x, preview.target.y);
      ctx.lineTo(preview.pocket.x, preview.pocket.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawPocketCandidate(ctx, preview.pocket);
  }
  ctx.restore();
}

export default function Sinuca() {
  const { refreshBalance, user, authReady } = useOutletContext() || {};
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [bet, setBet] = useState(50);
  const [opponentMode, setOpponentMode] = useState("bot");
  const [opponent, setOpponent] = useState(BOT_OPPONENT);
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState(null);
  const [turn, setTurn] = useState("player");
  const [groups, setGroups] = useState({ player: null, ai: null });
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [ballsRemaining, setBallsRemaining] = useState(15);
  const [aiThinking, setAiThinking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [ballInHand, setBallInHand] = useState(false);
  const [powerPct, setPowerPct] = useState(0);
  const [message, setMessage] = useState("Quebra inicial: puxe a branca para trás e solte para abrir a partida.");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const worldRef = useRef(null);
  const matchRef = useRef(null);
  const configRef = useRef(null);
  const betRef = useRef(50);
  const turnRef = useRef("player");
  const opponentRef = useRef(BOT_OPPONENT);
  opponentRef.current = opponent;
  const resultRef = useRef(null);
  const resolvingRef = useRef(false);
  const mountedRef = useRef(true);
  const animatingRef = useRef(false);
  const physicsTimerRef = useRef(null);
  const aiTimerRef = useRef(null);
  const lastTickRef = useRef(0);
  const accumulatorRef = useRef(0);
  const aimRef = useRef(null);
  const placementRef = useRef(null);
  const ballInHandRef = useRef(false);
  const aiShotNumberRef = useRef(0);
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    tableTransform(ctx, canvas, TABLE_W, TABLE_H);
    ctx.clearRect(0, 0, TABLE_W, TABLE_H);
    if (!backgroundRef.current) backgroundRef.current = buildTableBackground();
    ctx.drawImage(backgroundRef.current, 0, 0, TABLE_W, TABLE_H);

    const world = worldRef.current;
    if (!world) return;
    world.balls.filter((ball) => ball.group !== "cue" && !ball.pocketed).forEach((ball) => drawBall(ctx, ball));
    const cue = getCue(world);
    if (cue && !cue.pocketed) drawBall(ctx, cue);

    if (matchRef.current && !resultRef.current && canControlTurn(turnRef.current, opponentRef.current) && !animatingRef.current && cue) {
      if (aimRef.current) {
        drawAimPreview(ctx, aimRef.current);
        drawCueStick(ctx, cue, aimRef.current.dir, aimRef.current.power);
      } else if (!ballInHandRef.current) {
        drawCueStick(ctx, cue, { x: 1, y: 0 }, 0);
        ctx.beginPath();
        ctx.arc(cue.x, cue.y, TOUCH_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(cue.x, cue.y, TOUCH_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(253,230,138,0.92)";
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const [currentBalance, houseConfig] = await Promise.all([getBalance(), getHouseConfig()]);
        if (!mountedRef.current) return;
        setBalance(currentBalance);
        setConfig(houseConfig);
        configRef.current = houseConfig;
        if (50 < houseConfig.min_bet) setBet(houseConfig.min_bet);
      } catch (cause) {
        if (mountedRef.current) setError(cause.message || "Não foi possível carregar a carteira.");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      const activeMatch = matchRef.current;
      mountedRef.current = false;
      if (physicsTimerRef.current) clearTimeout(physicsTimerRef.current);
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      physicsTimerRef.current = null;
      aiTimerRef.current = null;
      animatingRef.current = false;
      aimRef.current = null;
      placementRef.current = null;
      if (activeMatch && !resultRef.current && !resolvingRef.current) {
        void abandonMatch(activeMatch, "Você saiu da partida.").catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (result?.outcome === "win") {
      confetti({ particleCount: 130, spread: 78, origin: { y: 0.6 }, colors: ["#34d399", "#fbbf24", "#ffffff"] });
    }
  }, [result]);

  useEffect(() => {
    if (!match) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const syncCanvas = () => {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, rect.width || parentRect?.width || TABLE_W);
      const cssHeight = rect.height || cssWidth * TABLE_H / TABLE_W;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      draw();
    };
    syncCanvas();
    window.addEventListener("resize", syncCanvas);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncCanvas) : null;
    if (observer) observer.observe(canvas.parentElement || canvas);
    return () => {
      window.removeEventListener("resize", syncCanvas);
      observer?.disconnect();
    };
  }, [match, draw]);

  useEffect(() => {
    draw();
  }, [draw, match, turn, groups, playerScore, aiScore, ballsRemaining, aiThinking, moving, ballInHand, powerPct, result, message]);

  function finish(outcome, reason) {
    if (resolvingRef.current || !matchRef.current || !mountedRef.current) return;
    resolvingRef.current = true;
    animatingRef.current = false;
    if (physicsTimerRef.current) clearTimeout(physicsTimerRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    physicsTimerRef.current = null;
    aiTimerRef.current = null;
    setMoving(false);
    setAiThinking(false);

    const wager = betRef.current;
    const rake = (configRef.current?.rake_percent || 0) / 100;
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

    (async () => {
      try {
        const newBalance = await settleMatch(matchRef.current, status, payout, houseCut);
        if (!mountedRef.current) return;
        const finalResult = {
          outcome,
          reason,
          payout,
          houseCut,
          bet: wager,
          score: { player: playerScoreRef.current, ai: aiScoreRef.current },
        };
        resultRef.current = finalResult;
        setBalance(newBalance);
        refreshBalance?.();
        setResult(finalResult);
      } catch (cause) {
        resolvingRef.current = false;
        if (mountedRef.current) setError(cause.message || "Não foi possível liquidar a partida.");
      }
    })();
  }

  function runPhysics() {
    physicsTimerRef.current = null;
    if (!mountedRef.current || !animatingRef.current || !worldRef.current || resultRef.current) return;
    const now = performance.now();
    const elapsed = lastTickRef.current ? Math.min(now - lastTickRef.current, 250) : 16;
    lastTickRef.current = now;
    accumulatorRef.current += elapsed / 1000;
    let steps = 0;
    while (accumulatorRef.current >= PHYSICS_STEP && steps < MAX_CATCH_UP_STEPS) {
      stepWorld(worldRef.current);
      accumulatorRef.current -= PHYSICS_STEP;
      steps += 1;
    }
    if (steps >= MAX_CATCH_UP_STEPS && accumulatorRef.current >= PHYSICS_STEP) accumulatorRef.current = PHYSICS_STEP * 0.5;
    draw();
    if (isWorldMoving(worldRef.current)) {
      physicsTimerRef.current = setTimeout(runPhysics, 8);
      return;
    }
    animatingRef.current = false;
    accumulatorRef.current = 0;
    lastTickRef.current = 0;
    setMoving(false);
    handleShotEnd();
  }

  function fireShot(shooter, direction, power, calledPocketId = null) {
    const world = worldRef.current;
    const cue = getCue(world);
    if (!mountedRef.current || !world || !cue || cue.pocketed || animatingRef.current || resultRef.current || resolvingRef.current) return;
    if (turnRef.current !== shooter || ballInHandRef.current) return;
    const dir = unit(direction.x, direction.y);
    const shotPower = clamp(power, 0.08, 1);
    world.shot = {
      shooter,
      wasBreak: world.breakOpen,
      calledPocketId,
      firstContactId: null,
      pocketed: [],
      railTouches: new Set(),
    };
    world.shotCount += 1;
    cue.vx = dir.x * MAX_SHOT_SPEED * shotPower;
    cue.vy = dir.y * MAX_SHOT_SPEED * shotPower;
    cue.sleepSteps = 0;
    aimRef.current = null;
    setPowerPct(0);
    setMoving(true);
    setAiThinking(false);
    setMessage(`${sideLabel(shooter, opponentRef.current)} executa a tacada...`);
    animatingRef.current = true;
    accumulatorRef.current = PHYSICS_STEP;
    lastTickRef.current = performance.now() - 16;
    if (physicsTimerRef.current) clearTimeout(physicsTimerRef.current);
    physicsTimerRef.current = setTimeout(runPhysics, 8);
  }

  function handleShotEnd() {
    const world = worldRef.current;
    if (!world || !world.shot || resolvingRef.current || !mountedRef.current) return;
    const shooter = world.shot.shooter;
    const resolution = analyseShot(world);
    const cue = getCue(world);
    const score = resolution.scoreForShooter || 0;
    if (shooter === "player") {
      playerScoreRef.current += score;
      setPlayerScore(playerScoreRef.current);
    } else {
      aiScoreRef.current += score;
      setAiScore(aiScoreRef.current);
    }
    setBallsRemaining(countRemaining(world));
    setGroups({ ...world.groups });
    world.shot = null;

    if (resolution.outcome) {
      finish(resolution.outcome === "player" ? "win" : "lose", resolution.reason);
      return;
    }

    if (cue?.pocketed || resolution.foul) {
      placeCue(world, { x: BED.left + 190, y: BED_CENTER_Y });
    }
    const nextTurn = resolution.nextTurn;
    const hand = Boolean(resolution.foul);
    ballInHandRef.current = hand;
    setBallInHand(hand);
    turnRef.current = nextTurn;
    setTurn(nextTurn);
    const nextTurnMessage = nextTurn === shooter
      ? `${sideLabel(shooter, opponentRef.current)} continua.`
      : `Vez de ${sideLabel(nextTurn, opponentRef.current)}.`;
    setMessage(resolution.foul
      ? `${resolution.reason} A vez troca e a branca fica livre.`
      : `${resolution.reason} ${nextTurnMessage}`);
    if (nextTurn === "ai" && !isHumanOpponent(opponentRef.current)) scheduleAiShot();
  }

  function scheduleAiShot() {
    if (isHumanOpponent(opponentRef.current)) return;
    if (!mountedRef.current || !matchRef.current || resultRef.current || turnRef.current !== "ai" || animatingRef.current || resolvingRef.current) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setAiThinking(true);
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null;
      if (!mountedRef.current || !worldRef.current || resultRef.current || turnRef.current !== "ai" || animatingRef.current) return;
      const world = worldRef.current;
      const cue = getCue(world);
      if (!cue) return;
      if (ballInHandRef.current) {
        const target = getLegalTargets(world, "ai")[0];
        placeCue(world, target ? { x: target.x - 170, y: target.y } : { x: BED.left + 190, y: BED_CENTER_Y });
        ballInHandRef.current = false;
        setBallInHand(false);
      }
      const plan = chooseAiShot(world);
      if (!plan) {
        setAiThinking(false);
        turnRef.current = "player";
        setTurn("player");
        setMessage("A IA não encontrou uma linha livre. A mesa volta para você.");
        return;
      }
      const shot = applyAiError(plan, aiShotNumberRef.current);
      aiShotNumberRef.current += 1;
      setAiThinking(false);
      setMessage(`IA: bola ${plan.target.number} mirando ${plan.pocket?.label || "uma jogada de segurança"}.`);
      fireShot("ai", shot.direction, shot.power, plan.pocket?.id || null);
    }, 820);
  }

  function toCanvasPoint(event) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const point = tablePoint(rect, event.clientX, event.clientY, TABLE_W, TABLE_H);
    return { x: clamp(point.x, 0, TABLE_W), y: clamp(point.y, 0, TABLE_H) };
  }

  function releasePointer(event) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onPointerDown(event) {
    if (aimRef.current || placementRef.current) return;
    if (event.button !== 0 || !matchRef.current || resultRef.current || animatingRef.current || aiThinking || resolvingRef.current || !canControlTurn(turnRef.current, opponentRef.current)) return;
    const world = worldRef.current;
    const cue = getCue(world);
    if (!cue || cue.pocketed) return;
    const point = toCanvasPoint(event);
    const rect = canvasRef.current.getBoundingClientRect();
    const cssScale = rect.width / (rect.height > rect.width ? TABLE_H : TABLE_W);
    const hitRadius = Math.max(TOUCH_RADIUS, 22 / Math.max(cssScale, 0.01));
    if (distance(point, cue) > hitRadius) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (ballInHandRef.current) {
      placementRef.current = {
        pointerId: event.pointerId,
        previous: { x: cue.x, y: cue.y },
        valid: true,
      };
      return;
    }
    const direction = unit(cue.x - point.x, cue.y - point.y);
    aimRef.current = {
      pointerId: event.pointerId,
      anchor: { x: cue.x, y: cue.y },
      point,
      dir: direction,
      power: 0,
      preview: getAimPreview(cue, direction, world),
    };
    setPowerPct(0);
    draw();
  }

  function onPointerMove(event) {
    if ((placementRef.current || aimRef.current)?.pointerId !== event.pointerId) return;
    const world = worldRef.current;
    const cue = getCue(world);
    if (!world || !cue || !matchRef.current || resultRef.current || !canControlTurn(turnRef.current, opponentRef.current)) return;
    const point = toCanvasPoint(event);
    if (placementRef.current) {
      cue.x = clamp(point.x, BED.left + BALL_RADIUS + 2, BED.right - BALL_RADIUS - 2);
      cue.y = clamp(point.y, BED.top + BALL_RADIUS + 2, BED.bottom - BALL_RADIUS - 2);
      placementRef.current.valid = isValidCuePlacement(world, cue);
      draw();
      return;
    }
    if (!aimRef.current || animatingRef.current) return;
    const pullX = aimRef.current.anchor.x - point.x;
    const pullY = aimRef.current.anchor.y - point.y;
    const direction = unit(pullX, pullY);
    const power = clamp(Math.hypot(pullX, pullY) / PULL_MAX, 0, 1);
    aimRef.current = {
      ...aimRef.current,
      point,
      dir: direction,
      power,
      preview: getAimPreview(cue, direction, world),
    };
    setPowerPct(Math.round(power * 100));
    draw();
  }

  function onPointerUp(event) {
    if ((placementRef.current || aimRef.current)?.pointerId !== event.pointerId) return;
    if (placementRef.current) {
      const placement = placementRef.current;
      placementRef.current = null;
      releasePointer(event);
      const cue = getCue(worldRef.current);
      if (cue && !placement.valid) {
        cue.x = placement.previous.x;
        cue.y = placement.previous.y;
        setMessage("Essa posição está ocupada. Arraste a branca para um espaço livre.");
      } else {
        ballInHandRef.current = false;
        setBallInHand(false);
        setMessage("Branca posicionada. Agora mire e solte para tacar.");
      }
      draw();
      return;
    }
    const aim = aimRef.current;
    if (!aim) return;
    aimRef.current = null;
    releasePointer(event);
    setPowerPct(0);
    if (!matchRef.current || resultRef.current || animatingRef.current || !canControlTurn(turnRef.current, opponentRef.current) || aim.power < 0.08) {
      draw();
      return;
    }
    fireShot(turnRef.current, aim.dir, aim.power, aim.preview?.pocket?.id || null);
  }

  function onPointerCancel(event) {
    if ((placementRef.current || aimRef.current)?.pointerId !== event.pointerId) return;
    const placement = placementRef.current;
    if (placement) {
      const cue = getCue(worldRef.current);
      if (cue) {
        cue.x = placement.previous.x;
        cue.y = placement.previous.y;
      }
      placementRef.current = null;
    }
    aimRef.current = null;
    setPowerPct(0);
    releasePointer(event);
    draw();
  }

  async function startMatch(nextOpponent = opponent) {
    setError("");
    const wager = Number(bet);
    const min = config?.min_bet ?? 10;
    const max = config?.max_bet ?? 1000;
    if (!Number.isFinite(wager) || wager < min) {
      setError(`Aposta mínima: ${min}`);
      return;
    }
    if (wager > max) {
      setError(`Aposta máxima: ${max}`);
      return;
    }
    if (balance < wager) {
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
      const newMatch = await placeBet(wager, "sinuca");
      if (!mountedRef.current) {
        void abandonMatch(newMatch, "A partida foi interrompida antes de abrir.").catch(() => {});
        return;
      }
      const world = createWorld();
      worldRef.current = world;
      matchRef.current = newMatch;
      betRef.current = wager;
      resultRef.current = null;
      resolvingRef.current = false;
      turnRef.current = "player";
      ballInHandRef.current = false;
      playerScoreRef.current = 0;
      aiScoreRef.current = 0;
      aiShotNumberRef.current = 0;
      aimRef.current = null;
      placementRef.current = null;
      animatingRef.current = false;
      setMatch(newMatch);
      setResult(null);
      setTurn("player");
      setGroups({ player: null, ai: null });
      setPlayerScore(0);
      setAiScore(0);
      setBallsRemaining(15);
      setAiThinking(false);
      setMoving(false);
      setBallInHand(false);
      setPowerPct(0);
      setMessage("Quebra inicial: puxe a branca para trás e solte para abrir a partida.");
      const currentBalance = await getBalance();
      if (!mountedRef.current) return;
      setBalance(currentBalance);
      refreshBalance?.();
    } catch (cause) {
      if (mountedRef.current) setError(cause.message || "Erro ao iniciar a partida.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function reset() {
    const activeMatch = matchRef.current;
    if (activeMatch && !resultRef.current && !resolvingRef.current) {
      void abandonMatch(activeMatch, "Você reiniciou a partida.").catch(() => {});
    }
    if (physicsTimerRef.current) clearTimeout(physicsTimerRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    physicsTimerRef.current = null;
    aiTimerRef.current = null;
    animatingRef.current = false;
    resolvingRef.current = false;
    matchRef.current = null;
    resultRef.current = null;
    worldRef.current = null;
    aimRef.current = null;
    placementRef.current = null;
    turnRef.current = "player";
    ballInHandRef.current = false;
    setMatch(null);
    setResult(null);
    setError("");
    setTurn("player");
    setGroups({ player: null, ai: null });
    setPlayerScore(0);
    setAiScore(0);
    setBallsRemaining(15);
    setAiThinking(false);
    setMoving(false);
    setBallInHand(false);
    setPowerPct(0);
    setMessage("Quebra inicial: puxe a branca para trás e solte para abrir a partida.");
    (async () => {
      try {
        const currentBalance = await getBalance();
        if (mountedRef.current) setBalance(currentBalance);
      } catch {
        // A tela de aposta continua utilizável mesmo se a carteira local falhar.
      }
    })();
  }

  if (!authReady || loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>;
  }
  if (!user) return <LoginGate user={user} title="Entre para jogar Sinuca" />;

  if (!match) {
    const rake = (config?.rake_percent || 0) / 100;
    const projectedPrize = 2 * Number(bet || 0) * (1 - rake);
    return (
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar ao lobby
        </Link>
        <div className="card-glow rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-[#0d261d] via-[#101713] to-[#080c0a] p-5 sm:p-8">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/30 to-emerald-900/20 text-3xl ring-1 ring-emerald-200/20 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-1 rounded-xl bg-black/25" />
            <CircleDot className="relative h-9 w-9 text-emerald-200" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/60">Mesa de precisão</div>
          <h1 className="mt-1 font-display text-2xl font-bold">Pool 8-ball</h1>
          <p className="mt-1 text-sm text-white/55">Quebre o rack, defina seu grupo e limpe a mesa antes de chamar a bola 8. Bot ArenaBet ou adversário online.</p>

          <div className="mt-6">
            <OpponentSelect
              value={opponentMode}
              onChange={(mode) => {
                setOpponentMode(mode);
                setOpponent(BOT_OPPONENT);
              }}
            />
          </div>

          <div className="mt-6 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Seu saldo</span><span className="font-medium">{formatMoney(balance)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Comissão da casa</span><span className="text-emerald-300">{config?.rake_percent}%</span></div>
            <div className="flex justify-between"><span className="text-white/50">Retorno se vencer</span><span className="text-amber-300">{formatMoney(projectedPrize)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Empate</span><span className="text-white/70">aposta devolvida</span></div>
          </div>

          <label className="mb-2 mt-6 block text-sm text-white/60" htmlFor="sinuca-bet">Valor da aposta</label>
          <input
            id="sinuca-bet"
            type="number"
            value={bet}
            min={config?.min_bet}
            max={config?.max_bet}
            onChange={(event) => setBet(Number(event.target.value))}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-emerald-400/50"
          />
          <div className="mt-2 flex gap-2">
            {[50, 100, 250, 500].map((value) => (
              <button key={value} onClick={() => setBet(value)} className={`flex-1 rounded-lg border py-2 text-sm transition ${bet === value ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100 shadow-sm" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                {value}
              </button>
            ))}
          </div>
          {error && <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          <button
            onClick={() => startMatch(opponentMode === "bot" ? BOT_OPPONENT : opponent)}
            disabled={busy || balance == null || balance < Number(bet)}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C9A227] font-semibold text-[#14110A] transition hover:bg-[#E0C35A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {busy ? "Preparando a mesa..." : opponentMode === "online" ? `Procurar adversário · ${formatMoney(bet)} créditos` : `Iniciar partida · ${formatMoney(bet)} créditos`}
          </button>
        </div>
        {searching && user && (
          <MatchmakingPanel
            game="sinuca"
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

  const world = worldRef.current;
  const playerRemaining = world ? countRemainingGroup(world, groups.player) : 0;
  const aiRemaining = world ? countRemainingGroup(world, groups.ai) : 0;
  const aimPocket = aimRef.current?.preview?.pocket;
  const statusText = moving
    ? "Bolas em movimento"
    : aiThinking
      ? `${sideLabel("ai", opponent)} pensando`
      : ballInHand
        ? "Branca em mãos"
        : `Vez de ${sideLabel(turn, opponent)}`;

  const compactHud = (
    <div className="grid grid-cols-2 gap-2 lg:hidden">
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/65">Você</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-emerald-200">{playerScore}</div>
        <div className="text-[10px] text-white/45">{groups.player ? `${groupLabel(groups.player)} · ${playerRemaining} restantes` : "mesa aberta"}</div>
      </div>
      <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-rose-200/65">IA</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-rose-200">{aiScore}</div>
        <div className="text-[10px] text-white/45">{groups.ai ? `${groupLabel(groups.ai)} · ${aiRemaining} restantes` : "mesa aberta"}</div>
      </div>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </Link>
          <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${turn === "player" && !moving ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/60"}`}>
            {aiThinking ? <BrainCircuit className="h-4 w-4 animate-pulse" /> : <CircleDot className="h-4 w-4" />}
            {statusText}
          </div>
        </div>
        <div className="mb-3">{compactHud}</div>

        <div className="rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-[#4a2c18] via-[#21150d] to-[#0b0e0c] p-2 shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] sm:p-3">
          <canvas
            ref={canvasRef}
            width={TABLE_W}
            height={TABLE_H}
            aria-label="Mesa de pool 8-ball. Toque na área da bola branca, arraste para trás para mirar e solte para tacar."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            className="precision-canvas block h-auto w-full touch-none select-none rounded-xl shadow-inner ring-1 ring-white/10"
            style={{ "--table-width": TABLE_W, "--table-height": TABLE_H }}
          />
        </div>

        <div className="mt-2 flex min-h-[58px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
          <Gauge className="h-4 w-4 shrink-0 text-amber-200/80" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span>{ballInHand ? "Arraste a branca para um espaço livre" : aimPocket ? `Caçapa chamada: ${aimPocket.label}` : "Força da tacada"}</span>
              <span className="font-semibold tabular-nums text-amber-200">{powerPct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/35 ring-1 ring-white/10">
              <div className="h-full bg-gradient-to-r from-emerald-400 via-lime-300 to-amber-400 transition-[width]" style={{ width: `${powerPct}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-2 min-h-[40px] rounded-xl border border-emerald-300/10 bg-emerald-400/[0.045] px-3 py-2 text-xs leading-relaxed text-emerald-100/70" role="note">
          {message}
        </div>
      </section>

      <aside className="hidden space-y-4 lg:block">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-white/40">Placar da mesa</div>
            <div className="inline-flex items-center gap-1.5 text-xs text-amber-200/70"><Coins className="h-3.5 w-3.5" /> {formatMoney(match.bet_amount)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
              <div className="text-xs text-emerald-200/70">Você</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-200">{playerScore}</div>
              <div className="mt-1 text-[11px] text-white/40">{groups.player ? `${groupLabel(groups.player)} · ${playerRemaining}` : "mesa aberta"}</div>
            </div>
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
              <div className="text-xs text-rose-200/70">IA</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-rose-200">{aiScore}</div>
              <div className="mt-1 text-[11px] text-white/40">{groups.ai ? `${groupLabel(groups.ai)} · ${aiRemaining}` : "mesa aberta"}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="text-white/45">Bolas na mesa</span>
            <span className="font-semibold tabular-nums text-white">{ballsRemaining} + branca</span>
          </div>
          <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${aiThinking ? "border-rose-300/25 bg-rose-400/10 text-rose-100" : "border-white/10 bg-black/10 text-white/60"}`}>
            {aiThinking ? <BrainCircuit className="h-4 w-4 animate-pulse" /> : <Target className="h-4 w-4" />}
            {aiThinking ? "Calculando bola, caçapa e ponto fantasma..." : `${sideLabel(turn, opponent)} · mire pela branca`}
          </div>
        </div>

        <div className="glass rounded-2xl p-5 text-sm text-white/55">
          <div className="mb-3 font-medium text-white/85">Regras rápidas</div>
          <ul className="list-inside list-disc space-y-2">
            <li>Quebra com rack triangular tangente; o primeiro encaçapamento define lisas ou listradas.</li>
            <li>Encaçape seu grupo para continuar. Falta troca a vez e libera a branca em qualquer ponto livre.</li>
            <li>Quando seu grupo zerar, chame uma caçapa para a 8. Errar a chamada ou cair cedo perde.</li>
            <li>Toque somente na branca, puxe para trás e solte. A guia mostra o ponto fantasma e a linha pós-impacto.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-300/10 bg-amber-400/5 p-4 text-xs text-amber-100/60">
          <div className="font-medium text-amber-100/85">Aposta protegida</div>
          <p className="mt-1">A aposta já está debitada. Vitória paga o pote com a comissão da casa; empate devolve o valor integral.</p>
        </div>
      </aside>

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Resultado da partida de pool 8-ball">
          <div className="glass card-glow w-full max-w-sm rounded-3xl p-7 text-center sm:p-8">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${result.outcome === "win" ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-500/15 text-rose-300"}`}>
              {result.outcome === "win" ? <Trophy className="h-8 w-8" /> : <Skull className="h-8 w-8" />}
            </div>
            <h2 className="font-display text-2xl font-bold">{result.outcome === "win" ? "Você venceu!" : "A IA levou a melhor"}</h2>
            <p className="mt-1 text-sm text-white/55">
              {result.outcome === "win" ? `Retorno: +${formatMoney(result.payout - result.bet)} créditos` : `Você perdeu ${formatMoney(result.bet)} créditos`}
            </p>
            <p className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/55">{result.reason}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-left">
                <div className="text-xs text-emerald-200/70">Você</div>
                <div className="mt-1 text-2xl font-bold text-emerald-100">{result.score.player}</div>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-left">
                <div className="text-xs text-rose-200/70">IA</div>
                <div className="mt-1 text-2xl font-bold text-rose-100">{result.score.ai}</div>
              </div>
            </div>
            <button onClick={reset} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-600 font-semibold text-black hover:from-emerald-200 hover:to-emerald-500">
              <RotateCcw className="h-4 w-4" /> Jogar novamente
            </button>
            <Link to="/" className="mt-3 block text-sm text-white/50 hover:text-white">Voltar ao lobby</Link>
          </div>
        </div>
      )}
    </div>
  );
}
