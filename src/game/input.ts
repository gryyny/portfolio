import { config } from "./config";
import type { Vec } from "./core";

export interface Joystick {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
}
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

function joystickVector(j: Joystick): Vec {
  const r = config.joystick.radius;
  return combine({ x: (j.x - j.baseX) / r, y: (j.y - j.baseY) / r });
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

export interface Input {
  movement(): Vec;
  joystick(): Joystick | null;
  enableTilt(): Promise<TiltResult>;
  disableTilt(): void;
  reset(): void;
  dispose(): void;
}

/** Browser adapters: keyboard, a floating joystick on the canvas and opt-in tilt. */
export function createInput(
  canvas: HTMLCanvasElement,
  options: { mode: () => InputMode; onCommand: (command: Command) => void },
): Input {
  const keys = new Set<string>();
  let stick: Joystick | null = null;
  let pointerId: number | null = null;
  let tilt: Tilt | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    const mode = options.mode();
    if (mode === "off" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
    const key = e.key.toLowerCase();
    if (key === "p" || key === "escape") {
      options.onCommand({ type: "pause" });
      e.preventDefault();
    } else if (mode !== "move") {
      return;
    } else if (key in MOVES) {
      keys.add(key);
      e.preventDefault();
    } else if (key === "1" || key === "2" || key === "3") {
      options.onCommand({ type: "answer", index: Number(key) - 1 });
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => {
    keys.clear();
  };

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (options.mode() !== "move" || pointerId !== null) return;
    const p = local(e);
    pointerId = e.pointerId;
    stick = { baseX: p.x, baseY: p.y, x: p.x, y: p.y };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!stick || e.pointerId !== pointerId) return;
    const p = local(e);
    stick.x = p.x;
    stick.y = p.y;
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stick = null;
    pointerId = null;
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
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  screen.orientation.addEventListener("change", recalibrate);

  return {
    movement() {
      const parts = [keyboardVector(keys)];
      if (stick) parts.push(joystickVector(stick));
      if (tilt?.neutral) parts.push(tiltVector(tilt.reading, tilt.neutral));
      return combine(...parts);
    },
    joystick: () => stick,
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
      stick = null;
      pointerId = null;
    },
    dispose() {
      disableTilt();
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      screen.orientation.removeEventListener("change", recalibrate);
    },
  };
}
