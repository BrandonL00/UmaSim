# UmaSim

UmaSim is a planned web app for Umamusume: Pretty Derby tools, starting with a race simulator. The first goal is not to make a pretty shell around loose formulas, but to build a modular simulation core that can later support related tools like gacha simulation, guides, tier lists, race planning, build comparisons, and event calculators.

This project is fan-made and is not affiliated with Cygames or Umamusume: Pretty Derby.

## Product Vision

UmaSim should eventually feel like a trainer workbench:

- Simulate a race with selected track, conditions, runners, stats, aptitudes, strategies, and skills.
- Explain why the result happened instead of only showing placements.
- Let users compare builds, race plans, and skill packages.
- Keep data and simulation logic reusable so future modules can share the same source of truth.

The first release should prioritize correctness, transparency, and iteration speed over visual spectacle.

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the working build plan.

## Quick Start

Requirements:

- Node.js 20.19 or newer
- npm, pnpm, or another Node package manager

Install dependencies and start the local app:

```bash
npm install
npm run dev
```

If you use pnpm:

```bash
pnpm install
pnpm dev
```

Run checks:

```bash
npm test
npm run build
```

## Deployment

UmaSim currently builds as a static Vite app, so it can be hosted on Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any static file host.

Recommended static-host settings:

```text
Build command: npm run build
Output directory: dist
Node version: 20.19 or newer
Environment variables: none required
```

The app stores local Uma library data and latest race logs in the browser. Exported race logs can be placed in [race-logs](./race-logs/README.md) when you want a workspace copy.

## Initial Scope: Race Simulator

The race simulator should answer questions like:

- How does this Uma perform on this course under these conditions?
- Which stat, aptitude, strategy, or skill change matters most?
- When do skills activate, and how do they alter speed, acceleration, stamina, recovery, positioning, or lane behavior?
- How stable is the result across many runs with randomness?

The first version can be deterministic or near-deterministic while the model is still being validated. Monte Carlo race batches can come after the single-race timeline is trustworthy.

## Data Model

The simulator needs several distinct data families. These should be stored separately from UI code and loaded through typed adapters.

### Track Data

Track/course data should include:

- Track id and display name.
- Surface: turf or dirt.
- Distance in meters.
- Distance category: sprint, mile, medium, long.
- Direction and layout details when available.
- Weather and ground condition modifiers.
- Course segments: straights, corners, final corner, final straight, uphill/downhill, slope grade if available.
- Phase boundaries: early, middle, late, last spurt.
- Lane/positioning metadata if we model blocking and passing.

Prior-art repos commonly treat course data as static JSON or database-backed records. This project should start with importable JSON fixtures, then move toward a database-backed catalog once import/update scripts exist.

### Uma / Runner Data

Runner data should include:

- Character id and display name.
- Base stats for a trained runner: speed, stamina, power, guts, wit.
- Aptitudes/proficiencies:
  - Surface: turf, dirt.
  - Distance: sprint, mile, medium, long.
  - Strategy: front runner, pace chaser, late surger, end closer.
- Mood/condition.
- Chosen strategy.
- Equipped skills.
- Optional metadata for future modules: rarity, costume/version, unique skill, growth rates, goals, support-card context.

For simulation, we should distinguish long-lived runner configuration from in-race runner state. A trained Uma is an input; an in-race runner has current speed, target speed, stamina budget, phase, lane, active effects, cooldowns, and race position.

### Skill Data

Skill data should include:

- Skill id, localized names, rarity, group id, icon id, base cost.
- One or more activation alternatives.
- Conditions and preconditions.
- Duration.
- Effects, each with type, target, and modifier.
- Tags for filtering: surface, distance, strategy, phase/location, recovery, speed, acceleration, debuff, unique, inherited.

The model should allow skills to be interpreted by the simulator instead of hard-coded into UI components. Some skills may need custom effect handlers, but the default path should be data-driven.

## Simulation Model

The simulation engine should be isolated from the web UI. It should accept a complete race setup and return a timeline plus summary.

Core concepts:

- Race setup: course, conditions, runners, seed/randomness settings.
- Race phases: early, middle, late, last spurt.
- Runner stats: raw stats, mood-adjusted stats, track-adjusted stats.
- Aptitude modifiers: distance, surface, and strategy.
- Strategy coefficients by race phase.
- Base speed, target speed, minimum speed, acceleration, stamina consumption, and recovery.
- Skill system: activation checks, active effects, effect stacking, expiration.
- Positioning: strategy-based placement, passing, blocking, lane movement, and final placement.
- Result explanation: major speed changes, stamina exhaustion, skill activations, and decisive moments.

First engine output should be simple and inspectable:

```ts
type RaceResult = {
  seed: string;
  placements: Placement[];
  runners: RunnerSummary[];
  timeline: RaceTick[];
  skillEvents: SkillEvent[];
  warnings: SimulationWarning[];
};
```

## Proposed Architecture

The repo should be organized around feature modules and shared domain packages:

```text
src/
  app/                  # Routing, app shell, providers
  features/
    race-sim/            # Race simulator pages and controls
    skills/              # Skill browser/search, later shared by race sim
    guides/              # Future guide/tier list content
    gacha/               # Future gacha simulator
  domain/
    race/                # Pure simulation engine
    data/                # Shared data types, loaders, validation schemas
    uma/                 # Runner/character models
    skills/              # Skill models and effect interpreter
  data/
    fixtures/            # Small checked-in seed data
    generated/           # Generated data, if legally usable
  scripts/
    import-data/          # Data extraction/import/update tooling
    validate-data/        # Schema and consistency checks
  tests/
    race/                 # Engine tests and golden scenarios
```

The simulation core should be usable from tests, scripts, and the web app without depending on React or browser APIs.

## Recommended Stack

Recommended starting point:

- TypeScript for shared types and simulation logic.
- Vite + React for a fast web UI.
- Zod or Valibot for runtime validation of imported data.
- Vitest for deterministic engine tests.
- Playwright later for end-to-end UI checks.
- JSON fixtures first; SQLite or a generated static database once the data surface grows.

This keeps the first implementation lightweight while leaving room for richer data tooling.

## Prior Art / Research Notes

Useful references found during initial planning:

- `kira0x1/kira-uma`: TypeScript/Vite app with `src/data` JSON files for courses and skills, a `src/db` layer, and skill types shaped around alternatives, conditions, durations, effects, and metadata.
- `AZLik/racesim`: Small Python WIP that separates `track.py`, `racer.py`, and `const.py`, with concepts for stats, mood, ground condition, aptitudes, strategy, race phases, acceleration, and phase coefficients.
- Other public race-sim repos exist but appear smaller or less structured at first glance.

We should use these as architectural inspiration only. Avoid copying implementation details directly unless licensing and attribution are clear.

## Data Questions To Resolve

## Data Snapshot And Engine Versioning

The app displays the newest bundled Global data snapshot in its header. This is
the GameTora retrieval timestamp, not a verified Umamusume client build number:
the current source data does not expose an authoritative Global game-version tag.

Each generated GameTora dataset records its server, retrieval time, source
manifest hash, and (for new imports) importer revision. A saved race also records
the engine revision and data snapshot used to create it. The engine revision is
maintained in `src/domain/race/engineVersion.ts` and should be bumped whenever a
deterministic result can change for the same setup and seed. Git tags/releases
can map those revisions to published app builds, but they are not required for
the engine or data provenance itself.

To refresh Global data, run `npm run import:character-cards`, `npm run
import:skills`, and `npm run import:tracks`, then review the generated JSON diff
and run the validation suite. Re-importing is mechanically low risk because the
scripts write only generated catalog files, but the resulting changes can be
high impact: changed conditions/effects, new stat-cap rules, and mechanics
changes require engine and regression-test work before the simulator can claim
current behavior.

Before implementing high-confidence race results, we need to answer:

- What is the best legally safe source for game data?
- Which data can be checked into this repo, and which should be generated locally by users?
- How closely do we want to match the game formulas versus provide a transparent approximation?
- Which region/version is the first data target: global English, Japanese, or both?
- How do we handle localization for names, skill text, and conditions?
- How do we validate simulator output against known race behavior?

## Milestones

### Milestone 0: Project Foundation

- Choose web stack and initialize the app.
- Add linting, formatting, and tests.
- Create core domain folders.
- Add a tiny hand-written fixture set: a few tracks, runners, and skills.

### Milestone 1: Deterministic Single-Runner Timeline

- Parse a race setup.
- Compute adjusted stats from mood, surface, distance, strategy, and track condition.
- Simulate one runner over a course timeline.
- Output speed, target speed, stamina, and phase changes per tick.

### Milestone 2: Multi-Runner Race

- Simulate multiple runners.
- Add strategy-based positioning.
- Produce placements and summary explanations.
- Add deterministic seeded randomness.

### Milestone 3: Skill Engine

- Load skill data.
- Evaluate activation conditions.
- Apply timed effects.
- Show skill event logs in the UI.

### Milestone 4: Validation And Tuning

- Add golden tests for known scenarios.
- Compare output against community formulas and observed race behavior.
- Add warnings when a setup depends on unimplemented mechanics.

### Milestone 5: Usable Web App

- Build race setup UI.
- Add track, runner, and skill selectors.
- Render race timeline charts.
- Add result explanations and build comparison.

## Accuracy Roadmap

The long-term goal is not just a plausible race toy, but a simulator that approaches real in-game behavior closely enough to be trusted for build comparison and race planning. That means treating the race engine as its own product surface.

### Accuracy Priorities

1. Model race state more completely.
2. Interpret imported skill data more faithfully.
3. Validate behavior against known game outcomes and community research.

### Phase 1: Formal Engine State

Expand the in-race model beyond simple speed, stamina, and order. The engine should explicitly track:

- lane and lateral movement state
- blocked states and crowding
- nearby runner relationships
- overtake events and short-term order history
- trigger anchors for corners, straights, and phase randoms
- start quality, temptation/composure, and other hidden race flags
- race metadata such as season, post number, popularity, and track-specific conditions when relevant
- per-run counters and skill activation history

### Phase 2: Engine Subsystems

Split the current simulator into clear subsystems so new mechanics have a stable home:

- positioning
- pathing and lane choice
- movement and stamina
- race event/state tracking
- skill evaluation and effect application

This refactor should happen before we add too many more special cases.

### Phase 3: Condition Expression Coverage

The imported global skill data already exposes a much richer condition language than the current engine supports. We should:

- inventory all condition tokens in the global data set
- classify each token as supported, metadata-only, requires new runtime state, or unknown
- move to a token resolver table with focused tests
- implement exact semantics for trigger-anchor conditions such as random phase/corner/straight activation windows

### Phase 4: Missing Effect Families

The current engine handles stat bonuses, speed, acceleration, and recovery. To approach game accuracy, it must also support the missing effect families that influence:

- navigation and lane handling
- debuffs and pressure/intimidation
- field-of-view or awareness style mechanics
- repeatable and cooldown-based activations

### Phase 5: Unique Skill Fidelity

Unique skills need separate treatment from inherited versions. The simulator should correctly model:

- owner unique vs inherited unique behavior
- unique skill level scaling
- evolved/alternate unique variants when present in imported data

### Phase 6: Determinism And Replay

If a seed is provided, the sim should replay exactly. Random rolls should be structured and stable so engine changes do not silently alter behavior.

### Phase 7: Validation Harness

Accuracy needs measurement. We should build a validation suite with benchmark scenarios covering:

- standard pace/front/late/end builds
- representative track archetypes
- known unique-skill cases
- crowded-lane and blocked-runner scenarios
- skills with special trigger anchors

The output should let us compare activation timing, activation rate, finish ordering, stamina trends, and speed profiles.

### Near-Term Implementation Order

The first serious accuracy pass should happen in this order:

1. Define a richer `EngineState`
2. Refactor the simulator into subsystems
3. Add lane/pathing state
4. Implement navigation-related condition tokens and effects
5. Add repeatable trigger infrastructure
6. Implement debuff/pressure effects
7. Add unique skill level scaling
8. Build validation fixtures and regression tests

### Current Known Limits

Right now the simulator is strongest at straightforward speed, acceleration, recovery, and simple position/phase checks. It is still weak anywhere the real game depends on lane movement, navigation, hidden race flags, repeated activation windows, or unique-skill scaling.

## Open Design Direction

The UI should feel like a dense but friendly strategy tool: fast selectors, readable stat tables, clear timelines, and direct comparison views. It should not start as a marketing page. The first screen should be the simulator or a compact dashboard leading directly into it.

## References

- [kira0x1/kira-uma](https://github.com/kira0x1/kira-uma)
- [AZLik/racesim](https://github.com/AZLik/racesim)
- [Lorenzoludke/Umamusume-Race-Simulator](https://github.com/Lorenzoludke/Umamusume-Race-Simulator)
- [Uma Musume: Pretty Derby overview](https://en.wikipedia.org/wiki/Umamusume%3A_Pretty_Derby)
- [PC Gamer build guide](https://www.pcgamer.com/games/sim/umamusume-build-strategy/)
