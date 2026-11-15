"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { initAnalytics, track } from "@/analytics";
import { profile } from "@/content/profile";
import { config } from "@/game/config";
import { usePortfolioStore, type Result } from "@/stores/usePortfolioStore";
import { ConsentBar } from "./Consent";
import type { GameSession } from "./gameSession";

type Controls = Omit<GameSession, "dispose">;

export function Portfolio({ hero, links }: { hero: ReactNode; links: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const controls = useRef<Controls | null>(null);
  const playQueued = useRef(false);
  const { hud, ready, result, toast, promo, mailOpen, tiltOn, immersive, setPromo, setMailOpen } =
    usePortfolioStore();

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    let session: GameSession | null = null;
    let disposed = false;
    usePortfolioStore.getState().setReady(true);
    initAnalytics();
    // The game engine is the heaviest client code; it loads after hydration so first paint
    // never waits for it. A Play click made meanwhile is kept and replayed.
    void import("./gameSession").then(({ startGameSession }) => {
      if (disposed) return;
      session = startGameSession(stage, canvas, barRef);
      controls.current = session;
      if (playQueued.current) {
        playQueued.current = false;
        session.play();
      }
    });
    return () => {
      disposed = true;
      session?.dispose();
      controls.current = null;
    };
  }, []);

  function play() {
    if (controls.current) controls.current.play();
    else playQueued.current = true;
  }

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
        <button type="button" className="play full" hidden={!ready} onClick={play}>
          Play: ship a release
        </button>
        <p className="hint full" hidden={!ready}>
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
