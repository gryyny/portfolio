import { config } from "./config";
import { shieldPosition, type GameEvent, type GameState, type Vec } from "./core";

type Palette = Record<
  "paper" | "muted" | "rule" | "grid" | "accent" | "ok" | "bug" | "agent",
  string
>;
type Particle = Vec & { vx: number; vy: number; life: number; color: string };

const TAU = Math.PI * 2;
const GRID = 28;

export interface Renderer {
  resize(width: number, height: number): void;
  refreshPalette(): void;
  absorb(events: readonly GameEvent[]): void;
  draw(s: GameState, elapsed: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement, reducedMotion: boolean): Renderer {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("Canvas 2D is not available");
  const ctx = maybeCtx;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let palette = readPalette(canvas);
  let mono = "monospace";
  let grid: HTMLCanvasElement | null = null;
  let particles: Particle[] = [];

  function burst(at: Vec, color: string, count: number) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = 40 + Math.random() * 140;
      particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.35 + Math.random() * 0.45,
        color,
      });
    }
  }

  // The static sheet is drawn once per size or theme, not every frame.
  function buildGrid() {
    const g = document.createElement("canvas");
    g.width = Math.round(width * dpr);
    g.height = Math.round(height * dpr);
    const gc = g.getContext("2d");
    if (!gc) return null;
    gc.scale(dpr, dpr);
    gc.fillStyle = palette.paper;
    gc.fillRect(0, 0, width, height);
    gc.lineWidth = 1;
    for (let x = 0, i = 0; x <= width; x += GRID, i++) {
      gc.strokeStyle = i % 5 === 0 ? palette.rule : palette.grid;
      gc.beginPath();
      gc.moveTo(x + 0.5, 0);
      gc.lineTo(x + 0.5, height);
      gc.stroke();
    }
    for (let y = 0, i = 0; y <= height; y += GRID, i++) {
      gc.strokeStyle = i % 5 === 0 ? palette.rule : palette.grid;
      gc.beginPath();
      gc.moveTo(0, y + 0.5);
      gc.lineTo(width, y + 0.5);
      gc.stroke();
    }
    gc.fillStyle = palette.muted;
    gc.font = `10px ${mono}`;
    gc.fillText(`main · ${process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev"}`, 8, height - 10);
    return g;
  }

  function drawGate(s: GameState) {
    const g = s.gate;
    const r = config.gate.radius;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalAlpha = g.open ? 0.14 : 0.9;
    ctx.fillStyle = g.open ? palette.accent : palette.paper;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash(g.open ? [8, 5] : [3, 5]);
    ctx.lineDashOffset = -g.spin * (g.open ? 30 : 6);
    ctx.strokeStyle = g.open ? palette.accent : palette.muted;
    ctx.lineWidth = g.open ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = g.open ? palette.accent : palette.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 10px ${mono}`;
    ctx.fillText("PROD", 0, g.open ? 0 : -5);
    if (!g.open) {
      ctx.font = `9px ${mono}`;
      ctx.fillText(`${s.collected}/${s.required}`, 0, 7);
    }
    ctx.restore();
  }

  function drawTrail(trail: readonly Vec[]) {
    const [first] = trail;
    if (!first || trail.length < 2) return;
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const t of trail) ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.paper;
    ctx.lineWidth = 1.5;
    for (let i = trail.length - 1; i >= 0; i -= 8) {
      const t = trail[i];
      if (!t) continue;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawCheck(c: Vec) {
    ctx.fillStyle = palette.paper;
    ctx.strokeStyle = palette.ok;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, config.checks.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - 4, c.y);
    ctx.lineTo(c.x - 1, c.y + 3);
    ctx.lineTo(c.x + 4.5, c.y - 3.5);
    ctx.stroke();
  }

  function drawChip(at: Vec, r: number) {
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = palette.agent;
    ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
    ctx.restore();
    ctx.fillStyle = palette.paper;
    ctx.font = `700 ${Math.round(r * 0.8)}px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AI", at.x, at.y + 0.5);
  }

  function drawBug(bug: GameState["bugs"][number]) {
    ctx.save();
    ctx.translate(bug.x, bug.y);
    ctx.rotate(Math.atan2(bug.vy, bug.vx));
    if (bug.grace > 0) ctx.globalAlpha = Math.floor(bug.grace * 10) % 2 ? 0.35 : 0.8;
    ctx.strokeStyle = palette.bug;
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      const w = Math.sin(bug.legPhase + i * 1.7) * 2.5;
      ctx.beginPath();
      ctx.moveTo(i * 4, 0);
      ctx.lineTo(i * 4 + w, -10);
      ctx.moveTo(i * 4, 0);
      ctx.lineTo(i * 4 - w, 10);
      ctx.stroke();
    }
    ctx.fillStyle = palette.bug;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9, 0, 3.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = palette.paper;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawShield(s: GameState) {
    const agent = shieldPosition(s);
    if (!agent) return;
    const fading = s.shield < config.perk.shieldBlinkS && Math.floor(s.shield * 8) % 2 === 0;
    if (!fading) {
      ctx.strokeStyle = palette.agent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(
        s.player.x,
        s.player.y,
        config.player.radius + 7 + Math.sin(s.clock * 6) * 1.5,
        0,
        TAU,
      );
      ctx.stroke();
      ctx.fillStyle = palette.agent;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, config.perk.agentOrbit, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawChip(agent, 8);
  }

  function drawPlayer(s: GameState) {
    const p = s.player;
    if (s.safety > 0 && Math.floor(s.safety * 12) % 2 === 0) return;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, config.player.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = palette.paper;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = palette.muted;
    ctx.font = `9px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      s.phase === "attract" ? "autopilot" : s.commit,
      p.x,
      p.y - config.player.radius - 4,
    );
  }

  return {
    resize(w, h) {
      width = w;
      height = h;
      dpr = Math.min(config.maxDpr, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      grid = null;
    },
    refreshPalette() {
      palette = readPalette(canvas);
      mono = getComputedStyle(canvas).getPropertyValue("--font-mono").trim() || "monospace";
      grid = null;
    },
    absorb(events) {
      for (const e of events) {
        if (e.type === "check") burst(e.at, palette.ok, 10);
        else if (e.type === "release") burst(e.at, palette.accent, 26);
        else if (e.type === "hit") burst(e.at, palette.bug, 18);
        else if (e.type === "fixed") burst(e.at, e.by === "quiz" ? palette.ok : palette.agent, 14);
        else if (e.type === "perk")
          burst(e.at, e.outcome === "shield" ? palette.agent : palette.bug, 14);
        else if (e.type === "quizStart") burst(e.at, palette.bug, 8);
      }
    },
    draw(s, elapsed) {
      if (!width) return;
      grid ??= buildGrid();
      if (grid) ctx.drawImage(grid, 0, 0, width, height);
      drawGate(s);
      drawTrail(s.trail);
      s.checks.forEach(drawCheck);
      if (s.chip && !(s.chip.life < 2.5 && Math.floor(s.chip.life * 6) % 2 === 0))
        drawChip(s.chip, 11);
      s.bugs.forEach(drawBug);
      drawShield(s);
      drawPlayer(s);
      for (const q of particles) {
        q.life -= elapsed;
        q.x += q.vx * elapsed;
        q.y += q.vy * elapsed;
        q.vx *= 0.92;
        q.vy *= 0.92;
        ctx.globalAlpha = Math.min(1, q.life * 1.6);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      particles = particles.filter((q) => q.life > 0);
    },
  };
}

function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const read = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return {
    paper: read("paper"),
    muted: read("muted"),
    rule: read("rule"),
    grid: read("grid"),
    accent: read("accent"),
    ok: read("ok"),
    bug: read("bug"),
    agent: read("agent"),
  };
}
