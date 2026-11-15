"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { initAnalytics, track } from "@/analytics";
import { profile } from "@/content/profile";
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
  type GameEvent,
  type GameState,
} from "@/game/core";
import { createInput } from "@/game/input";
import { createRenderer } from "@/game/render";
import { usePortfolioStore, type Hud, type Result } from "@/stores/usePortfolioStore";
import { ConsentBar } from "./Consent";

interface Controls {
  play(): void;
  togglePause(): void;
  exit(): void;
  choose(choice: string): void;
  toggleTilt(): Promise<void>;
}

const BEST_KEY = "gsd-best";
const ASKED_KEY = "gsd-asked";

export function Portfolio({ hero, links }: { hero: ReactNode; links: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const controls = useRef<Controls | null>(null);
  const { hud, result, toast, promo, mailOpen, tiltOn, immersive, setPromo, setMailOpen } =
    usePortfolioStore();

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
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
    let saved: { y: number; overflow: string } | null = null;

    const input = createInput(canvas, {
      mode: () =>
        game?.phase === "playing" || game?.phase === "quiz"
          ? "move"
          : game?.phase === "paused"
            ? "commands"
            : "off",
      onCommand: (command) => {
        if (command.type === "pause") controls.current?.togglePause();
        else {
          const choice = game?.quiz?.choices[command.index];
          if (choice) controls.current?.choose(choice);
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
      } else renderer.draw(game, null, 0);
    }

    function frame(ts: number) {
      raf = 0;
      if (!game) return;
      const elapsed = last ? (ts - last) / 1000 : 0;
      last = ts;
      step(game, input.movement(), elapsed, rng);
      handle(game, drainEvents(game));
      renderer.draw(game, input.joystick(), Math.min(elapsed, config.movementDtMax));
      const quiz = game.quiz;
      if (quiz && quiz.feedback <= 0 && barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.max(0, quiz.remaining / config.quiz.deadlineS)})`;
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
            if (e.releases === 1) showPromo();
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
            store.setResult(saveBest(e.releases, e.version));
            track("game_over", { releases: e.releases });
            break;
          case "check":
            break;
        }
      }
    }

    function showPromo() {
      if (readStorage(ASKED_KEY)) return;
      writeStorage(ASKED_KEY, "1");
      store.setPromo(true);
      track("ask_shown");
      promoTimer = window.setTimeout(() => {
        store.setPromo(false);
      }, config.promoCardS * 1000);
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

    controls.current = {
      play() {
        if (!game) return;
        enterImmersive();
        startRun(game, "playing", rng);
        input.reset();
        track("game_start");
        stage.focus({ preventScroll: true });
        publish();
        kick();
      },
      togglePause() {
        if (!game) return;
        if (game.phase === "playing") {
          pause(game);
          input.reset();
        } else resume(game);
        publish();
        kick();
      },
      exit() {
        if (!game) return;
        exitImmersive();
        input.disableTilt();
        store.setTiltOn(false);
        store.setPromo(false);
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
        if (outcome === "on")
          store.showToast("Tilt on. The way you hold the phone now is neutral.");
        else if (outcome === "denied") store.showToast("Tilt was not allowed. Use the joystick.");
        else store.showToast("No motion data here. Use the joystick.");
      },
    };

    function measure() {
      if (!stage || !canvas) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      renderer.resize(w, h);
      if (!game) game = createGame(w, h, questions, rng);
      else resize(game, w, h);
      publish();
      if (raf) return;
      renderer.draw(game, null, 0);
      kick();
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stage);
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      kick();
    });
    intersection.observe(stage);
    const onVisibility = () => {
      last = 0;
      if (document.hidden && game?.phase === "playing") {
        pause(game);
        input.reset();
        publish();
      }
      kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      renderer.refreshPalette();
      if (game && !raf) renderer.draw(game, null, 0);
    };
    scheme.addEventListener("change", onScheme);
    renderer.refreshPalette();
    void document.fonts.ready.then(onScheme);
    initAnalytics();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(promoTimer);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scheme.removeEventListener("change", onScheme);
      input.dispose();
      exitImmersive();
      controls.current = null;
    };
  }, []);

  function onLinkClick(e: MouseEvent<HTMLDivElement>) {
    const link =
      e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[data-link]") : null;
    const kind = link?.dataset.link;
    if (!link || !kind) return;
    if (link.dataset.ask) track("ask_click", { via: kind, where: link.dataset.ask });
    if (kind === "email") {
      e.preventDefault();
      if (hud?.phase === "playing") controls.current?.togglePause();
      setMailOpen(true);
      track("email_open");
    } else if (kind === "cv") track("cv_download");
    else track("outbound_click", { target: kind });
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(profile.email);
      usePortfolioStore.getState().showToast("Address copied");
    } catch {
      const address = document.getElementById("mail-address");
      if (address) getSelection()?.selectAllChildren(address);
      usePortfolioStore.getState().showToast("Press Cmd+C or Ctrl+C to copy");
    }
    track("email_copy");
  }

  const phase = hud?.phase ?? "attract";
  const quiz = hud?.quiz;

  return (
    <div
      ref={stageRef}
      className={immersive ? "stage immersive" : "stage"}
      data-phase={phase}
      tabIndex={-1}
      onClick={onLinkClick}
    >
      <canvas ref={canvasRef} aria-hidden="true" />

      <div className="hero">
        {hero}
        <nav className="links" aria-label="Profiles">
          {links}
        </nav>
        <button
          type="button"
          className="play full"
          hidden={!hud}
          onClick={() => controls.current?.play()}
        >
          Play: ship a release
        </button>
        <p className="hint full" hidden={!hud}>
          <span className="fine">Arrows or WASD to steer</span>
          <span className="coarse">Drag anywhere to steer. Tilt is optional.</span>
        </p>
      </div>

      {(phase === "playing" || phase === "paused" || phase === "quiz") && hud && (
        <div className="hud">
          <span className="ver">{hud.version}</span>
          <span>{hud.checks} ✓</span>
          <span className="lives" aria-label={`${hud.rollbacks} rollbacks left`}>
            {Array.from({ length: config.rollbacks }, (_, i) => (
              <span key={i} className={i < hud.rollbacks ? "" : "lost"}>
                ●
              </span>
            ))}
          </span>
          <button
            type="button"
            className="coarse"
            aria-pressed={tiltOn}
            onClick={() => void controls.current?.toggleTilt()}
          >
            Tilt
          </button>
          {phase !== "quiz" && (
            <button
              type="button"
              aria-label={phase === "paused" ? "Resume" : "Pause"}
              onClick={() => controls.current?.togglePause()}
            >
              {phase === "paused" ? "▶" : "II"}
            </button>
          )}
          <button type="button" onClick={() => controls.current?.exit()}>
            Exit
          </button>
        </div>
      )}

      {phase === "paused" && (
        <div className="panel">
          <p className="eyebrow">Paused</p>
          <div className="row">
            <button type="button" className="play" onClick={() => controls.current?.togglePause()}>
              Resume
            </button>
            <button type="button" className="play ghost" onClick={() => controls.current?.exit()}>
              Exit game
            </button>
          </div>
          <nav className="links" aria-label="Profiles">
            {links}
          </nav>
        </div>
      )}

      {phase === "quiz" && quiz && (
        <div className="quiz" role="dialog" aria-label="Fix the bug">
          <div className="qbar">
            <i ref={barRef} />
          </div>
          <p className="eyebrow">Last rollback · answer in 3 s · {quiz.topic}</p>
          <p className="qq">
            {quiz.revealed && quiz.picked === null ? "Too slow. The fix was:" : quiz.question}
          </p>
          <div className="qopts">
            {quiz.choices.map((choice, i) => {
              const state = !quiz.revealed
                ? ""
                : choice === quiz.right
                  ? "right"
                  : choice === quiz.picked
                    ? "wrong"
                    : "";
              return (
                <button
                  key={choice}
                  type="button"
                  className={`qopt ${state}`}
                  disabled={quiz.revealed}
                  onClick={() => controls.current?.choose(choice)}
                >
                  <kbd>{i + 1}</kbd>
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === "over" && result && <GameOver result={result} links={links} controls={controls} />}

      {promo && phase === "playing" && (
        <div className="nudge" role="status">
          <span>First release shipped. Enjoying it?</span>
          <a
            href={profile.links.linkedin}
            target="_blank"
            rel="noopener"
            data-link="linkedin"
            data-ask="card"
          >
            Connect ↗
          </a>
          <a
            href={profile.links.repo}
            target="_blank"
            rel="noopener"
            data-link="github"
            data-ask="card"
          >
            Star ↗
          </a>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setPromo(false);
            }}
          >
            ×
          </button>
        </div>
      )}

      {mailOpen && (
        <div className="panel mail">
          <p className="eyebrow">Email</p>
          <p className="addr" id="mail-address">
            {profile.email}
          </p>
          <div className="row">
            <button type="button" className="play" onClick={() => void copyEmail()}>
              Copy address
            </button>
            <a className="play ghost" href={`mailto:${profile.email}`}>
              Open mail app
            </a>
            <button
              type="button"
              className="play ghost"
              onClick={() => {
                setMailOpen(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {phase === "attract" && <ConsentBar />}

      {toast && (
        <div key={toast.id} className="toast" role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function GameOver({
  result,
  links,
  controls,
}: {
  result: Result;
  links: ReactNode;
  controls: { current: Controls | null };
}) {
  const releases = result.releases === 1 ? "1 release" : `${result.releases} releases`;
  return (
    <div className="panel">
      <p className="eyebrow">Out of rollbacks</p>
      <p className="big">{result.version}</p>
      <p>
        {releases} shipped. {result.isBest ? "New personal best." : `Your best: ${result.best}.`}
      </p>
      <p className="ask">Enjoyed it? Connect with me or star the repo. It helps a lot.</p>
      <div className="row">
        <a
          className="play ghost"
          href={profile.links.linkedin}
          target="_blank"
          rel="noopener"
          data-link="linkedin"
          data-ask="game_over"
        >
          Connect on LinkedIn ↗
        </a>
        <a
          className="play ghost"
          href={profile.links.repo}
          target="_blank"
          rel="noopener"
          data-link="github"
          data-ask="game_over"
        >
          Star on GitHub ↗
        </a>
      </div>
      <div className="row">
        <button type="button" className="play" onClick={() => controls.current?.play()}>
          Play again
        </button>
        <button type="button" className="play ghost" onClick={() => controls.current?.exit()}>
          Exit
        </button>
      </div>
      <nav className="links" aria-label="Profiles">
        {links}
      </nav>
    </div>
  );
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
