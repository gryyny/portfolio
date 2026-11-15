import { describe, expect, it } from "vitest";
import { config } from "@/game/config";
import { screenTilt, stickVector, tiltVector } from "@/game/input";

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

describe("stickVector", () => {
  const { radius, deadZone } = config.joystick;

  it("is zero when a thumb rests on or near the centre, so touching never moves the player", () => {
    expect(stickVector({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(stickVector({ x: radius * deadZone, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("reaches full speed at the radius, clamps beyond it and keeps the direction", () => {
    expect(stickVector({ x: radius, y: 0 })).toEqual({ x: 1, y: 0 });
    const far = stickVector({ x: 0, y: -radius * 3 });
    expect(far.x).toBeCloseTo(0);
    expect(far.y).toBeCloseTo(-1);
    const half = radius * deadZone + (radius - radius * deadZone) / 2;
    expect(stickVector({ x: half, y: 0 }).x).toBeCloseTo(0.5);
  });
});
