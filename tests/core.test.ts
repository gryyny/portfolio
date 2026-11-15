import { describe, expect, it } from "vitest";
import { config } from "@/game/config";
import {
  answer,
  createGame,
  drainEvents,
  pause,
  resume,
  shieldPosition,
  startRun,
  step,
  versionLabel,
  type Bug,
  type GameState,
  type Question,
  type Rng,
} from "@/game/core";

const bank: Question[] = Array.from({ length: 5 }, (_, i) => ({
  topic: "JS",
  question: `Question ${i}`,
  right: `right ${i}`,
  wrong: [`wrong ${i}a`, `wrong ${i}b`],
}));

function seeded(seed: number): Rng {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const still = { x: 0, y: 0 };

function playing(seed = 1): { s: GameState; rng: Rng } {
  const rng = seeded(seed);
  const s = createGame(800, 600, bank, rng);
  startRun(s, "playing", rng);
  s.bugs = [];
  s.chip = null;
  s.chipTimer = 1e9;
  return { s, rng };
}

function bugAt(s: GameState, x: number, y: number, grace = 0): Bug {
  const bug: Bug = {
    id: s.nextBugId++,
    x,
    y,
    vx: 0,
    vy: 0,
    heading: 0,
    seek: 0,
    legPhase: 0,
    grace,
  };
  s.bugs.push(bug);
  return bug;
}

function shipOnce(s: GameState, rng: Rng): void {
  s.safety = 1e9;
  s.gate.open = true;
  s.player.x = s.gate.x;
  s.player.y = s.gate.y;
  step(s, still, 0.016, rng);
}

function openQuiz(s: GameState, rng: Rng): Bug {
  s.rollbacks = 1;
  const bug = bugAt(s, s.player.x, s.player.y);
  step(s, still, 0.016, rng);
  return bug;
}

describe("release progression", () => {
  it("opens the gate only after every required check", () => {
    const { s, rng } = playing();
    expect(s.required).toBe(config.checks.start);
    s.collected = s.required - 1;
    s.checks = [{ x: s.player.x, y: s.player.y }];
    s.gate.x = 50;
    s.gate.y = 50;
    step(s, still, 0.016, rng);
    expect(s.gate.open).toBe(true);
    expect(versionLabel(s.version)).toBe("v0.1.0");
  });

  it("bumps minor, resets patch, rolls over at minor 10 and caps required checks at 7", () => {
    const { s, rng } = playing();
    s.version[2] = 4;
    shipOnce(s, rng);
    expect(versionLabel(s.version)).toBe("v0.2.0");
    expect(s.required).toBe(4);
    for (let i = 0; i < 8; i++) shipOnce(s, rng);
    expect(versionLabel(s.version)).toBe("v1.0.0");
    expect(s.required).toBe(config.checks.max);
  });

  it("adds bugs per release with no hard population cap", () => {
    const { s, rng } = playing();
    for (let i = 0; i < 20; i++) shipOnce(s, rng);
    expect(s.bugs).toHaveLength(20);
  });
});

describe("damage", () => {
  it("costs one rollback per hit and protects against overlapping hits", () => {
    const { s, rng } = playing();
    bugAt(s, s.player.x, s.player.y);
    step(s, still, 0.016, rng);
    expect(s.rollbacks).toBe(2);
    step(s, still, 0.016, rng);
    expect(s.rollbacks).toBe(2);
    expect(s.phase).toBe("playing");
  });

  it("opens exactly one quiz on the last rollback and freezes the world", () => {
    const { s, rng } = playing();
    const bug = openQuiz(s, rng);
    expect(s.phase).toBe("quiz");
    expect(s.quiz?.bugId).toBe(bug.id);
    const before = { x: bug.x, y: bug.y, player: { ...s.player } };
    step(s, { x: 1, y: 0 }, 0.5, rng);
    expect({ x: bug.x, y: bug.y, player: { ...s.player } }).toEqual(before);
    expect(drainEvents(s).filter((e) => e.type === "quizStart")).toHaveLength(1);
  });
});

describe("quiz", () => {
  it("fixes the bug once, restores rollbacks and grants safety on a right answer", () => {
    const { s, rng } = playing();
    s.version[2] = 2;
    const bug = openQuiz(s, rng);
    step(s, still, 0.2, rng);
    answer(s, s.quiz?.right ?? "", 0);
    expect(s.phase).toBe("quiz");
    step(s, still, config.quiz.feedbackRightS, rng);
    expect(s.phase).toBe("playing");
    expect(s.bugs.some((b) => b.id === bug.id)).toBe(false);
    expect(s.version[2]).toBe(3);
    expect(s.rollbacks).toBe(config.rollbacks);
    expect(s.safety).toBe(config.quiz.safetyS);
  });

  it("reveals the right answer, then ends the run on a wrong answer", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    step(s, still, 0.2, rng);
    const wrong = s.quiz?.choices.find((c) => c !== s.quiz?.right) ?? "";
    answer(s, wrong, 0);
    expect(s.quiz?.picked).toBe(wrong);
    expect(s.quiz?.correct).toBe(false);
    step(s, still, config.quiz.feedbackMissS - 0.05, rng);
    expect(s.phase).toBe("quiz");
    step(s, still, 0.1, rng);
    expect(s.phase).toBe("over");
    expect(drainEvents(s).some((e) => e.type === "gameOver")).toBe(true);
  });

  it("times out on unclamped active time, not on frame-clamped time", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    step(s, still, config.quiz.deadlineS + 0.01, rng);
    expect(s.quiz?.picked).toBeNull();
    expect(s.quiz?.feedback).toBe(config.quiz.feedbackMissS);
    step(s, still, config.quiz.feedbackMissS, rng);
    expect(s.phase).toBe("over");
  });

  it("rejects a right answer that arrives after the deadline, before the next frame", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    step(s, still, config.quiz.deadlineS - 0.01, rng);
    answer(s, s.quiz?.right ?? "", 0.11);
    expect(s.quiz?.picked).toBeNull();
    expect(s.quiz?.correct).toBe(false);
  });

  it("counts the active time carried by ignored answers during feedback", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    step(s, still, 0.2, rng);
    answer(s, s.quiz?.choices.find((c) => c !== s.quiz?.right) ?? "", 0);
    answer(s, "again", 0.4);
    answer(s, "again", 0.4);
    step(s, still, 0.101, rng);
    expect(s.phase).toBe("over");
  });

  it("ignores answers inside the guard window and after the first answer", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    const quiz = s.quiz;
    answer(s, quiz?.right ?? "", 0);
    expect(quiz?.feedback).toBe(0);
    step(s, still, 0.2, rng);
    const wrong = quiz?.choices.find((c) => c !== quiz.right) ?? "";
    answer(s, wrong, 0);
    answer(s, quiz?.right ?? "", 0);
    expect(quiz?.picked).toBe(wrong);
  });

  it("cannot change a run that was exited during feedback", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    step(s, still, 0.2, rng);
    answer(s, "nope", 0);
    startRun(s, "attract", rng);
    step(s, still, 5, rng);
    expect(s.phase).toBe("attract");
    expect(s.rollbacks).toBe(config.rollbacks);
  });

  it("shows one wrong choice on levels 1-2 and two from level 3", () => {
    const { s, rng } = playing();
    openQuiz(s, rng);
    expect(s.quiz?.choices).toHaveLength(2);
    startRun(s, "playing", rng);
    s.bugs = [];
    s.releases = config.quiz.threeChoicesFromLevel - 1;
    openQuiz(s, rng);
    const quiz = s.quiz;
    expect(quiz?.choices).toHaveLength(3);
    expect(quiz?.choices.filter((c) => c === quiz.right)).toHaveLength(1);
  });

  it("does not repeat a question before the deck is exhausted, across restarts", () => {
    const { s, rng } = playing();
    const asked: string[] = [];
    bank.forEach(() => {
      startRun(s, "playing", rng);
      s.bugs = [];
      openQuiz(s, rng);
      asked.push(s.quiz?.question ?? "");
    });
    expect(new Set(asked).size).toBe(bank.length);
  });
});

describe("slow frames", () => {
  it("run every gameplay timer on active time, not on the clamped movement delta", () => {
    const { s, rng } = playing();
    s.shield = config.perk.shieldS;
    s.respawns = [config.bugs.respawnS];
    s.safety = 1e9;
    for (let i = 0; i < 26; i++) step(s, still, 0.1, rng);
    expect(s.respawns).toHaveLength(0);
    expect(s.bugs).toHaveLength(1);
    for (let i = 0; i < 45; i++) step(s, still, 0.1, rng);
    expect(s.shield).toBeLessThanOrEqual(0);
  });
});

describe("pause", () => {
  it("stops the world until resumed", () => {
    const { s, rng } = playing();
    const bug = bugAt(s, 100, 100);
    pause(s);
    step(s, { x: 1, y: 0 }, 1, rng);
    expect(bug.x).toBe(100);
    resume(s);
    expect(s.phase).toBe("playing");
  });
});

describe("AI chip", () => {
  it("grants a shield: immunity, agent fixes with patch bumps, then expiry", () => {
    const { s } = playing();
    s.chip = { x: s.player.x, y: s.player.y, life: 5 };
    step(s, still, 0.016, () => 0.1);
    expect(s.shield).toBeGreaterThan(config.perk.shieldS - 0.1);
    bugAt(s, s.player.x, s.player.y);
    step(s, still, 0.016, () => 0.1);
    expect(s.rollbacks).toBe(config.rollbacks);
    s.bugs = [];
    const agent = shieldPosition(s);
    if (!agent) throw new Error("shield expected");
    bugAt(s, agent.x, agent.y);
    const patch = s.version[2];
    s.agentAngle -= config.perk.agentSpin * 0.016;
    step(s, still, 0.016, () => 0.5);
    expect(s.version[2]).toBe(patch + 1);
    expect(s.respawns).toHaveLength(1);
    for (let t = 0; t < config.perk.shieldS + 0.5; t += 0.03) step(s, still, 0.03, () => 0.5);
    expect(s.shield).toBeLessThanOrEqual(0);
  });

  it("ships a harmless-for-now bug away from the player on a bad roll", () => {
    const { s } = playing();
    s.chip = { x: s.player.x, y: s.player.y, life: 5 };
    step(s, still, 0.016, () => 0.9);
    expect(s.bugs).toHaveLength(1);
    const [bug] = s.bugs;
    expect(bug?.grace).toBe(config.perk.badBugGraceS);
    if (!bug) throw new Error("bug expected");
    bug.x = s.player.x;
    bug.y = s.player.y;
    step(s, still, 0.016, () => 0.5);
    expect(s.rollbacks).toBe(config.rollbacks);
  });

  it("respawns each fixed bug once after the delay", () => {
    const { s, rng } = playing();
    s.respawns = [config.bugs.respawnS];
    step(s, still, 0.03, rng);
    expect(s.bugs).toHaveLength(0);
    for (let t = 0; t < config.bugs.respawnS; t += 0.03) step(s, still, 0.03, rng);
    expect(s.bugs).toHaveLength(1);
    expect(s.respawns).toHaveLength(0);
  });
});

describe("touch stick", () => {
  // A row clear of the gate, so only what the test places is on the path.
  function lane(seed = 1) {
    const { s, rng } = playing(seed);
    s.gate.x = 700;
    s.gate.y = 100;
    s.checks = [];
    s.player.x = 100;
    s.player.y = 400;
    return { s, rng };
  }
  const right = { x: 1, y: 0 };
  const frame = 1 / 60;
  const r = config.player.radius;

  it("keeps no momentum: centred, released, or after answering the quiz", () => {
    const { s, rng } = lane();
    s.player.vx = 200;
    step(s, still, frame, rng, true);
    expect(s.player.x).toBe(100);
    step(s, right, frame, rng, true);
    const moving = s.player.x;
    step(s, still, frame, rng, true);
    expect(s.player.x).toBe(moving);

    s.player.vx = 300;
    s.rollbacks = 1;
    bugAt(s, s.player.x, s.player.y);
    step(s, still, frame, rng);
    expect(s.phase).toBe("quiz");
    const frozen = s.player.x;
    answer(s, s.quiz?.right ?? "", config.quiz.guardS + 0.01);
    step(s, still, config.quiz.feedbackRightS + 0.01, rng);
    expect(s.phase).toBe("playing");
    step(s, still, frame, rng);
    expect(s.player.x).toBe(frozen);
  });

  // One frame at the longest movement step, with two contacts close together along it.
  function oneFrame() {
    const { s, rng } = lane();
    const dt = config.movementDtMax;
    const span = config.player.speed * s.scale * dt;
    const at = (share: number, reach: number) => 100 + span * share + reach;
    return { s, rng, dt, span, at };
  }

  it("lets a shield chip reached first protect against a bug reached just after", () => {
    const { s, dt, at } = oneFrame();
    s.rollbacks = 1;
    s.chip = { x: at(0.75, r + config.perk.radius), y: 400, life: 5 };
    bugAt(s, at(0.85, r + config.bugs.radius), 400);
    step(s, right, dt, () => 0.25, true);
    expect(s.shield).toBeGreaterThan(0);
    expect(s.phase).toBe("playing");
    expect(s.rollbacks).toBe(1);
  });

  it("collects a check reached first, then stops the move where a bug opens the quiz", () => {
    const { s, rng, dt, span, at } = oneFrame();
    s.rollbacks = 1;
    s.checks = [{ x: at(0.75, r + config.checks.radius + config.checks.slack), y: 400 }];
    const bug = bugAt(s, at(0.85, r + config.bugs.radius), 400);
    step(s, right, dt, rng, true);
    expect(s.collected).toBe(1);
    expect(s.phase).toBe("quiz");
    expect(s.quiz?.bugId).toBe(bug.id);
    expect(s.player.x).toBeLessThan(100 + span);
  });

  it("ships at once when the last check opens the gate the player is standing in", () => {
    const { s, rng, dt, at } = oneFrame();
    s.rollbacks = 1;
    s.gate.x = 100;
    s.gate.y = 400;
    s.collected = s.required - 1;
    s.checks = [{ x: at(0.5, r + config.checks.radius + config.checks.slack), y: 400 }];
    bugAt(s, at(0.85, r + config.bugs.radius), 400);
    step(s, right, dt, rng, true);
    expect(s.releases).toBe(1);
    expect(s.phase).toBe("playing");
    expect(s.quiz).toBeNull();
  });
});
