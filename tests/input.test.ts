import { describe, expect, it } from "vitest";
import { config } from "@/game/config";
import { createStickTracker, screenTilt, stickVector, tiltVector } from "@/game/input";

// Device tilted top away from the user (beta) and right side down (gamma), by different angles
// so a swapped axis fails.
const beta = 12;
const gamma = 5;

describe("screenTilt", () => {
  it.each([
    [0, { x: gamma, y: beta }],
    [90, { x: beta, y: -gamma }],
    [180, { x: -gamma, y: -beta }],
    [270, { x: -beta, y: gamma }],
    [-90, { x: -beta, y: gamma }],
  ])("maps device axes to screen axes at %i°", (angle, expected) => {
    expect(screenTilt(beta, gamma, angle)).toEqual(expected);
  });
});

describe("tiltVector", () => {
  const neutral = { x: 5, y: 30 };
  const { deadZoneDeg, fullScaleDeg } = config.tilt;

  it("measures from the calibrated neutral and ignores the dead zone", () => {
    expect(tiltVector({ x: 5 + deadZoneDeg - 0.1, y: 30 - deadZoneDeg + 0.1 }, neutral)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("reaches full scale at the configured angle and clamps beyond it", () => {
    expect(tiltVector({ x: 5 + fullScaleDeg, y: 30 - fullScaleDeg * 2 }, neutral)).toEqual({
      x: 1,
      y: -1,
    });
  });

  it("scales linearly between the dead zone and full scale", () => {
    const half = deadZoneDeg + (fullScaleDeg - deadZoneDeg) / 2;
    expect(tiltVector({ x: 5 + half, y: 30 }, neutral).x).toBeCloseTo(0.5);
  });
});

describe("stick", () => {
  const { radius, deadZone } = config.joystick;

  it("is neutral where the thumb lands and steers only by how far it then moves", () => {
    const thumb = createStickTracker();
    thumb.press(1, 230, 760);
    expect(stickVector(thumb.offset() ?? { x: 9, y: 9 })).toEqual({ x: 0, y: 0 });
    thumb.move(1, 230 + radius * deadZone, 760);
    expect(stickVector(thumb.offset() ?? { x: 9, y: 9 })).toEqual({ x: 0, y: 0 });
    thumb.move(1, 230, 760 - radius * 3);
    const up = stickVector(thumb.offset() ?? { x: 0, y: 0 });
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
  });

  it("ends steering on release, cancel or lost capture and ignores other fingers", () => {
    const thumb = createStickTracker();
    thumb.press(1, 100, 100);
    thumb.press(2, 300, 300);
    thumb.move(2, 400, 300);
    expect(thumb.offset()).toEqual({ x: 0, y: 0 });
    expect(thumb.release(2)).toBe(false);
    expect(thumb.offset()).not.toBeNull();
    expect(thumb.release(1)).toBe(true);
    expect(thumb.offset()).toBeNull();
    thumb.move(1, 160, 100);
    expect(thumb.offset()).toBeNull();
  });
});
