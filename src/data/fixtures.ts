import type { Skill } from "../domain/skills/types";
import type { Track } from "../domain/race/types";
import type { RunnerBuild } from "../domain/uma/types";

export const tracks: Track[] = [
  {
    id: "tokyo-2400-turf",
    name: "Tokyo 2400m Turf",
    surface: "turf",
    distanceMeters: 2400,
    distanceCategory: "medium",
    direction: "counterclockwise",
    segments: [
      { startMeters: 0, endMeters: 420, kind: "straight", slope: "flat" },
      { startMeters: 420, endMeters: 860, kind: "corner", slope: "flat" },
      { startMeters: 860, endMeters: 1450, kind: "straight", slope: "uphill" },
      { startMeters: 1450, endMeters: 1900, kind: "corner", slope: "flat", tags: ["finalCorner"] },
      { startMeters: 1900, endMeters: 2400, kind: "straight", slope: "uphill", tags: ["finalStraight"] },
    ],
  },
  {
    id: "nakayama-1200-turf",
    name: "Nakayama 1200m Turf",
    surface: "turf",
    distanceMeters: 1200,
    distanceCategory: "sprint",
    direction: "clockwise",
    segments: [
      { startMeters: 0, endMeters: 260, kind: "straight", slope: "downhill" },
      { startMeters: 260, endMeters: 690, kind: "corner", slope: "flat" },
      { startMeters: 690, endMeters: 1200, kind: "straight", slope: "uphill", tags: ["finalStraight"] },
    ],
  },
  {
    id: "oi-1800-dirt",
    name: "Oi 1800m Dirt",
    surface: "dirt",
    distanceMeters: 1800,
    distanceCategory: "mile",
    direction: "clockwise",
    segments: [
      { startMeters: 0, endMeters: 320, kind: "straight", slope: "flat" },
      { startMeters: 320, endMeters: 820, kind: "corner", slope: "flat" },
      { startMeters: 820, endMeters: 1280, kind: "straight", slope: "flat" },
      { startMeters: 1280, endMeters: 1560, kind: "corner", slope: "flat", tags: ["finalCorner"] },
      { startMeters: 1560, endMeters: 1800, kind: "straight", slope: "flat", tags: ["finalStraight"] },
    ],
  },
];

export const skills: Skill[] = [
  {
    id: "unique-template-placeholder",
    name: "Unique Skill TBD",
    rarity: "unique",
    tags: ["unique", "placeholder"],
    alternatives: [
      {
        condition: { phase: "lastSpurt", randomChance: 0.75 },
        durationSeconds: 4,
        effects: [{ kind: "speed", amount: 0.18 }],
      },
    ],
  },
  {
    id: "unique-shooting-star",
    name: "Shooting Star",
    rarity: "unique",
    tags: ["unique", "speed", "lastSpurt"],
    alternatives: [
      {
        condition: { phase: "lastSpurt", randomChance: 0.82 },
        durationSeconds: 5,
        effects: [{ kind: "speed", amount: 0.38 }],
      },
    ],
  },
  {
    id: "unique-runaway-spirit",
    name: "Runaway Spirit",
    rarity: "unique",
    tags: ["unique", "front", "speed"],
    alternatives: [
      {
        condition: { phase: "middle", strategy: ["front"], randomChance: 0.8 },
        durationSeconds: 5,
        effects: [{ kind: "speed", amount: 0.34 }],
      },
    ],
  },
  {
    id: "unique-victory-gourmand",
    name: "Victory Gourmand",
    rarity: "unique",
    tags: ["unique", "recovery", "speed"],
    alternatives: [
      {
        condition: { phase: "late", randomChance: 0.8 },
        durationSeconds: 5,
        effects: [
          { kind: "staminaRecovery", amount: 150 },
          { kind: "speed", amount: 0.2 },
        ],
      },
    ],
  },
  {
    id: "unique-ship-anchor",
    name: "Adventure of 564",
    rarity: "unique",
    tags: ["unique", "end", "acceleration"],
    alternatives: [
      {
        condition: { phase: "late", strategy: ["end"], randomChance: 0.78 },
        durationSeconds: 5,
        effects: [{ kind: "acceleration", amount: 0.24 }],
      },
    ],
  },
  {
    id: "unique-teio-step",
    name: "Teio Step",
    rarity: "unique",
    tags: ["unique", "speed", "acceleration"],
    alternatives: [
      {
        condition: { phase: "lastSpurt", randomChance: 0.8 },
        durationSeconds: 5,
        effects: [
          { kind: "speed", amount: 0.2 },
          { kind: "acceleration", amount: 0.15 },
        ],
      },
    ],
  },
  {
    id: "unique-pride-of-mcqueen",
    name: "Pride of McQueen",
    rarity: "unique",
    tags: ["unique", "pace", "recovery"],
    alternatives: [
      {
        condition: { phase: "late", strategy: ["pace"], randomChance: 0.8 },
        durationSeconds: 4,
        effects: [
          { kind: "staminaRecovery", amount: 190 },
          { kind: "speed", amount: 0.12 },
        ],
      },
    ],
  },
  {
    id: "unique-scarlet-shift",
    name: "Scarlet Shift",
    rarity: "unique",
    tags: ["unique", "front", "speed"],
    alternatives: [
      {
        condition: { phase: "lastSpurt", strategy: ["front"], randomChance: 0.8 },
        durationSeconds: 5,
        effects: [{ kind: "speed", amount: 0.36 }],
      },
    ],
  },
  {
    id: "unique-xceleration",
    name: "Xceleration",
    rarity: "unique",
    tags: ["unique", "late", "acceleration"],
    alternatives: [
      {
        condition: { phase: "late", strategy: ["late"], randomChance: 0.8 },
        durationSeconds: 5,
        effects: [{ kind: "acceleration", amount: 0.22 }],
      },
    ],
  },
  {
    id: "homestretch-haste",
    name: "Homestretch Haste",
    rarity: "normal",
    tags: ["speed", "finalStraight"],
    alternatives: [
      {
        condition: { phase: "lastSpurt", segmentKind: "straight", randomChance: 0.78 },
        durationSeconds: 5,
        effects: [{ kind: "speed", amount: 0.32 }],
      },
    ],
  },
  {
    id: "corner-accel",
    name: "Corner Accel",
    rarity: "normal",
    tags: ["acceleration", "corner"],
    alternatives: [
      {
        condition: { phase: "middle", segmentKind: "corner", randomChance: 0.72 },
        durationSeconds: 4,
        effects: [{ kind: "acceleration", amount: 0.2 }],
      },
    ],
  },
  {
    id: "deep-breaths",
    name: "Deep Breaths",
    rarity: "normal",
    tags: ["recovery", "middle"],
    alternatives: [
      {
        condition: { phase: "middle", randomChance: 0.8 },
        durationSeconds: 1,
        effects: [{ kind: "staminaRecovery", amount: 185 }],
      },
    ],
  },
  {
    id: "front-pride",
    name: "Front Pride",
    rarity: "rare",
    tags: ["speed", "front"],
    alternatives: [
      {
        condition: { phase: "early", strategy: ["front"], randomChance: 0.7 },
        durationSeconds: 5,
        effects: [{ kind: "speed", amount: 0.24 }],
      },
    ],
  },
  {
    id: "late-kick",
    name: "Late Kick",
    rarity: "rare",
    tags: ["speed", "late", "end"],
    alternatives: [
      {
        condition: { phase: "late", strategy: ["late", "end"], randomChance: 0.76 },
        durationSeconds: 5,
        effects: [
          { kind: "speed", amount: 0.22 },
          { kind: "acceleration", amount: 0.12 },
        ],
      },
    ],
  },
  {
    id: "steady-tempo",
    name: "Steady Tempo",
    rarity: "normal",
    tags: ["recovery", "pace"],
    alternatives: [
      {
        condition: { phase: "middle", strategy: ["pace"], randomChance: 0.85 },
        durationSeconds: 1,
        effects: [{ kind: "staminaRecovery", amount: 145 }],
      },
    ],
  },
];

export const runners: RunnerBuild[] = [
  {
    id: "special-week",
    name: "Special Week",
    cardId: 100101,
    characterId: 1001,
    characterName: "Special Week",
    outfitTitle: "[Special Dreamer]",
    variant: null,
    buildName: "Sample Pace Build",
    stats: { speed: 910, stamina: 830, power: 790, guts: 520, wit: 610 },
    aptitudes: {
      surface: { turf: "A", dirt: "G" },
      distance: { sprint: "F", mile: "C", medium: "A", long: "A" },
      strategy: { front: "G", pace: "A", late: "A", end: "C" },
    },
    strategy: "pace",
    mood: "good",
    uniqueSkillId: "gt-100011",
    uniqueSkillLevel: 3,
    skillIds: ["gt-201351", "gt-200512"],
  },
  {
    id: "silence-suzuka",
    name: "Silence Suzuka",
    cardId: 100201,
    characterId: 1002,
    characterName: "Silence Suzuka",
    outfitTitle: "[Innocent Silence]",
    variant: null,
    buildName: "Sample Front Build",
    stats: { speed: 1040, stamina: 680, power: 760, guts: 470, wit: 660 },
    aptitudes: {
      surface: { turf: "A", dirt: "G" },
      distance: { sprint: "D", mile: "A", medium: "A", long: "E" },
      strategy: { front: "A", pace: "C", late: "E", end: "G" },
    },
    strategy: "front",
    mood: "normal",
    uniqueSkillId: "gt-100021",
    uniqueSkillLevel: 3,
    skillIds: ["gt-200551", "gt-200431"],
  },
  {
    id: "oguri-cap",
    name: "Oguri Cap",
    cardId: 100601,
    characterId: 1006,
    characterName: "Oguri Cap",
    outfitTitle: "[Starlight Beat]",
    variant: null,
    buildName: "Sample Late Build",
    stats: { speed: 960, stamina: 780, power: 900, guts: 600, wit: 560 },
    aptitudes: {
      surface: { turf: "A", dirt: "B" },
      distance: { sprint: "E", mile: "A", medium: "A", long: "B" },
      strategy: { front: "F", pace: "A", late: "A", end: "D" },
    },
    strategy: "late",
    mood: "great",
    uniqueSkillId: "gt-100061",
    uniqueSkillLevel: 3,
    skillIds: ["gt-200341", "gt-200492"],
  },
  {
    id: "gold-ship",
    name: "Gold Ship",
    cardId: 100701,
    characterId: 1007,
    characterName: "Gold Ship",
    outfitTitle: "[Red Strife]",
    variant: null,
    buildName: "Sample End Build",
    stats: { speed: 850, stamina: 980, power: 870, guts: 720, wit: 420 },
    aptitudes: {
      surface: { turf: "A", dirt: "G" },
      distance: { sprint: "G", mile: "C", medium: "A", long: "A" },
      strategy: { front: "G", pace: "B", late: "B", end: "A" },
    },
    strategy: "end",
    mood: "normal",
    uniqueSkillId: "gt-100071",
    uniqueSkillLevel: 3,
    skillIds: ["gt-201481", "gt-200622"],
  },
];
