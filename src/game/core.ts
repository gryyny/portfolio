import { config, type Range } from "./config";

export type Rng = () => number;
export interface Vec {
  x: number;
  y: number;
}
export type Phase = "attract" | "playing" | "paused" | "quiz" | "over";
export type Version = [major: number, minor: number, patch: number];

export interface Question {
  topic: string;
  question: string;
  right: string;
  /** Exactly two; tests/questions.test.ts enforces the bank format. */
  wrong: readonly string[];
}

export type Bug = Vec & {
  id: number;
  vx: number;
  vy: number;
  heading: number;
  seek: number;
  legPhase: number;
  grace: number;
};

interface Quiz {
  bugId: number;
  topic: string;
  question: string;
  right: string;
  choices: string[];
  remaining: number;
  feedback: number;
  /** The choice the player made; null after a timeout. Meaningful once feedback has started. */
  picked: string | null;
  correct: boolean;
}

export type GameEvent =
  | { type: "check"; at: Vec }
  | { type: "gateOpen" }
  | { type: "release"; at: Vec; version: string; releases: number }
  | { type: "hit"; at: Vec }
  | { type: "fixed"; at: Vec; by: "shield" | "quiz" }
  | { type: "perk"; at: Vec; outcome: "shield" | "bug" }
  | { type: "quizStart"; at: Vec }
  | { type: "quizAnswer"; correct: boolean; topic: string; seconds: number }
  | { type: "gameOver"; releases: number; version: string };

export interface GameState {
  phase: Phase;
  width: number;
  height: number;
  scale: number;
  player: Vec & { vx: number; vy: number };
  trail: Vec[];
  checks: Vec[];
  bugs: Bug[];
  gate: Vec & { open: boolean; spin: number };
  chip: (Vec & { life: number }) | null;
  chipTimer: number;
  shield: number;
  agentAngle: number;
  safety: number;
  rollbacks: number;
  version: Version;
  releases: number;
  collected: number;
  required: number;
  respawns: number[];
  quiz: Quiz | null;
  bank: readonly Question[];
  /** Indices into bank still to be asked. Shared by every run in a page session. */
  deck: number[];
  commit: string;
  clock: number;
  nextBugId: number;
  events: GameEvent[];
}

// The state is mutated in place: rebuilding the world sixty times a second buys nothing here,
// and every mutation goes through the functions in this module.

export function createGame(
  width: number,
  height: number,
  bank: readonly Question[],
  rng: Rng,
): GameState {
  const s: GameState = {
    phase: "attract",
    width,
    height,
    scale: scaleFor(width, height),
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    trail: [],
    checks: [],
    bugs: [],
    gate: { x: 0, y: 0, open: false, spin: 0 },
    chip: null,
    chipTimer: 0,
    shield: 0,
    agentAngle: 0,
    safety: 0,
    rollbacks: config.rollbacks,
    version: [...config.version.start],
    releases: 0,
    collected: 0,
    required: config.checks.start,
    respawns: [],
    quiz: null,
    bank,
    deck: [],
    commit: "",
    clock: 0,
    nextBugId: 1,
    events: [],
  };
  startRun(s, "attract", rng);
  return s;
}

export function startRun(s: GameState, phase: "attract" | "playing", rng: Rng): void {
  s.phase = phase;
  s.player = { x: s.width * 0.62, y: s.height * 0.6, vx: 0, vy: 0 };
  s.trail = [];
  s.checks = [];
  s.bugs = [];
  s.chip = null;
  s.chipTimer = between(rng, config.perk.firstDelayS);
  s.shield = 0;
  s.safety = 0;
  s.rollbacks = config.rollbacks;
  s.version = [...config.version.start];
  s.releases = 0;
  s.collected = 0;
  s.required = config.checks.start;
  s.respawns = [];
  s.quiz = null;
  s.commit = commitHash(rng);
  s.events = [];
  s.gate = { ...spot(s, config.gate.spawnDistance, rng), open: false, spin: 0 };
  fillChecks(s, rng);
  for (let i = 0; i < config.bugs.start; i++) addBug(s, rng, 0);
}

export function resize(s: GameState, width: number, height: number): void {
  const sx = width / s.width;
  const sy = height / s.height;
  const fit = (p: Vec) => {
    p.x = clamp(p.x * sx, config.margin / 2, width - config.margin / 2);
    p.y = clamp(p.y * sy, config.margin / 2, height - config.margin / 2);
  };
  [s.player, s.gate, ...s.checks, ...s.bugs].forEach(fit);
  if (s.chip) fit(s.chip);
  s.trail = [];
  s.width = width;
  s.height = height;
  s.scale = scaleFor(width, height);
}

/**
 * Advances the game by `elapsed` seconds of active time. Only movement uses a bounded delta,
 * so a slow frame never moves things through each other; every timer uses the full elapsed time.
 */
export function step(s: GameState, move: Vec, elapsed: number, rng: Rng): void {
  if (s.phase === "quiz" && s.quiz) tickQuiz(s, s.quiz, elapsed);
  else if (s.phase === "attract" || s.phase === "playing") {
    const input = s.phase === "playing" ? limit(move) : autopilot(s);
    simulate(s, input, Math.min(elapsed, config.movementDtMax), elapsed, rng);
  }
}

export function pause(s: GameState): void {
  if (s.phase === "playing") s.phase = "paused";
}

export function resume(s: GameState): void {
  if (s.phase === "paused") s.phase = "playing";
}

/**
 * `elapsed` is the active time since the last step. It is always applied to the quiz clock first,
 * even when the answer is ignored, so a late answer cannot win and ignored input loses no time.
 */
export function answer(s: GameState, choice: string, elapsed: number): void {
  const q = s.quiz;
  if (s.phase !== "quiz" || !q) return;
  tickQuiz(s, q, elapsed);
  if (s.quiz !== q || q.feedback > 0) return;
  if (config.quiz.deadlineS - q.remaining < config.quiz.guardS) return;
  reveal(s, q, choice);
}

export function drainEvents(s: GameState): GameEvent[] {
  const events = s.events;
  s.events = [];
  return events;
}

export function versionLabel(v: Version): string {
  return `v${v.join(".")}`;
}

export function shieldPosition(s: GameState): Vec | null {
  if (s.shield <= 0) return null;
  return {
    x: s.player.x + Math.cos(s.agentAngle) * config.perk.agentOrbit,
    y: s.player.y + Math.sin(s.agentAngle) * config.perk.agentOrbit,
  };
}

function simulate(s: GameState, input: Vec, dt: number, elapsed: number, rng: Rng): void {
  const playing = s.phase === "playing";
  const p = s.player;
  s.clock += elapsed;

  const top = config.player.speed * s.scale;
  const k = Math.min(1, dt * config.player.response);
  p.vx += (input.x * top - p.vx) * k;
  p.vy += (input.y * top - p.vy) * k;
  const edge = config.player.radius + 4;
  p.x = clamp(p.x + p.vx * dt, edge, s.width - edge);
  p.y = clamp(p.y + p.vy * dt, edge, s.height - edge);
  const last = s.trail.at(-1);
  if (!last || distance(p, last) > config.player.trailStep) {
    s.trail.push({ x: p.x, y: p.y });
    if (s.trail.length > config.player.trailLength) s.trail.shift();
  }

  if (s.safety > 0) s.safety -= elapsed;
  if (moveBugs(s, dt, elapsed, rng, playing)) return;

  for (let i = s.checks.length - 1; i >= 0; i--) {
    const c = s.checks[i];
    if (!c || distance(c, p) >= config.player.radius + config.checks.radius + 2) continue;
    s.checks.splice(i, 1);
    s.collected++;
    s.events.push({ type: "check", at: c });
    if (s.collected >= s.required) {
      s.gate.open = true;
      s.events.push({ type: "gateOpen" });
    } else fillChecks(s, rng);
  }

  s.gate.spin += elapsed;
  if (s.gate.open && distance(s.gate, p) < config.gate.radius + config.player.radius) ship(s, rng);

  updateChip(s, elapsed, rng);
  updateShield(s, elapsed);

  for (let i = s.respawns.length - 1; i >= 0; i--) {
    const left = (s.respawns[i] ?? 0) - elapsed;
    if (left > 0) s.respawns[i] = left;
    else {
      s.respawns.splice(i, 1);
      addBug(s, rng, 0);
    }
  }
}

/** Returns true when a collision opened the quiz and the world must stop for this frame. */
function moveBugs(s: GameState, dt: number, elapsed: number, rng: Rng, playing: boolean): boolean {
  const b = config.bugs;
  const p = s.player;
  const speed = Math.min(b.baseSpeed + b.speedPerLevel * s.releases, b.maxSpeed) * s.scale;
  const k = Math.min(1, dt * b.response);
  for (const bug of s.bugs) {
    bug.heading += (rng() * 2 - 1) * b.wander * dt;
    bug.legPhase += dt * 14;
    if (bug.grace > 0) bug.grace -= elapsed;
    let dx = Math.cos(bug.heading);
    let dy = Math.sin(bug.heading);
    if (playing) {
      const d = distance(p, bug) || 1;
      dx = dx * (1 - bug.seek) + ((p.x - bug.x) / d) * bug.seek;
      dy = dy * (1 - bug.seek) + ((p.y - bug.y) / d) * bug.seek;
    }
    bug.vx += (dx * speed - bug.vx) * k;
    bug.vy += (dy * speed - bug.vy) * k;
    bug.x += bug.vx * dt;
    bug.y += bug.vy * dt;
    const pad = b.radius + 6;
    if (bug.x < pad || bug.x > s.width - pad || bug.y < pad || bug.y > s.height - pad) {
      bug.x = clamp(bug.x, pad, s.width - pad);
      bug.y = clamp(bug.y, pad, s.height - pad);
      bug.heading = Math.atan2(s.height / 2 - bug.y, s.width / 2 - bug.x) + (rng() - 0.5) * 1.2;
    }
    const harmless = s.safety > 0 || s.shield > 0 || bug.grace > 0;
    if (!playing || harmless || distance(p, bug) >= config.player.radius + b.radius) continue;
    if (s.rollbacks === 1) {
      startQuiz(s, bug, rng);
      return true;
    }
    damage(s);
  }
  return false;
}

function damage(s: GameState): void {
  const b = config.bugs;
  s.rollbacks--;
  s.safety = config.hitSafetyS;
  for (const bug of s.bugs) {
    const d = distance(bug, s.player) || 1;
    if (d >= b.pushDistance) continue;
    bug.heading = Math.atan2(bug.y - s.player.y, bug.x - s.player.x);
    bug.vx = ((bug.x - s.player.x) / d) * b.pushSpeed * s.scale;
    bug.vy = ((bug.y - s.player.y) / d) * b.pushSpeed * s.scale;
  }
  s.events.push({ type: "hit", at: { x: s.player.x, y: s.player.y } });
  if (s.rollbacks <= 0) {
    s.phase = "over";
    s.events.push({ type: "gameOver", releases: s.releases, version: versionLabel(s.version) });
  }
}

function ship(s: GameState, rng: Rng): void {
  const at = { x: s.gate.x, y: s.gate.y };
  s.releases++;
  const [major, minor] = s.version;
  s.version = minor + 1 >= config.version.minorRollover ? [major + 1, 0, 0] : [major, minor + 1, 0];
  s.collected = 0;
  s.required = Math.min(config.checks.start + s.releases, config.checks.max);
  s.commit = commitHash(rng);
  s.gate = { ...spot(s, config.gate.spawnDistance, rng), open: false, spin: 0 };
  fillChecks(s, rng);
  const target = s.phase === "playing" ? config.bugs.start + s.releases : config.bugs.attractMax;
  if (s.bugs.length < target) addBug(s, rng, 0);
  s.events.push({ type: "release", at, version: versionLabel(s.version), releases: s.releases });
}

function updateChip(s: GameState, dt: number, rng: Rng): void {
  const perk = config.perk;
  s.chipTimer -= dt;
  if (!s.chip && s.shield <= 0 && s.chipTimer <= 0) {
    s.chip = { ...spot(s, perk.spawnDistance, rng), life: perk.lifeS };
  }
  const chip = s.chip;
  if (!chip) return;
  chip.life -= dt;
  if (chip.life <= 0) {
    s.chip = null;
    s.chipTimer = between(rng, perk.afterExpiryS);
    return;
  }
  if (distance(chip, s.player) >= config.player.radius + perk.radius) return;
  s.chip = null;
  s.chipTimer = between(rng, perk.afterPickupS);
  const at = { x: chip.x, y: chip.y };
  if (rng() < perk.goodChance) {
    s.shield = perk.shieldS;
    s.events.push({ type: "perk", at, outcome: "shield" });
  } else {
    addBug(s, rng, perk.badBugGraceS);
    s.events.push({ type: "perk", at, outcome: "bug" });
  }
}

function updateShield(s: GameState, dt: number): void {
  if (s.shield <= 0) return;
  s.shield -= dt;
  s.agentAngle += dt * config.perk.agentSpin;
  const agent = shieldPosition(s);
  if (!agent) return;
  for (let i = s.bugs.length - 1; i >= 0; i--) {
    const bug = s.bugs[i];
    if (!bug || distance(bug, agent) >= config.perk.agentReach) continue;
    fixBug(s, i, "shield");
  }
}

function fixBug(s: GameState, index: number, by: "shield" | "quiz"): void {
  const [bug] = s.bugs.splice(index, 1);
  if (!bug) return;
  s.respawns.push(config.bugs.respawnS);
  s.version[2]++;
  s.events.push({ type: "fixed", at: { x: bug.x, y: bug.y }, by });
}

function startQuiz(s: GameState, bug: Bug, rng: Rng): void {
  if (s.deck.length === 0) s.deck = shuffle([...s.bank.keys()], rng);
  const question = s.bank[s.deck.pop() ?? 0];
  if (!question) return;
  const wrongCount = s.releases + 1 >= config.quiz.threeChoicesFromLevel ? 2 : 1;
  const wrong = shuffle([...question.wrong], rng).slice(0, wrongCount);
  s.quiz = {
    bugId: bug.id,
    topic: question.topic,
    question: question.question,
    right: question.right,
    choices: shuffle([question.right, ...wrong], rng),
    remaining: config.quiz.deadlineS,
    feedback: 0,
    picked: null,
    correct: false,
  };
  s.phase = "quiz";
  s.events.push({ type: "quizStart", at: { x: bug.x, y: bug.y } });
}

function tickQuiz(s: GameState, q: Quiz, elapsed: number): void {
  if (q.feedback > 0) {
    q.feedback -= elapsed;
    if (q.feedback <= 0) finishQuiz(s, q);
    return;
  }
  q.remaining -= elapsed;
  if (q.remaining <= 0) reveal(s, q, null);
}

function reveal(s: GameState, q: Quiz, picked: string | null): void {
  q.picked = picked;
  q.correct = picked === q.right;
  q.feedback = q.correct ? config.quiz.feedbackRightS : config.quiz.feedbackMissS;
  const seconds = Math.min(config.quiz.deadlineS, config.quiz.deadlineS - q.remaining);
  s.events.push({ type: "quizAnswer", correct: q.correct, topic: q.topic, seconds });
}

function finishQuiz(s: GameState, q: Quiz): void {
  s.quiz = null;
  s.phase = "playing";
  if (!q.correct) {
    damage(s);
    return;
  }
  const index = s.bugs.findIndex((bug) => bug.id === q.bugId);
  if (index >= 0) fixBug(s, index, "quiz");
  s.rollbacks = config.rollbacks;
  s.safety = config.quiz.safetyS;
}

function autopilot(s: GameState): Vec {
  const a = config.autopilot;
  const p = s.player;
  let target: Vec = s.gate.open ? s.gate : { x: s.width / 2, y: s.height / 2 };
  if (!s.gate.open) {
    let best = Infinity;
    for (const c of s.checks) {
      const d = distance(c, p);
      if (d < best) {
        best = d;
        target = c;
      }
    }
  }
  const d = distance(target, p) || 1;
  let x = (target.x - p.x) / d;
  let y = (target.y - p.y) / d;
  for (const bug of s.bugs) {
    const dd = distance(p, bug) || 1;
    if (dd >= a.avoidDistance) continue;
    const w = ((a.avoidDistance - dd) / a.avoidDistance) * a.avoidWeight;
    x += ((p.x - bug.x) / dd) * w;
    y += ((p.y - bug.y) / dd) * w;
  }
  const m = Math.hypot(x, y) || 1;
  return { x: (x / m) * a.strength, y: (y / m) * a.strength };
}

function fillChecks(s: GameState, rng: Rng): void {
  while (s.checks.length < config.checks.onField && s.collected + s.checks.length < s.required) {
    s.checks.push(spot(s, config.checks.spawnDistance, rng));
  }
}

function addBug(s: GameState, rng: Rng, grace: number): void {
  const b = config.bugs;
  s.bugs.push({
    ...spot(s, b.spawnDistance, rng),
    id: s.nextBugId++,
    vx: 0,
    vy: 0,
    heading: rng() * Math.PI * 2,
    seek: between(rng, b.seek),
    legPhase: rng() * Math.PI * 2,
    grace,
  });
}

/** A random point inside the margins, preferably at least `away` from the player. */
function spot(s: GameState, away: number, rng: Rng): Vec {
  const m = config.margin;
  const pick = () => ({ x: m + rng() * (s.width - 2 * m), y: m + rng() * (s.height - 2 * m) });
  for (let i = 0; i < 40; i++) {
    const v = pick();
    if (distance(v, s.player) > away) return v;
  }
  return pick();
}

function scaleFor(width: number, height: number): number {
  const [lo, hi] = config.scaleRange;
  return clamp(Math.min(width, height) / config.scaleReference, lo, hi);
}

function limit(v: Vec): Vec {
  const m = Math.hypot(v.x, v.y);
  return m > 1 ? { x: v.x / m, y: v.y / m } : v;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

function commitHash(rng: Rng): string {
  return Math.floor(rng() * 0x10000000)
    .toString(16)
    .padStart(7, "0");
}

const between = (rng: Rng, [lo, hi]: Range) => lo + rng() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
