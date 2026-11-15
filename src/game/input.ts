import { config } from "./config";
import type { Vec } from "./core";

/** "move": steering and all commands; "commands": pause/resume only; "off": nothing. */
export type InputMode = "move" | "commands" | "off";
export type Command = { type: "pause" } | { type: "answer"; index: number };
type TiltResult = "on" | "denied" | "unavailable";

const MOVES: Readonly<Record<string, Vec>> = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

function keyboardVector(keys: ReadonlySet<string>): Vec {
  return combine(...[...keys].map((k) => MOVES[k] ?? { x: 0, y: 0 }));
}

/**
 * Turns a thumb's offset from where it landed (px) into movement in [-1, 1]. Inside the dead
 * zone it is zero, so a resting or slightly wobbling thumb moves nothing.
 */
export function stickVector(offset: Vec): Vec {
  const { radius, deadZone } = config.joystick;
  const d = Math.hypot(offset.x, offset.y);
  const dead = radius * deadZone;
  if (d <= dead) return { x: 0, y: 0 };
  const m = Math.min(1, (d - dead) / (radius - dead));
  return { x: (offset.x / d) * m, y: (offset.y / d) * m };
}

/**
 * One thumb on the stick. Steering is measured from where the thumb landed, so a press is
 * neutral until the thumb moves; other fingers are ignored, and a release (lifted, cancelled or
 * capture lost) ends steering at once.
 */
export interface StickTracker {
  press(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  /** True when `id` was the steering thumb. */
  release(id: number): boolean;
  /** The thumb's offset from where it landed, or null when the stick is not held. */
  offset(): Vec | null;
}

export function createStickTracker(): StickTracker {
  let thumb: { id: number; origin: Vec; offset: Vec } | null = null;
  return {
    press(id, x, y) {
      thumb ??= { id, origin: { x, y }, offset: { x: 0, y: 0 } };
    },
    move(id, x, y) {
      if (thumb?.id !== id) return;
      thumb.offset = { x: x - thumb.origin.x, y: y - thumb.origin.y };
    },
    release(id) {
      if (thumb?.id !== id) return false;
      thumb = null;
      return true;
    },
    offset: () => thumb?.offset ?? null,
  };
}

/** Maps device beta/gamma (degrees) into screen axes for the current screen rotation. */
export function screenTilt(beta: number, gamma: number, angle: number): Vec {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { x: beta, y: -gamma };
    case 180:
      return { x: -gamma, y: -beta };
    case 270:
      return { x: -beta, y: gamma };
    default:
      return { x: gamma, y: beta };
  }
}

/** Turns a screen-space tilt and its calibrated neutral into movement in [-1, 1]. */
export function tiltVector(reading: Vec, neutral: Vec): Vec {
  const { deadZoneDeg, fullScaleDeg } = config.tilt;
  const axis = (deg: number) => {
    const a = Math.abs(deg);
    return a < deadZoneDeg
      ? 0
      : Math.sign(deg) * Math.min(1, (a - deadZoneDeg) / (fullScaleDeg - deadZoneDeg));
  };
  return { x: axis(reading.x - neutral.x), y: axis(reading.y - neutral.y) };
}

function combine(...vectors: Vec[]): Vec {
  const x = vectors.reduce((sum, v) => sum + v.x, 0);
  const y = vectors.reduce((sum, v) => sum + v.y, 0);
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : { x, y };
}

interface Tilt {
  reading: Vec;
  neutral: Vec | null;
}

interface OrientationPermission {
  requestPermission?: () => Promise<PermissionState>;
}

interface Steering {
  move: Vec;
  /** True while the stick is held and on the frame it is let go: the core skips inertia. */
  direct: boolean;
}

export interface Input {
  steering(): Steering;
  enableTilt(): Promise<TiltResult>;
  disableTilt(): void;
  reset(): void;
  dispose(): void;
}

/** Browser adapters: keyboard, a fixed on-screen stick (any `.stick` in `stage`) and opt-in tilt. */
export function createInput(
  stage: HTMLElement,
  options: { mode: () => InputMode; onCommand: (command: Command) => void },
): Input {
  const keys = new Set<string>();
  const thumb = createStickTracker();
  let stick: { id: number; el: HTMLElement } | null = null;
  let released = false;
  let tilt: Tilt | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    const mode = options.mode();
    if (mode === "off" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
    const key = e.key.toLowerCase();
    if (key === "p" || key === "escape") {
      e.preventDefault();
      // Holding a key must not toggle pause or answer repeatedly.
      if (!e.repeat) options.onCommand({ type: "pause" });
    } else if (mode !== "move") {
      return;
    } else if (key in MOVES) {
      keys.add(key);
      e.preventDefault();
    } else if (key === "1" || key === "2" || key === "3") {
      e.preventDefault();
      if (!e.repeat) options.onCommand({ type: "answer", index: Number(key) - 1 });
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => {
    keys.clear();
  };

  const releaseStick = (id: number) => {
    if (!stick || !thumb.release(id)) return;
    stick.el.querySelector("i")?.style.removeProperty("transform");
    stick = null;
    released = true;
  };
  const onPointerDown = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".stick") : null;
    if (!el || stick || options.mode() !== "move") return;
    stick = { id: e.pointerId, el };
    thumb.press(e.pointerId, e.clientX, e.clientY);
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== stick?.id) return;
    thumb.move(e.pointerId, e.clientX, e.clientY);
    const offset = thumb.offset() ?? { x: 0, y: 0 };
    const { radius } = config.joystick;
    const d = Math.hypot(offset.x, offset.y);
    const k = d > radius ? radius / d : 1;
    stick.el
      .querySelector("i")
      ?.style.setProperty("transform", `translate(${offset.x * k}px, ${offset.y * k}px)`);
  };
  const onPointerEnd = (e: PointerEvent) => {
    releaseStick(e.pointerId);
  };

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (!tilt || e.beta === null || e.gamma === null) return;
    tilt.reading = screenTilt(e.beta, e.gamma, screen.orientation.angle);
    tilt.neutral ??= tilt.reading;
  };
  const recalibrate = () => {
    if (tilt) tilt.neutral = null;
  };
  const disableTilt = () => {
    tilt = null;
    removeEventListener("deviceorientation", onOrientation);
  };

  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);
  addEventListener("blur", onBlur);
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerEnd);
  stage.addEventListener("pointercancel", onPointerEnd);
  stage.addEventListener("lostpointercapture", onPointerEnd);
  screen.orientation.addEventListener("change", recalibrate);

  return {
    steering() {
      // The stick wins outright: touch and tilt never add together.
      const offset = thumb.offset();
      if (offset) return { move: stickVector(offset), direct: true };
      const direct = released;
      released = false;
      const parts = [keyboardVector(keys)];
      if (tilt?.neutral) parts.push(tiltVector(tilt.reading, tilt.neutral));
      return { move: combine(...parts), direct };
    },
    async enableTilt() {
      if (!("DeviceOrientationEvent" in window)) return "unavailable";
      const { requestPermission } = DeviceOrientationEvent as OrientationPermission;
      if (requestPermission) {
        const state = await requestPermission().catch(() => "denied" as const);
        if (state !== "granted") return "denied";
      }
      const session: Tilt = { reading: { x: 0, y: 0 }, neutral: null };
      tilt = session;
      addEventListener("deviceorientation", onOrientation);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (tilt !== session) return "unavailable";
      if (session.neutral) return "on";
      disableTilt();
      return "unavailable";
    },
    disableTilt,
    reset() {
      keys.clear();
      if (stick) releaseStick(stick.id);
    },
    dispose() {
      disableTilt();
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("blur", onBlur);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerEnd);
      stage.removeEventListener("pointercancel", onPointerEnd);
      stage.removeEventListener("lostpointercapture", onPointerEnd);
      screen.orientation.removeEventListener("change", recalibrate);
    },
  };
}
