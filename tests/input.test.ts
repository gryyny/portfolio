import { describe, expect, it } from "vitest";
import { config } from "@/game/config";
import { screenTilt, tiltVector } from "@/game/input";

// Device tilted so its top goes away from the user (beta +10) and its right side down (gamma +10).
const beta = 10;
const gamma = 10;

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
