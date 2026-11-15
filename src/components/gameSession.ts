import { track } from "@/analytics";
import { questions } from "@/content/questions";
import { config } from "@/game/config";
import {
  answer,
  createGame,
  drainEvents,
  pause,
  resize,
  resume,
  startRun,
  step,
  versionLabel,
  type Bounds,
  type GameEvent,
  type GameState,
} from "@/game/core";
import { createInput } from "@/game/input";
import { createRenderer } from "@/game/render";
import { usePortfolioStore, type Hud, type Result } from "@/stores/usePortfolioStore";

// The browser side of the game: one animation loop wiring core, renderer, input and the store.
// Portfolio.tsx imports this lazily, so the page paints and hydrates without it.

export interface GameSession {
  play(): void;
  togglePause(): void;
  exit(): void;
  choose(choice: string): void;
  toggleTilt(): Promise<void>;
  dispose(): void;
}

const BEST_KEY = "gsd-best";
const ASKED_KEY = "gsd-asked";
// Overlays that sit over the canvas while the world moves; the arena stays clear of them.
const OVERLAYS = ".hud, .hero, .consent, .toast, .corner, .stick";

export function startGameSession(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  bar: { readonly current: HTMLElement | null },
): GameSession {
  const store = usePortfolioStore.getState();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const rng = Math.random;
  const renderer = createRenderer(canvas, reduced);
  let game: GameState | null = null;
  let raf = 0;
  let last = 0;
  let onScreen = true;
  let published = "";
  let promoTimer = 0;
  let promoDue = false;
  let saved: { y: number; overflow: string } | null = null;

  const input = createInput(stage, {
    mode: () =>
      game?.phase === "playing" || game?.phase === "quiz"
        ? "move"
        : game?.phase === "paused"
          ? "commands"
          : "off",
    onCommand: (command) => {
      if (command.type === "pause") session.togglePause();
      else {
        const choice = game?.quiz?.choices[command.index];
        if (choice) session.choose(choice);
      }
    },
  });

  function running(): boolean {
    if (!game || document.hidden) return false;
    if (game.phase === "playing" || game.phase === "quiz") return true;
    return game.phase === "attract" && onScreen && !reduced;
  }

  function kick() {
    if (raf || !game) return;
    if (running()) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else renderer.draw(game, 0);
  }

  function frame(ts: number) {
    raf = 0;
    if (!game) return;
    const elapsed = last ? (ts - last) / 1000 : 0;
    last = ts;
    const { move, direct } = input.steering();
    step(game, move, elapsed, rng, direct);
    handle(game, drainEvents(game));
    renderer.draw(game, Math.min(elapsed, config.movementDtMax));
    const quiz = game.quiz;
    if (quiz && quiz.feedback <= 0 && bar.current) {
      bar.current.style.transform = `scaleX(${Math.max(0, quiz.remaining / config.quiz.deadlineS)})`;
    }
    publish();
    if (running()) raf = requestAnimationFrame(frame);
  }

  function publish() {
    if (!game) return;
    const q = game.quiz;
    const snapshot: Hud = {
      phase: game.phase,
      version: versionLabel(game.version),
      checks: `${game.collected}/${game.required}`,
      rollbacks: game.rollbacks,
      quiz: q && {
        topic: q.topic,
        question: q.question,
        choices: q.choices,
        revealed: q.feedback > 0,
        picked: q.picked,
        right: q.right,
      },
    };
    const key = JSON.stringify(snapshot);
    if (key === published) return;
    published = key;
    store.setHud(snapshot);
  }

  function handle(s: GameState, events: GameEvent[]) {
    renderer.absorb(events);
    if (s.phase === "attract") return;
    for (const e of events) {
      switch (e.type) {
        case "gateOpen":
          store.showToast("All checks green. Deploy is open.");
          break;
        case "release":
          store.showToast(`Released ${e.version}`);
          track("level_complete", { version: e.version });
          // Held until play pauses: nothing promotional covers the arena mid-run.
          if (e.releases === 1 && !readStorage(ASKED_KEY)) promoDue = true;
          break;
        case "hit":
          store.showToast("Incident. Rolled back.");
          if ("vibrate" in navigator) navigator.vibrate(80);
          break;
        case "fixed":
          store.showToast(
            e.by === "quiz"
              ? "Fixed. All rollbacks restored."
              : `Bug fixed: ${versionLabel(s.version)}`,
          );
          break;
        case "perk":
          store.showToast(
            e.outcome === "shield"
              ? "AI shield up for 7 s. Bugs cannot hurt you."
              : "The AI shipped a new bug.",
          );
          track(e.outcome === "shield" ? "shield" : "ai_bug");
          break;
        case "quizStart":
          input.reset();
          break;
        case "quizAnswer":
          track("quiz_answer", { correct: e.correct, topic: e.topic, seconds: e.seconds });
          break;
        case "gameOver":
          // The game-over panel carries the same ask.
          promoDue = false;
          store.setResult(saveBest(e.releases, e.version));
          track("game_over", { releases: e.releases });
          break;
        case "check":
          break;
      }
    }
  }

  /** Pauses play; a held first-release card appears with the pause panel and counts as seen. */
  function pauseGame(s: GameState) {
    pause(s);
    input.reset();
    publish();
    if (!promoDue || s.phase !== "paused") return;
    promoDue = false;
    writeStorage(ASKED_KEY, "1");
    store.setPromo(true);
    track("ask_shown");
    promoTimer = window.setTimeout(hidePromo, config.promoCardS * 1000);
  }

  function hidePromo() {
    clearTimeout(promoTimer);
    store.setPromo(false);
  }

  function enterImmersive() {
    if (!coarse || saved) return;
    saved = { y: scrollY, overflow: document.documentElement.style.overflow };
    document.documentElement.style.overflow = "hidden";
    store.setImmersive(true);
  }

  function exitImmersive() {
    if (!saved) return;
    document.documentElement.style.overflow = saved.overflow;
    scrollTo(0, saved.y);
    saved = null;
    store.setImmersive(false);
  }

  /**
   * The canvas area clear of the device safe areas (the stage's own padding) and of overlays:
   * each one in the top half pushes the top edge down, each one in the bottom half lifts the bottom.
   */
  function arena(w: number, h: number): Bounds {
    const css = getComputedStyle(stage);
    const box = stage.getBoundingClientRect();
    const originX = box.left + stage.clientLeft;
    const originY = box.top + stage.clientTop;
    const b = {
      left: parseFloat(css.paddingLeft) || 0,
      top: parseFloat(css.paddingTop) || 0,
      right: w - (parseFloat(css.paddingRight) || 0),
      bottom: h - (parseFloat(css.paddingBottom) || 0),
    };
    for (const el of stage.querySelectorAll(OVERLAYS)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const top = r.top - originY;
      const bottom = r.bottom - originY;
      if (r.right - originX <= b.left || r.left - originX >= b.right) continue;
      if (top + bottom < h) b.top = Math.max(b.top, bottom);
      else b.bottom = Math.min(b.bottom, top);
    }
    return b;
  }

  function measure() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const bounds = arena(w, h);
    if (game) {
      const now = game.bounds;
      const same =
        w === game.width &&
        h === game.height &&
        bounds.left === now.left &&
        bounds.top === now.top &&
        bounds.right === now.right &&
        bounds.bottom === now.bottom;
      if (same) return;
    }
    renderer.resize(w, h);
    if (!game) {
      game = createGame(w, h, questions, rng);
      resize(game, w, h, bounds);
    } else {
      resize(game, w, h, bounds);
      // A finger held across a layout change would move the player by a stale offset.
      input.reset();
    }
    publish();
    if (raf) return;
    renderer.draw(game, 0);
    kick();
  }

  const onVisibility = () => {
    last = 0;
    if (document.hidden && game?.phase === "playing") pauseGame(game);
    kick();
  };
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => {
    renderer.refreshPalette();
    if (game && !raf) renderer.draw(game, 0);
  };
  const resizeObserver = new ResizeObserver(measure);
  // Overlays mount, unmount and change size with the phase without resizing the stage.
  const layoutObserver = new MutationObserver(measure);
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    kick();
  });

  const session: GameSession = {
    play() {
      if (!game) return;
      enterImmersive();
      promoDue = false;
      hidePromo();
      startRun(game, "playing", rng);
      input.reset();
      track("game_start");
      stage.focus({ preventScroll: true });
      publish();
      kick();
    },
    togglePause() {
      if (!game) return;
      if (game.phase === "playing") pauseGame(game);
      else {
        resume(game);
        hidePromo();
        input.reset();
        publish();
      }
      kick();
    },
    exit() {
      if (!game) return;
      exitImmersive();
      input.disableTilt();
      input.reset();
      store.setTiltOn(false);
      promoDue = false;
      hidePromo();
      startRun(game, "attract", rng);
      publish();
      kick();
    },
    choose(choice) {
      if (!game) return;
      // Count the active time since the last frame, so a late click cannot beat the deadline.
      const now = performance.now();
      const elapsed = last ? (now - last) / 1000 : 0;
      if (last) last = now;
      answer(game, choice, elapsed);
      publish();
    },
    async toggleTilt() {
      if (usePortfolioStore.getState().tiltOn) {
        input.disableTilt();
        store.setTiltOn(false);
        return;
      }
      const outcome = await input.enableTilt();
      store.setTiltOn(outcome === "on");
      if (outcome === "on") store.showToast("Tilt on. The way you hold the phone now is neutral.");
      else if (outcome === "denied") store.showToast("Tilt was not allowed. Use the joystick.");
      else store.showToast("No motion data here. Use the joystick.");
    },
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(promoTimer);
      resizeObserver.disconnect();
      layoutObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scheme.removeEventListener("change", onScheme);
      input.dispose();
      exitImmersive();
      game = null;
    },
  };

  renderer.refreshPalette();
  // Create the game now, not on the first resize callback, so a queued Play has a game to start.
  measure();
  resizeObserver.observe(stage);
  layoutObserver.observe(stage, {
    childList: true,
    attributes: true,
    attributeFilter: ["class", "data-phase"],
  });
  intersection.observe(stage);
  document.addEventListener("visibilitychange", onVisibility);
  scheme.addEventListener("change", onScheme);
  void document.fonts.ready.then(() => {
    onScheme();
    // Web fonts change the hero's height, and with it the clear area.
    measure();
  });
  return session;
}

function saveBest(releases: number, version: string): Result {
  let best: { releases: number; version: string } | null = null;
  try {
    const parsed: unknown = JSON.parse(readStorage(BEST_KEY) ?? "null");
    if (
      parsed &&
      typeof parsed === "object" &&
      "releases" in parsed &&
      "version" in parsed &&
      typeof parsed.releases === "number" &&
      typeof parsed.version === "string"
    ) {
      best = { releases: parsed.releases, version: parsed.version };
    }
  } catch {
    best = null;
  }
  const isBest = !best || releases > best.releases;
  if (isBest) writeStorage(BEST_KEY, JSON.stringify({ releases, version }));
  return { version, releases, best: isBest ? version : (best?.version ?? version), isBest };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is optional: the game works without remembering anything.
  }
}
