# UmaSim Next Steps

This is a prioritized working backlog. The project remains Global-first, and
every item that affects simulator behavior must preserve the accuracy contract
in `.agents/AGENTS.md`.

## Next: race and track presets

- [ ] Add a `RacePreset` model separate from raw course geometry. A preset
  should capture event name, course/track ID, surface, distance, direction,
  ground/weather defaults, and source/server metadata.
- [ ] Seed canonical Global presets, starting with **Arima Kinen**. Applying a
  preset should populate Setup without overwriting the user's selected field.
- [ ] Add preset export/import as versioned JSON so a shared setup is
  reproducible and inspectable.
- [ ] Add Champions Meeting (CM) presets: event label, rules, course, and
  conditions. Treat a CM import as a reviewable draft until all fields resolve
  to known Global data.
- [ ] Add a preset details surface showing source, data snapshot version, and
  any inferred or unavailable conditions.

## Analysis and replay workflow

- [ ] Add finish-place and finish-time distributions to the Overview tab.
- [ ] Add outlier shortcuts: fastest win, slowest win, worst finish, and a
  selected Uma's representative run.
- [ ] Persist/export compact batch jobs (setup, seed family, per-run summary),
  then regenerate a detailed replay from any selected seed.
- [ ] Add controlled build comparison: duplicate a baseline, change one
  stat/aptitude/skill/strategy, and run both against the same seed family.
- [ ] Move large batch work off the main UI thread before increasing default
  batch sizes or adding comparison matrices.

## Engine fidelity and skill coverage

- [ ] Turn the Global skill coverage report into a visible backlog, grouped by
  unsupported condition token and effect type.
- [ ] Add targeted condition tests for each supported token family and source
  case; only elevate accuracy status when evidence and a regression case exist.
- [ ] Expand hidden race state carefully: lane behavior, crowding, passing,
  cooldown/repeat activation, debuffs, and owner-versus-inherited unique skill
  behavior.
- [ ] Build a formula evidence register linking each approximation to research,
  assumptions, and validation scenarios.
- [ ] Add data-refresh checks for Global tracks, skills, cards, and character
  profiles; report snapshot age and source version in the UI.

## Build and field experience

- [ ] Add search, filters, sorting, and field presets to the Uma list drawer.
- [ ] Add a guided import review with unresolved-card/skill remediation and
  duplicate-build handling.
- [ ] Add accessible mobile/tablet behavior for the Setup panel, Uma drawer,
  analysis table, and hover-card information.
- [ ] Add keyboard-accessible runner details alongside hover cards.
