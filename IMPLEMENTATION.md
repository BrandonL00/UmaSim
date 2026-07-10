# UmaSim Implementation Draft

This document turns the project vision into a first build plan. The goal is to get a useful race simulator running quickly while keeping the codebase ready for future tools like gacha simulation, guides, tier lists, and race planning.

## Guiding Choices

- Build the simulator as a domain engine first, then wrap it with UI.
- Keep game data, user input, simulation logic, and presentation separate.
- Start with small hand-authored fixtures so we can test the pipeline before solving full data import.
- Make every simulated result explainable: inputs, formulas used, skill triggers, warnings, and decisive moments.
- Prefer deterministic seeded runs early so bugs are reproducible.

## Proposed Stack

- App: Vite + React + TypeScript.
- Styling: CSS modules or plain scoped CSS to start; avoid locking into a heavy design system too early.
- Validation: Zod for data schemas and setup validation.
- Testing: Vitest for race engine and data validation.
- Charts: lightweight SVG/Canvas components first, maybe Recharts later if timeline views get complex.
- Data storage:
  - Phase 1: local JSON fixtures.
  - Phase 2: generated JSON from importer scripts.
  - Phase 3: SQLite or static database if search/filtering/data volume demands it.

## App Shape

```text
src/
  app/
    App.tsx
    routes.tsx
    layout/
  features/
    race-sim/
      pages/
      components/
      hooks/
      state/
    skills/
    guides/
    gacha/
  domain/
    race/
      simulateRace.ts
      raceSetup.ts
      raceTick.ts
      formulas.ts
      phases.ts
      positioning.ts
      stamina.ts
      resultSummary.ts
    skills/
      skillTypes.ts
      skillConditions.ts
      skillEffects.ts
      skillEngine.ts
    uma/
      runnerTypes.ts
      statAdjustments.ts
      aptitudes.ts
    data/
      schemas.ts
      loaders.ts
      ids.ts
  data/
    fixtures/
      tracks.json
      runners.json
      skills.json
    generated/
  scripts/
    import-data/
    validate-data/
  tests/
    race/
    skills/
    data/
```

The important line: `domain/` must not import React. The UI can call the engine, but the engine should be portable to tests, scripts, workers, or a future backend.

## Core Domain Types

These are rough first-pass shapes, not final API contracts.

```ts
type StatBlock = {
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  wit: number;
};

type AptitudeRank = "G" | "F" | "E" | "D" | "C" | "B" | "A" | "S";

type RunnerBuild = {
  id: string;
  name: string;
  stats: StatBlock;
  aptitudes: {
    surface: Record<"turf" | "dirt", AptitudeRank>;
    distance: Record<"sprint" | "mile" | "medium" | "long", AptitudeRank>;
    strategy: Record<"front" | "pace" | "late" | "end", AptitudeRank>;
  };
  strategy: "front" | "pace" | "late" | "end";
  mood: "awful" | "bad" | "normal" | "good" | "great";
  skillIds: string[];
};

type Track = {
  id: string;
  name: string;
  surface: "turf" | "dirt";
  distanceMeters: number;
  distanceCategory: "sprint" | "mile" | "medium" | "long";
  direction?: "clockwise" | "counterclockwise" | "straight";
  segments: TrackSegment[];
};

type TrackSegment = {
  startMeters: number;
  endMeters: number;
  kind: "straight" | "corner";
  slope?: "flat" | "uphill" | "downhill";
  tags?: Array<"finalCorner" | "finalStraight">;
};

type RaceSetup = {
  seed: string;
  trackId: string;
  groundCondition: "firm" | "good" | "soft" | "heavy";
  weather?: "sunny" | "cloudy" | "rainy" | "snowy";
  runners: RunnerBuild[];
};
```

## Simulation Pipeline

The race engine should run as a pure function:

```ts
const result = simulateRace(setup, dataCatalog);
```

Suggested internal steps:

1. Validate setup and referenced data.
2. Build immutable race context: track, phase boundaries, conditions, RNG seed.
3. Convert each `RunnerBuild` into `InRaceRunner`.
4. Precompute adjusted stats:
   - mood adjustment
   - ground condition adjustment
   - distance aptitude modifiers
   - surface aptitude modifiers
   - strategy aptitude modifiers
5. Advance the race in fixed ticks.
6. For each tick:
   - update current phase and segment
   - evaluate skill activation conditions
   - apply active skill effects
   - compute target speed
   - compute acceleration/deceleration
   - consume stamina
   - update position
   - resolve passing/positioning, once implemented
   - record timeline snapshots and events
7. Stop when all runners finish.
8. Produce placements, summaries, warnings, and explainability notes.

## Accuracy Program

The current app is already useful as a modular prototype, but the end goal is a simulator that tracks the real game closely enough to support serious build testing. Reaching that point requires a deliberate engine program, not just one-off skill patches.

### What "accurate" means here

An accurate simulator should:

- produce believable pacing and stamina behavior
- trigger skills for the same underlying reasons the game does
- respect hidden race-state dependencies such as crowding, lane changes, and trigger anchors
- replay deterministically from a fixed seed
- make it obvious which mechanics are verified, approximated, or unsupported

### Workstream 1: Richer engine state

Add a first-class `EngineState` / `InRaceContext` model that can track:

- lane, target lane, and lane-change progress
- blocked front / blocked side detail
- nearby-runner and crowding relationships
- overtake history and short-term order deltas
- trigger anchors such as final-corner random and straight random windows
- start state, temptation/composure, and other hidden flags
- race metadata such as season, popularity, post number, and track-specific conditions
- per-run activation counters and cooldown state

### Workstream 2: Engine decomposition

Refactor the current race loop into separate modules:

- `positioning`
- `pathing`
- `movement`
- `raceEvents`
- `skillRuntime`

This keeps future accuracy work from turning `simulateRace.ts` into an untestable blob.

### Workstream 3: Condition token coverage

The imported global skill catalog contains a wider condition language than the current engine supports. We should:

1. inventory every token found in imported skill expressions
2. classify each token:
   - already supported
   - pure metadata
   - needs new engine state
   - unknown / needs research
3. implement a centralized token resolver table
4. write targeted tests for each token family

### Workstream 4: Effect-type coverage

The current engine models:

- stat modifiers
- stamina recovery
- speed
- acceleration

The next accuracy pass should add effect families for:

- navigation / lane handling
- debuffs and intimidation
- awareness / field-of-view style mechanics
- repeatable activations and cooldown behaviors

### Workstream 5: Unique skill fidelity

Owner uniques and inherited uniques should not be treated as the same thing with different labels. We need:

- owner-vs-inherited resolution
- verified unique-skill level scaling
- support for stronger owner-unique behavior where applicable

### Workstream 6: Validation harness

We need a repeatable way to measure engine quality. Build a validation suite with:

- benchmark runners
- representative tracks
- expected trigger cases
- blocked/crowded race scenarios
- regression fixtures for unique skills and special trigger anchors

Compare:

- activation timing
- activation rate
- finish ordering tendencies
- stamina curves
- speed profile changes

### Recommended execution order

1. Define `EngineState`
2. Refactor the loop into subsystems
3. Add lane/pathing state
4. Implement navigation-related tokens/effects
5. Add repeatable trigger infrastructure
6. Implement debuff/pressure effects
7. Add unique level scaling
8. Add validation fixtures and regression coverage

### Current known gaps

At the moment, the simulator is strongest at direct speed/acceleration/recovery behavior plus simple phase/position checks. The biggest known weaknesses are:

- lane and navigation mechanics
- hidden race-state flags used by many global skills
- repeatable/random trigger anchors
- debuff-style effects
- true unique-skill level scaling

## First Simulation Version

The first version should intentionally model less, but model it cleanly.

Included:

- Single track.
- Two to six runners.
- Stats and aptitudes.
- Strategy phase coefficients.
- Base speed, target speed, acceleration.
- Basic stamina consumption.
- Seeded randomness.
- Simple skill effects: speed up, acceleration up, recovery.
- Timeline output.

Deferred:

- Complex lane changes.
- Blocking and collision-like position keep behavior.
- Full game-accurate skill condition parser.
- Exact official formula parity.
- Complete character, track, and skill database.
- Inheritance, support cards, training planner, and gacha.

## Skill Engine

Skills should be represented as data plus effect handlers.

```ts
type Skill = {
  id: string;
  name: string;
  rarity: "normal" | "rare" | "unique" | "inherit";
  tags: string[];
  alternatives: SkillAlternative[];
};

type SkillAlternative = {
  condition: SkillCondition;
  durationSeconds: number;
  effects: SkillEffect[];
};

type SkillEffect =
  | { kind: "speed"; amount: number }
  | { kind: "acceleration"; amount: number }
  | { kind: "staminaRecovery"; amount: number }
  | { kind: "staminaCost"; amount: number };
```

For the MVP, conditions can be structured objects instead of parsing raw game condition strings:

```ts
type SkillCondition = {
  phase?: "early" | "middle" | "late" | "lastSpurt";
  segmentKind?: "straight" | "corner";
  strategy?: Array<"front" | "pace" | "late" | "end">;
  minPositionPercent?: number;
  maxPositionPercent?: number;
  randomChance?: number;
};
```

Later, if imported skill data uses condition expressions, we can add a parser or compiler that converts source expressions into this internal format.

## Data Strategy

Start tiny and explicit:

- `tracks.json`: 3 to 5 representative courses.
- `runners.json`: sample trained builds, not a full character database.
- `skills.json`: 10 to 20 skills covering speed, acceleration, recovery, phase, corner, straight, and strategy filters.

Every data file should be validated by tests. Bad data should fail loudly before it reaches the UI.

Potential later sources:

- Community-maintained game data.
- User-supplied extracted data.
- Import scripts that transform external data into our schemas.

We should avoid committing questionable copyrighted dumps until we understand the legal and licensing situation.

## UI Plan

The first app screen should be the race simulator itself.

Primary panels:

- Track setup:
  - course selector
  - surface, distance, direction display
  - ground condition and weather controls
- Runner setup:
  - runner table
  - stats inputs
  - aptitude selectors
  - strategy selector
  - skill picker
- Simulation controls:
  - seed input
  - run once
  - run batch, later
  - reset to sample
- Results:
  - placements
  - timeline chart
  - speed/stamina graph per runner
  - skill activation log
  - warnings and assumptions

The UI should be dense, fast, and workbench-like. No landing page for MVP.

## State Management

Use React state and local reducers first.

Candidate shape:

```ts
type RaceSimState = {
  setup: RaceSetupDraft;
  selectedRunnerId?: string;
  result?: RaceResult;
  validationErrors: ValidationError[];
};
```

Add a heavier state library only if editing flows become painful.

## Testing Plan

Initial tests:

- Data schema validation succeeds for fixtures.
- Race setup validation catches missing track, bad stats, invalid skill ids.
- Stat adjustment formulas produce stable expected values.
- Same seed plus same setup produces identical result.
- Higher speed improves target speed in a controlled scenario.
- Recovery skill improves remaining stamina in a controlled scenario.
- Skill condition triggers only in the intended phase/segment.

Golden tests should use very small fixtures so they are easy to reason about.

## Build Order

1. Initialize Vite React TypeScript app.
2. Add formatter, lint, Vitest, and basic scripts.
3. Create domain folders and first type definitions.
4. Add Zod schemas and tiny fixtures.
5. Implement stat adjustments.
6. Implement deterministic single-runner simulation.
7. Add multi-runner placement without advanced positioning.
8. Add simple skill engine.
9. Build the simulator UI around fixtures.
10. Add timeline/results visualizations.
11. Add batch simulation and result comparison.
12. Revisit data import once the engine has shape.

## Biggest Risks

- Formula uncertainty: the game has many hidden or community-derived mechanics.
- Data sourcing: track/skill data may be hard to use legally and maintainably.
- Skill conditions: full coverage can become a language/runtime project by itself.
- Overbuilding UI before the engine is inspectable.
- Letting future modules leak into the race sim instead of sharing clean domain data.

## Current Recommendation

Start with a Vite + React + TypeScript app and implement a deliberately small but real simulation slice:

- 3 tracks.
- 4 sample runners.
- 12 sample skills.
- Deterministic single race.
- Timeline and skill log.

Once that exists, we can compare behavior against community formulas and decide whether to chase accuracy, usability, or both in the next pass.
