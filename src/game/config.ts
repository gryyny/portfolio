// Every gameplay number lives here. Distances are in CSS pixels at scale 1, times in seconds.
export const config = {
  movementDtMax: 0.033,
  scaleReference: 520,
  scaleRange: [0.65, 1.25],
  margin: 40,

  player: { radius: 11, speed: 270, response: 7, trailStep: 7, trailLength: 70 },
  checks: { start: 3, max: 7, onField: 3, radius: 9, spawnDistance: 90 },
  gate: { radius: 26, spawnDistance: 200 },
  version: { start: [0, 1, 0], minorRollover: 10 },

  bugs: {
    start: 2,
    radius: 8,
    baseSpeed: 46,
    speedPerLevel: 11,
    maxSpeed: 150,
    seek: [0.3, 0.65],
    response: 2.2,
    wander: 2.6,
    spawnDistance: 170,
    respawnS: 2.5,
    attractMax: 4,
    pushDistance: 150,
    pushSpeed: 160,
  },

  rollbacks: 3,
  hitSafetyS: 1.6,

  quiz: {
    deadlineS: 7,
    guardS: 0.15,
    feedbackRightS: 0.45,
    feedbackMissS: 0.9,
    safetyS: 1,
    threeChoicesFromLevel: 3,
  },

  perk: {
    firstDelayS: [6, 10],
    lifeS: 9,
    afterPickupS: [14, 20],
    afterExpiryS: [10, 16],
    radius: 12,
    spawnDistance: 120,
    goodChance: 0.5,
    shieldS: 7,
    shieldBlinkS: 1.5,
    agentOrbit: 36,
    agentSpin: 4.2,
    agentReach: 18,
    badBugGraceS: 1,
  },

  autopilot: { strength: 0.7, avoidDistance: 110, avoidWeight: 1.6 },
  tilt: { deadZoneDeg: 3, fullScaleDeg: 21 },
  joystick: { radius: 45 },
  promoCardS: 7,
  maxDpr: 2,
} as const;

export type Range = readonly [number, number];
