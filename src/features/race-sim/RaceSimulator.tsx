import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock,
  Database,
  Dices,
  Download,
  Gauge,
  Medal,
  Play,
  Plus,
  RotateCcw,
  Route,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { catalog } from "../../data/catalog";
import { characterDataMeta, characterTemplates } from "../../data/characters";
import {
  createGlobalSkillEngineMap,
  globalSkillDataMeta,
  globalSkillOptions,
  globalSkills,
  inheritedUniqueSkillOptions,
} from "../../data/skills";
import { globalTrackDataMeta } from "../../data/tracks";
import {
  CharacterCardAmbiguityError,
  createSkillSelectionKey,
  parseHarvestedUmaJson,
  SkillAmbiguityError,
  type CharacterCardChoice,
  type SkillChoice,
} from "../../data/umaImport";
import { simulateRace } from "../../domain/race/simulateRace";
import { simulateRaceBatch, type RaceBatchResult } from "../../domain/race/simulateRaceBatch";
import { accuracyLedger, accuracyStatusLabels, countAccuracyStatuses } from "../../domain/race/accuracyLedger";
import { canModelGlobalSkill } from "../../domain/race/globalSkillModel";
import {
  appendRaceRunLog,
  createRaceRunHistoryDocument,
  createRaceRunLog,
  loadRaceRunHistory,
  saveRaceRunHistory,
  type RaceRunLog,
} from "../../domain/race/runHistory";
import type { GroundCondition, RaceResult, RaceSetup, Weather } from "../../domain/race/types";
import { getPrerequisiteLockOwners, selectSkillWithPrerequisites } from "../../domain/skills/selection";
import {
  createUmaLibraryDocument,
  loadUmaLibrary,
  mergeUmaLibrary,
  saveUmaLibrary,
} from "../../domain/uma/repository";
import type {
  AptitudeRank,
  DistanceCategory,
  Mood,
  RunnerBuild,
  StatKey,
  StoredUma,
  Strategy,
  Surface,
} from "../../domain/uma/types";

const groundConditions: GroundCondition[] = ["firm", "good", "soft", "heavy"];
const weatherConditions: Weather[] = ["sunny", "cloudy", "rainy", "snowy"];
const aptitudeRanks: AptitudeRank[] = ["G", "F", "E", "D", "C", "B", "A", "S"];
const distanceCategories: DistanceCategory[] = ["sprint", "mile", "medium", "long"];
const moods: Mood[] = ["awful", "bad", "normal", "good", "great"];
const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wit"];
const strategies: Strategy[] = ["front", "pace", "late", "end"];
const surfaces: Surface[] = ["turf", "dirt"];
const batchRunCounts = [25, 100, 500] as const;

const defaultCharacterTemplate = characterTemplates[0];
const defaultBuilderSkillIds = [
  ...defaultCharacterTemplate.innateSkillIds,
  ...defaultCharacterTemplate.awakeningSkillIds,
].slice(0, 2);
const globalSkillEngineMap = createGlobalSkillEngineMap();
const modelableGlobalSkillIds = new Set(
  [...globalSkillEngineMap.entries()]
    .filter(([, skill]) => canModelGlobalSkill(skill))
    .map(([skillId]) => skillId),
);
const globalUniqueSkillIds = new Set(
  globalSkills.filter((skill) => skill.rarity === "unique").map((skill) => `gt-${skill.id}`),
);
const accuracyStatusCounts = countAccuracyStatuses();
const builderSkillOptions = globalSkillOptions
  .filter((skill) => skill.rarity !== "unique")
  .map((skill) => ({
    ...skill,
    modeled: modelableGlobalSkillIds.has(skill.id),
  }));

const defaultCustomRunner: RunnerBuild = {
  id: "custom-draft",
  name: defaultCharacterTemplate.name,
  cardId: defaultCharacterTemplate.cardId,
  characterId: defaultCharacterTemplate.characterId,
  characterName: defaultCharacterTemplate.name,
  outfitTitle: defaultCharacterTemplate.outfitTitle,
  variant: defaultCharacterTemplate.variant,
  buildName: `${defaultCharacterTemplate.name} Build`,
  stats: { speed: 900, stamina: 750, power: 800, guts: 500, wit: 600 },
  aptitudes: defaultCharacterTemplate.aptitudes,
  strategy: defaultCharacterTemplate.defaultStrategy,
  mood: "normal",
  uniqueSkillId: defaultCharacterTemplate.uniqueSkillId,
  uniqueSkillLevel: 1,
  skillIds: defaultBuilderSkillIds,
};

const trackGroups = Object.entries(
  catalog.tracks.reduce<Record<string, typeof catalog.tracks>>((groups, track) => {
    const venue = track.venue ?? "Other";
    groups[venue] = [...(groups[venue] ?? []), track];
    return groups;
  }, {}),
).sort(([left], [right]) => left.localeCompare(right));

type PendingCharacterChoice = {
  candidateIndex: number;
  query: string;
  choices: CharacterCardChoice[];
};

type PendingSkillChoice = {
  candidateIndex: number;
  skillIndex: number;
  query: string;
  choices: SkillChoice[];
};

export function RaceSimulator() {
  const [trackId, setTrackId] = useState(catalog.tracks[0].id);
  const [groundCondition, setGroundCondition] = useState<GroundCondition>("firm");
  const [weather, setWeather] = useState<Weather>("sunny");
  const [seed, setSeed] = useState(createRandomSeed);
  const [runMode, setRunMode] = useState<"replay" | "analysis">("replay");
  const [batchRunCount, setBatchRunCount] = useState<(typeof batchRunCounts)[number]>(100);
  const [batchResult, setBatchResult] = useState<RaceBatchResult | null>(null);
  const [savedUmas, setSavedUmas] = useState<StoredUma[]>(loadUmaLibrary);
  const [selectedCharacterId, setSelectedCharacterId] = useState(defaultCharacterTemplate.id);
  const [customDraft, setCustomDraft] = useState<RunnerBuild>(defaultCustomRunner);
  const [skillSearch, setSkillSearch] = useState("");
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [rawUmaJson, setRawUmaJson] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [pendingCharacterChoice, setPendingCharacterChoice] = useState<PendingCharacterChoice | null>(null);
  const [pendingSkillChoice, setPendingSkillChoice] = useState<PendingSkillChoice | null>(null);
  const [importCardSelections, setImportCardSelections] = useState<Record<number, number>>({});
  const [importSkillSelections, setImportSkillSelections] = useState<Record<string, string>>({});
  const [inspectedUmaId, setInspectedUmaId] = useState<string | null>(null);
  const [inspectedRaceRunnerId, setInspectedRaceRunnerId] = useState<string | null>(null);
  const [isTrackDetailsOpen, setIsTrackDetailsOpen] = useState(false);
  const [runHistory, setRunHistory] = useState<RaceRunLog[]>(loadRaceRunHistory);
  const [selectedRunnerIds, setSelectedRunnerIds] = useState(() =>
    selectDefaultRunnerIds(
      [...catalog.runners, ...savedUmas.map((uma): RunnerBuild => ({ ...uma, mood: "normal" }))],
      catalog.tracks[0],
    ),
  );
  const [runnerOverrides, setRunnerOverrides] = useState<Record<string, Pick<RunnerBuild, "strategy" | "mood">>>({});
  const [result, setResult] = useState<RaceResult>(() =>
    simulateRace(
      createSetup(
        trackId,
        groundCondition,
        weather,
        seed,
        [...catalog.runners, ...savedUmas.map((uma): RunnerBuild => ({ ...uma, mood: "normal" }))],
        selectedRunnerIds,
        runnerOverrides,
      ),
      catalog,
      { debugSkills: true },
    ),
  );

  const allRunners = useMemo(
    () => [...catalog.runners, ...savedUmas.map((uma): RunnerBuild => ({ ...uma, mood: "normal" }))],
    [savedUmas],
  );
  const selectedCharacter =
    characterTemplates.find((character) => character.id === selectedCharacterId) ?? defaultCharacterTemplate;
  const selectedUniqueGlobalSkill = selectedCharacter.uniqueSkillId.startsWith("gt-")
    ? globalSkills.find((skill) => `gt-${skill.id}` === selectedCharacter.uniqueSkillId)
    : null;
  const filteredSkillOptions = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();

    if (!query) {
      return builderSkillOptions;
    }

    return builderSkillOptions.filter((skill) =>
      [skill.name, skill.description, skill.tags.join(" ")].some((value) => value.toLowerCase().includes(query)),
    );
  }, [skillSearch]);
  const skillById = useMemo(
    () => new Map([...builderSkillOptions, ...inheritedUniqueSkillOptions].map((skill) => [skill.id, skill])),
    [],
  );
  const allSkillById = useMemo(
    () => new Map([...globalSkillOptions, ...inheritedUniqueSkillOptions].map((skill) => [skill.id, skill])),
    [],
  );
  const prerequisiteLockOwners = useMemo(
    () => getPrerequisiteLockOwners(customDraft.skillIds, builderSkillOptions),
    [customDraft.skillIds],
  );
  const track = catalog.tracks.find((candidate) => candidate.id === trackId) ?? catalog.tracks[0];

  const setup = useMemo(
    () => createSetup(trackId, groundCondition, weather, seed, allRunners, selectedRunnerIds, runnerOverrides),
    [trackId, groundCondition, weather, seed, allRunners, selectedRunnerIds, runnerOverrides],
  );

  const selectedRunners = setup.runners;
  const timelineEnd = result.timeline.at(-1);
  const resultByRunnerId = useMemo(
    () => new Map(result.runners.map((runner) => [runner.runnerId, runner])),
    [result.runners],
  );
  const inspectedUma = allRunners.find((runner) => runner.id === inspectedUmaId) ?? null;
  const inspectedUmaTemplate = inspectedUma
    ? characterTemplates.find((character) => character.cardId === inspectedUma.cardId) ?? null
    : null;
  const inspectedUmaOverride = inspectedUma
    ? runnerOverrides[inspectedUma.id] ?? {
        strategy: inspectedUma.strategy,
        mood: inspectedUma.mood,
      }
    : null;
  const inspectedRaceRunner = selectedRunners.find((runner) => runner.id === inspectedRaceRunnerId) ?? null;
  const inspectedRaceTemplate = inspectedRaceRunner
    ? characterTemplates.find((character) => character.cardId === inspectedRaceRunner.cardId) ?? null
    : null;
  const inspectedRaceOverride = inspectedRaceRunner
    ? runnerOverrides[inspectedRaceRunner.id] ?? {
        strategy: inspectedRaceRunner.strategy,
        mood: inspectedRaceRunner.mood,
      }
    : null;
  const inspectedRaceSummary = inspectedRaceRunner ? resultByRunnerId.get(inspectedRaceRunner.id) ?? null : null;
  const inspectedBatchRunner = batchResult?.runners.find((runner) => runner.runnerId === inspectedRaceRunnerId) ?? batchResult?.runners[0] ?? null;
  const inspectedSkillDebug = useMemo(() => {
    if (!inspectedRaceRunner) {
      return [];
    }

    return (result.skillDebug ?? []).filter((entry) => entry.runnerId === inspectedRaceRunner.id);
  }, [inspectedRaceRunner, result.skillDebug]);
  const inspectedSampledMarkers = useMemo(
    () =>
      inspectedSkillDebug.flatMap((entry) =>
        entry.sampledTargets.map((target, index) => ({
          id: `${entry.skillId}-sampled-${index}`,
          label: `${entry.skillName}: ${target.label}`,
          distanceMeters: target.distanceMeters,
          second: entry.activation?.second ?? 0,
          phase: "sampled",
          status: entry.status,
        })),
      ),
    [inspectedSkillDebug],
  );
  const inspectedRunnerEvents = useMemo(() => {
    if (!inspectedRaceRunner) {
      return [];
    }

    return result.skillEvents
      .filter((event) => event.runnerId === inspectedRaceRunner.id)
      .map((event) => {
        const timelineFrame =
          result.timeline.find((tick) => tick.second >= event.second)?.runners.find((tickRunner) => tickRunner.runnerId === inspectedRaceRunner.id) ??
          timelineEnd?.runners.find((tickRunner) => tickRunner.runnerId === inspectedRaceRunner.id);
        const distanceMeters = timelineFrame?.distanceMeters ?? 0;

        return {
          ...event,
          distanceMeters,
          progress: track.distanceMeters > 0 ? distanceMeters / track.distanceMeters : 0,
          phase: timelineFrame?.phase ?? "early",
        };
      });
  }, [inspectedRaceRunner, result.skillEvents, result.timeline, timelineEnd, track.distanceMeters]);
  const simulationCoverage = useMemo(() => {
    const modeledIds = new Set([
      ...catalog.skills.map((skill) => skill.id),
      ...globalSkillOptions.filter((skill) => modelableGlobalSkillIds.has(skill.id)).map((skill) => skill.id),
    ]);
    const equipped = selectedRunners.flatMap((runner) => [
      runner.uniqueSkillId,
      ...runner.skillIds,
    ]);
    const uniqueEquipped = [...new Set(equipped)];
    const ignoredIds = uniqueEquipped.filter((skillId) => !modeledIds.has(skillId));

    return {
      equippedCount: uniqueEquipped.length,
      modeledCount: uniqueEquipped.length - ignoredIds.length,
      ignoredSkills: ignoredIds.map((skillId) => allSkillById.get(skillId)?.name ?? skillId),
    };
  }, [allSkillById, selectedRunners]);

  useEffect(() => {
    saveUmaLibrary(savedUmas);
  }, [savedUmas]);

  useEffect(() => {
    saveRaceRunHistory(runHistory);
  }, [runHistory]);

  function runRace() {
    if (runMode === "analysis") {
      const nextBatch = simulateRaceBatch(setup, catalog, batchRunCount);
      setBatchResult(nextBatch);
      setResult(nextBatch.representativeRace);
      setInspectedRaceRunnerId(null);
      return;
    }

    const nextResult = simulateRace(setup, catalog, { debugSkills: true });

    setBatchResult(null);
    setResult(nextResult);
    setRunHistory((current) => appendRaceRunLog(current, createRaceRunLog(setup, track, nextResult)));
  }

  function changeTrack(nextTrackId: string) {
    const nextTrack = catalog.tracks.find((candidate) => candidate.id === nextTrackId) ?? catalog.tracks[0];

    setTrackId(nextTrack.id);
    setSelectedRunnerIds((current) => current.slice(0, getRaceLaneCapacity(nextTrack)));
  }

  function resetSample() {
    const nextSeed = createRandomSeed();

    const defaultTrack = catalog.tracks[0];

    setTrackId(defaultTrack.id);
    setGroundCondition("firm");
    setWeather("sunny");
    setSeed(nextSeed);
    setBatchResult(null);
    setSelectedCharacterId(defaultCharacterTemplate.id);
    setCustomDraft(defaultCustomRunner);
    setSkillSearch("");
    setIsBuilderOpen(false);
    setIsLibraryOpen(false);
    setPendingCharacterChoice(null);
    setPendingSkillChoice(null);
    setInspectedUmaId(null);
    setInspectedRaceRunnerId(null);
    setIsTrackDetailsOpen(false);
    setImportCardSelections({});
    setImportSkillSelections({});
    setSelectedRunnerIds(selectDefaultRunnerIds(allRunners, defaultTrack));
    setRunnerOverrides({});
    setResult(
      simulateRace(
        createSetup(
          defaultTrack.id,
          "firm",
          "sunny",
          nextSeed,
          allRunners,
          selectDefaultRunnerIds(allRunners, defaultTrack),
          {},
        ),
        catalog,
        { debugSkills: true },
      ),
    );
  }

  function loadRunLog(log: RaceRunLog) {
    setTrackId(log.setup.trackId);
    setGroundCondition(log.setup.groundCondition);
    setWeather(log.setup.weather);
    setSeed(log.setup.seed);
    setSelectedRunnerIds(log.setup.runners.map((runner) => runner.id));
    setRunnerOverrides(
      Object.fromEntries(log.setup.runners.map((runner) => [runner.id, { strategy: runner.strategy, mood: runner.mood }])),
    );
    setResult(log.result);
    setBatchResult(null);
    setInspectedRaceRunnerId(null);
  }

  function clearRunHistory() {
    setRunHistory([]);
  }

  function exportRunHistory() {
    const latestRun = runHistory[0] ?? null;
    const exportPayload = latestRun ?? createRaceRunHistoryDocument([]);
    const blob = new Blob([`${JSON.stringify(exportPayload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "latest-race-run.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function addCustomRunner() {
    const { mood: _draftMood, ...storedDraft } = customDraft;
    const runner: StoredUma = {
      ...storedDraft,
      id: `custom-${Date.now()}`,
      name: selectedCharacter.name,
      cardId: selectedCharacter.cardId,
      characterId: selectedCharacter.characterId,
      characterName: selectedCharacter.name,
      outfitTitle: selectedCharacter.outfitTitle,
      variant: selectedCharacter.variant,
      buildName: customDraft.buildName.trim() || `${selectedCharacter.name} Build`,
      stats: normalizeStats(customDraft.stats),
      uniqueSkillId: selectedCharacter.uniqueSkillId,
      skillIds: customDraft.skillIds.filter((skillId) => !isUniqueSkill(skillId)),
    };

    setSavedUmas((current) => mergeUmaLibrary(current, [runner]));
    setSelectedRunnerIds((current) => addRunnerIdsWithinCapacity(current, [runner.id], track));
    setCustomDraft({
      ...runner,
      mood: "normal",
      id: "custom-draft",
      buildName: `${runner.buildName} Copy`,
    });
    setIsBuilderOpen(false);
  }

  function applyCharacterTemplate(characterId: string) {
    const template = characterTemplates.find((character) => character.id === characterId) ?? defaultCharacterTemplate;

    setSelectedCharacterId(template.id);
    setCustomDraft((draft) => ({
      ...draft,
      name: template.name,
      cardId: template.cardId,
      characterId: template.characterId,
      characterName: template.name,
      outfitTitle: template.outfitTitle,
      variant: template.variant,
      buildName: `${template.name}${template.variant ? ` ${toTitleCase(template.variant)}` : ""} Build`,
      strategy: template.defaultStrategy,
      aptitudes: template.aptitudes,
      uniqueSkillId: template.uniqueSkillId,
      skillIds: draft.skillIds.filter((skillId) => !isUniqueSkill(skillId)),
    }));
  }

  function removeCustomRunner(runnerId: string) {
    setSavedUmas((current) => current.filter((runner) => runner.id !== runnerId));
    setSelectedRunnerIds((current) => current.filter((id) => id !== runnerId));
    setRunnerOverrides((current) => {
      const next = { ...current };
      delete next[runnerId];
      return next;
    });
  }

  function importRawUmas(
    cardSelections = importCardSelections,
    skillSelections = importSkillSelections,
  ) {
    setImportError("");
    setImportMessage("");

    try {
      const imported = parseHarvestedUmaJson(rawUmaJson, { cardSelections, skillSelections });
      setSavedUmas((current) => mergeUmaLibrary(current, imported));
      setSelectedRunnerIds((current) => addRunnerIdsWithinCapacity(current, imported.map((runner) => runner.id), track));
      setImportMessage(`Imported ${imported.length} Uma${imported.length === 1 ? "" : "s"}.`);
      setRawUmaJson("");
      setPendingCharacterChoice(null);
      setPendingSkillChoice(null);
      setImportCardSelections({});
      setImportSkillSelections({});
    } catch (error) {
      if (error instanceof CharacterCardAmbiguityError) {
        setPendingCharacterChoice({
          candidateIndex: error.candidateIndex,
          query: error.query,
          choices: error.choices,
        });
        return;
      }
      if (error instanceof SkillAmbiguityError) {
        setPendingSkillChoice({
          candidateIndex: error.candidateIndex,
          skillIndex: error.skillIndex,
          query: error.query,
          choices: error.choices,
        });
        return;
      }
      setImportError(error instanceof Error ? error.message : "Could not import Uma JSON.");
    }
  }

  function chooseImportedCharacterCard(cardId: number) {
    if (!pendingCharacterChoice) return;

    const nextSelections = {
      ...importCardSelections,
      [pendingCharacterChoice.candidateIndex]: cardId,
    };
    setImportCardSelections(nextSelections);
    setPendingCharacterChoice(null);
    importRawUmas(nextSelections, importSkillSelections);
  }

  function chooseImportedSkill(skillId: string) {
    if (!pendingSkillChoice) return;

    const key = createSkillSelectionKey(
      pendingSkillChoice.candidateIndex,
      pendingSkillChoice.skillIndex,
    );
    const nextSelections = {
      ...importSkillSelections,
      [key]: skillId,
    };
    setImportSkillSelections(nextSelections);
    setPendingSkillChoice(null);
    importRawUmas(importCardSelections, nextSelections);
  }

  function exportUmaLibrary() {
    const documentData = createUmaLibraryDocument(savedUmas);
    const blob = new Blob([`${JSON.stringify(documentData, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "umasim-uma-library.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />
      <section className="toolbar">
        <div>
          <p className="eyebrow">UmaSim race lab</p>
          <h1>Race simulator</h1>
          <p className="toolbar-subtitle">
            Tune the course, runners, and seed, then inspect the pace state and skill calls.
          </p>
        </div>
        <div className="toolbar-actions">
          <button
            className="ghost-button"
            onClick={() => {
              setIsLibraryOpen(true);
              setIsBuilderOpen(false);
            }}
            type="button"
          >
            <Database size={16} />
            Uma Library
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setIsBuilderOpen(true);
              setIsLibraryOpen(false);
            }}
            type="button"
          >
            <Plus size={16} />
            Add Uma
          </button>
          <button className="ghost-button" onClick={resetSample} type="button">
            <RotateCcw size={16} />
            Reset
          </button>
          <button className="primary-button" onClick={runRace} type="button">
            {runMode === "analysis" ? <BarChart3 size={16} /> : <Play size={16} />}
            {runMode === "analysis" ? `Run ${batchRunCount}-race analysis` : "Run race"}
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel setup-panel">
          <div className="panel-heading">
            <Gauge size={18} />
            <h2>Setup</h2>
          </div>

          <button
            className="course-card course-card-button"
            onClick={() => setIsTrackDetailsOpen(true)}
            type="button"
          >
            <span>Current course</span>
            <strong>{track.name}</strong>
            <div className="course-profile" aria-label={`${track.name} course diagram`}>
              {track.segments.map((segment) => (
                <i
                  className={`${segment.kind} ${segment.slope ?? "flat"}`}
                  key={`${segment.startMeters}-${segment.endMeters}`}
                  style={{ width: `${((segment.endMeters - segment.startMeters) / track.distanceMeters) * 100}%` }}
                  title={`${segment.kind}, ${segment.slope ?? "flat"}: ${segment.startMeters}-${segment.endMeters}m`}
                />
              ))}
            </div>
            {track.representativeRaces?.length ? (
              <small>{track.representativeRaces.map((race) => race.name).join(" / ")}</small>
            ) : null}
          </button>

          <label className="field">
            <span>Course</span>
            <select value={trackId} onChange={(event) => changeTrack(event.target.value)}>
              {trackGroups.map(([venue, venueTracks]) => (
                <optgroup key={venue} label={venue}>
                  {venueTracks?.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name.replace(`${venue} `, "")}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="analysis-controls">
            <span>Simulation mode</span>
            <div className="segmented-control" role="group" aria-label="Simulation mode">
              <button className={runMode === "replay" ? "is-selected" : ""} onClick={() => setRunMode("replay")} type="button">
                Replay
              </button>
              <button className={runMode === "analysis" ? "is-selected" : ""} onClick={() => setRunMode("analysis")} type="button">
                Analysis
              </button>
            </div>
            {runMode === "analysis" ? (
              <label className="field compact-field">
                <span>Deterministic runs</span>
                <select value={batchRunCount} onChange={(event) => setBatchRunCount(Number(event.target.value) as typeof batchRunCount)}>
                  {batchRunCounts.map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          <div className="track-facts">
            <span>{globalTrackDataMeta.count} Global courses</span>
            <span>{track.surface}</span>
            <span>{track.distanceMeters}m</span>
            <span>{track.distanceCategory}</span>
            <span>{track.direction}</span>
            <span>{weather}</span>
          </div>

          <div className="compact-grid two">
            <label className="field">
              <span>Ground</span>
              <select value={groundCondition} onChange={(event) => setGroundCondition(event.target.value as GroundCondition)}>
                {groundConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Weather</span>
              <select value={weather} onChange={(event) => setWeather(event.target.value as Weather)}>
                {weatherConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Seed</span>
            <div className="input-action-row">
              <input value={seed} onChange={(event) => setSeed(event.target.value)} />
              <button
                aria-label="Generate random seed"
                className="icon-button seed-button"
                onClick={() => setSeed(createRandomSeed())}
                title="Generate random seed"
                type="button"
              >
                <Dices size={16} />
              </button>
            </div>
          </label>
        </div>

        <div className="panel runner-panel">
          <div className="panel-heading">
            <Activity size={18} />
            <h2>Runners</h2>
          </div>

          <div className="runner-table">
            {allRunners.map((runner) => {
              const isSelected = selectedRunnerIds.includes(runner.id);
              const override = runnerOverrides[runner.id] ?? { strategy: runner.strategy, mood: runner.mood };
              const placement = batchResult ? null : result.placements.find((candidate) => candidate.runnerId === runner.id);
              const isSaved = savedUmas.some((savedUma) => savedUma.id === runner.id);

              return (
                <div className={isSelected ? "runner-row is-selected" : "runner-row"} key={runner.id}>
                  <div className="runner-select-cell">
                    <input
                      aria-label={`Select ${runner.name}`}
                      checked={isSelected}
                      onChange={() => {
                        setSelectedRunnerIds((current) =>
                          current.includes(runner.id)
                            ? current.filter((id) => id !== runner.id)
                            : addRunnerIdsWithinCapacity(current, [runner.id], track),
                        );
                      }}
                      type="checkbox"
                    />
                    <button
                      className="runner-profile-button"
                      onClick={() => setInspectedUmaId(runner.id)}
                      type="button"
                    >
                      <img
                        alt=""
                        src={
                          characterTemplates.find((character) => character.cardId === runner.cardId)?.thumbImg ?? ""
                        }
                      />
                      <span className="runner-identity">
                        <strong>{runner.characterName}</strong>
                        <small>{runner.outfitTitle}</small>
                        <small>{runner.buildName}</small>
                      </span>
                    </button>
                  </div>
                  <div className="stat-strip">
                    {placement ? <span className="place-chip">#{placement.place}</span> : null}
                    <CompactStatRow stats={runner.stats} />
                  </div>
                  <select
                    aria-label={`${runner.name} strategy`}
                    disabled={!isSelected}
                    value={override.strategy}
                    onChange={(event) =>
                      setRunnerOverrides((current) => ({
                        ...current,
                        [runner.id]: { ...override, strategy: event.target.value as Strategy },
                      }))
                    }
                  >
                    {strategies.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {strategy}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${runner.name} mood`}
                    disabled={!isSelected}
                    value={override.mood}
                    onChange={(event) =>
                      setRunnerOverrides((current) => ({
                        ...current,
                        [runner.id]: { ...override, mood: event.target.value as Mood },
                      }))
                    }
                  >
                    {moods.map((mood) => (
                      <option key={mood} value={mood}>
                        {mood}
                      </option>
                    ))}
                  </select>
                  {isSaved ? (
                    <button className="icon-button" onClick={() => removeCustomRunner(runner.id)} title="Remove custom runner" type="button">
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel result-panel">
          <div className="panel-heading">
            <Medal size={18} />
            <h2>{runMode === "analysis" && batchResult ? "Analysis" : "Result"}</h2>
            <span className="simulation-badge">Approximate model</span>
          </div>

          <div className="simulation-coverage">
            <strong>{simulationCoverage.modeledCount}/{simulationCoverage.equippedCount}</strong>
            <span>equipped skills simulated</span>
          </div>

          <details className="accuracy-ledger">
            <summary>
              Model accuracy: {accuracyStatusCounts.verified} verified, {accuracyStatusCounts.approximation} approximate
            </summary>
            <p>
              This simulator reports approximations explicitly. See each area below before using a result for theorycrafting.
            </p>
            <div className="accuracy-ledger-list">
              {accuracyLedger.map((entry) => (
                <div className={`accuracy-ledger-row is-${entry.status}`} key={entry.id}>
                  <span>{accuracyStatusLabels[entry.status]}</span>
                  <div>
                    <strong>{entry.label}</strong>
                    <p>{entry.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {runMode === "analysis" && batchResult ? (
            <BatchAnalysis result={batchResult} inspectedRunner={inspectedBatchRunner} onInspect={setInspectedRaceRunnerId} />
          ) : (
          <div className="placements">
            {result.placements.map((placement) => {
              const summary = resultByRunnerId.get(placement.runnerId);
              const runner = selectedRunners.find((candidate) => candidate.id === placement.runnerId);

              return (
                <button
                  className="placement-row detailed-placement-row placement-button"
                  key={placement.runnerId}
                  onClick={() => setInspectedRaceRunnerId(placement.runnerId)}
                  type="button"
                >
                  <div className="placement-copy">
                    <span>#{placement.place} {runner?.characterName ?? placement.runnerName}</span>
                    <small>
                      {runner?.buildName ?? "Unnamed build"} {" · "} {placement.finishTime.toFixed(2)}s
                      {summary && summary.gapToWinner > 0 ? ` · +${summary.gapToWinner.toFixed(2)}s` : " · Winner"}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
          )}

          <div className="run-history">
            <div className="run-history-heading">
              <div>
                <span>Latest run log</span>
                <strong>{runHistory.length ? "1 saved run" : "No saved run"}</strong>
              </div>
              <div className="run-history-actions">
                <button
                  className="icon-button"
                  disabled={runHistory.length === 0}
                  onClick={exportRunHistory}
                  title="Export latest run"
                  type="button"
                >
                  <Download size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={runHistory.length === 0}
                  onClick={clearRunHistory}
                  title="Clear run history"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {runHistory.length === 0 ? (
              <p className="run-history-empty">Run a race to persist the latest setup, result, timeline, and skill debug log.</p>
            ) : (
              <div className="run-history-list">
                {runHistory.slice(0, 6).map((log) => {
                  const winner = log.result.placements[0];
                  const eventCount = log.result.skillEvents.length;

                  return (
                    <button className="run-history-row" key={log.id} onClick={() => loadRunLog(log)} type="button">
                      <Clock size={15} />
                      <div>
                        <strong>{winner?.runnerName ?? "No winner"}</strong>
                        <span>
                          {formatRunDate(log.createdAt)} {" - "} {log.track.name} {" - "} seed {log.result.seed}
                        </span>
                      </div>
                      <small>
                        {winner ? `${winner.finishTime.toFixed(2)}s` : "--"}
                        {" - "}
                        {eventCount} skills
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {isBuilderOpen ? (
        <section
          aria-labelledby="add-uma-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsBuilderOpen(false);
            }
          }}
        >
        <form
          className="panel builder-panel modal-panel"
          onSubmit={(event) => {
            event.preventDefault();
            addCustomRunner();
          }}
        >
          <div className="modal-heading">
            <div className="panel-heading">
              <Plus size={18} />
              <h2 id="add-uma-title">Add Uma</h2>
            </div>
            <button className="icon-button modal-close" onClick={() => setIsBuilderOpen(false)} title="Close" type="button">
              <X size={16} />
            </button>
          </div>

          <div className="builder-intro">
            <label className="field">
              <span>Character card ({characterDataMeta.count} Global)</span>
              <select value={selectedCharacterId} onChange={(event) => applyCharacterTemplate(event.target.value)}>
                {characterTemplates.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.displayName}
                  </option>
                ))}
              </select>
            </label>

            <div
              className="character-card"
              style={{
                "--character-main": selectedCharacter.colorMain,
                "--character-sub": selectedCharacter.colorSub,
              } as CSSProperties}
            >
              <img alt="" src={selectedCharacter.thumbImg} />
              <div>
                <span>Selected Uma</span>
                <strong>{selectedCharacter.name}</strong>
                <small>{selectedCharacter.outfitTitle}</small>
                <small>
                  {selectedCharacter.variant ? `${selectedCharacter.variant} · ` : ""}
                  Card {selectedCharacter.cardId}
                </small>
              </div>
            </div>

            <div className="unique-card">
              <span>Unique skill</span>
                <strong>{selectedCharacter.uniqueSkillName}</strong>
              <small>
                {selectedUniqueGlobalSkill?.tags.join(", ") ?? "unique"}
                {selectedUniqueGlobalSkill
                  ? canModelGlobalSkill(selectedUniqueGlobalSkill)
                    ? " - imported and simulated"
                    : " - imported as data only"
                  : ""}
              </small>
              {selectedCharacter.inheritedUniqueSkillName ? (
                <small>Inherited: {selectedCharacter.inheritedUniqueSkillName}</small>
              ) : null}
              {selectedCharacter.uniqueSkillCandidateIds.length > 1 ? (
                <small>{selectedCharacter.uniqueSkillCandidateIds.length} owner-unique candidates resolved</small>
              ) : null}
              <label className="unique-level">
                <span>Level</span>
                <select
                  value={customDraft.uniqueSkillLevel}
                  onChange={(event) =>
                    setCustomDraft((draft) => ({ ...draft, uniqueSkillLevel: Number(event.target.value) }))
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <option key={level} value={level}>
                      Lv {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="builder-layout">
            <div className="builder-block">
              <label className="field">
                <span>Build name</span>
                <input
                  value={customDraft.buildName}
                  onChange={(event) => setCustomDraft((draft) => ({ ...draft, buildName: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Strategy</span>
                <select
                  value={customDraft.strategy}
                  onChange={(event) =>
                    setCustomDraft((draft) => ({ ...draft, strategy: event.target.value as Strategy }))
                  }
                >
                  {strategies.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {strategy}
                    </option>
                  ))}
                </select>
              </label>

              <div className="stat-editor">
                {statKeys.map((stat) => (
                  <label className="field" key={stat}>
                    <span>{stat}</span>
                    <input
                      min={1}
                      max={2000}
                      type="number"
                      value={customDraft.stats[stat]}
                      onChange={(event) =>
                        setCustomDraft((draft) => ({
                          ...draft,
                          stats: { ...draft.stats, [stat]: Number(event.target.value) },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="builder-block">
              <h3>Aptitudes</h3>
              <div className="aptitude-section">
                <span className="section-label">Surface</span>
                <div className="compact-grid two">
                  {surfaces.map((surface) => (
                    <label className="field" key={surface}>
                      <span>{surface}</span>
                      <select
                        value={customDraft.aptitudes.surface[surface]}
                        onChange={(event) =>
                          setCustomDraft((draft) => ({
                            ...draft,
                            aptitudes: {
                              ...draft.aptitudes,
                              surface: { ...draft.aptitudes.surface, [surface]: event.target.value as AptitudeRank },
                            },
                          }))
                        }
                      >
                        {aptitudeRanks.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="aptitude-section">
                <span className="section-label">Distance</span>
                <div className="compact-grid four">
                  {distanceCategories.map((distance) => (
                    <label className="field" key={distance}>
                      <span>{distance}</span>
                      <select
                        value={customDraft.aptitudes.distance[distance]}
                        onChange={(event) =>
                          setCustomDraft((draft) => ({
                            ...draft,
                            aptitudes: {
                              ...draft.aptitudes,
                              distance: { ...draft.aptitudes.distance, [distance]: event.target.value as AptitudeRank },
                            },
                          }))
                        }
                      >
                        {aptitudeRanks.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="aptitude-section">
                <span className="section-label">Strategy</span>
                <div className="compact-grid four">
                  {strategies.map((strategy) => (
                    <label className="field" key={strategy}>
                      <span>{strategy}</span>
                      <select
                        value={customDraft.aptitudes.strategy[strategy]}
                        onChange={(event) =>
                          setCustomDraft((draft) => ({
                            ...draft,
                            aptitudes: {
                              ...draft.aptitudes,
                              strategy: { ...draft.aptitudes.strategy, [strategy]: event.target.value as AptitudeRank },
                            },
                          }))
                        }
                      >
                        {aptitudeRanks.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="builder-block">
              <h3>Skills ({globalSkillDataMeta.count} Global imported)</h3>
              <label className="field skill-search">
                <span>Search skills</span>
                <input
                  placeholder="Name, tag, or effect text"
                  value={skillSearch}
                  onChange={(event) => setSkillSearch(event.target.value)}
                />
              </label>
              <div className="skill-count">
                {filteredSkillOptions.length} of {builderSkillOptions.length}
              </div>
              <div className="skill-picker">
                {filteredSkillOptions.map((skill) => {
                  const isSelectedUnique = skill.id === selectedCharacter.uniqueSkillId;
                  const isNativeUnique = skill.rarity === "unique";
                  const isChecked = isSelectedUnique || customDraft.skillIds.includes(skill.id);
                  const lockOwnerIds = prerequisiteLockOwners.get(skill.id) ?? [];
                  const lockOwnerNames = lockOwnerIds
                    .map((id) => skillById.get(id)?.name)
                    .filter((name): name is string => Boolean(name));
                  const isPrerequisiteLocked = lockOwnerIds.length > 0;

                  return (
                    <label
                      className={[
                        "skill-option",
                        isChecked ? "is-checked" : "",
                        skill.modeled ? "is-modeled" : "is-data",
                        `is-${skill.rarity}`,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={skill.id}
                      title={skill.description}
                    >
                      <input
                        checked={isChecked}
                        disabled={isNativeUnique || isPrerequisiteLocked}
                        onChange={() =>
                          setCustomDraft((draft) => ({
                            ...draft,
                            skillIds: draft.skillIds.includes(skill.id)
                              ? draft.skillIds.filter((id) => id !== skill.id)
                              : selectSkillWithPrerequisites(draft.skillIds, skill.id, builderSkillOptions),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{skill.name}</span>
                      <small>
                        {isSelectedUnique
                          ? "unique, locked to character"
                          : isNativeUnique
                            ? "unique, belongs to another character"
                          : isPrerequisiteLocked
                            ? `required by ${lockOwnerNames.join(", ")}`
                          : `${skill.modeled ? "modeled" : "data"} - ${skill.tags.join(", ")}`}
                      </small>
                    </label>
                  );
                })}
              </div>

              <button className="primary-button builder-submit" type="submit">
                <Plus size={16} />
                Add Uma to race
              </button>
            </div>
          </div>
        </form>
        </section>
      ) : null}

      {isLibraryOpen ? (
        <section
          aria-labelledby="uma-library-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsLibraryOpen(false);
            }
          }}
        >
          <div className="panel library-panel modal-panel">
            <div className="modal-heading">
              <div className="panel-heading">
                <Database size={18} />
                <h2 id="uma-library-title">Uma Library</h2>
              </div>
              <button className="icon-button modal-close" onClick={() => setIsLibraryOpen(false)} title="Close" type="button">
                <X size={16} />
              </button>
            </div>

            <div className="library-toolbar">
              <span>{savedUmas.length} saved</span>
              <button className="ghost-button" disabled={savedUmas.length === 0} onClick={exportUmaLibrary} type="button">
                <Download size={16} />
                Export JSON
              </button>
            </div>

            <div className="library-layout">
              <section className="library-section">
                <h3>Saved Umas</h3>
                {savedUmas.length === 0 ? (
                  <p className="empty-state">Your saved Uma library is empty.</p>
                ) : (
                  <div className="library-list">
                    {savedUmas.map((runner) => (
                      <div className="library-row" key={runner.id}>
                        <div>
                          <strong>{runner.characterName}</strong>
                          <small>{runner.outfitTitle}</small>
                          <small>{runner.buildName}</small>
                          <span>
                            {runner.strategy} - unique Lv {runner.uniqueSkillLevel} - {runner.skillIds.length} skills
                          </span>
                        </div>
                        <div className="stat-strip">
                          <span>Spd {runner.stats.speed}</span>
                          <span>Sta {runner.stats.stamina}</span>
                          <span>Pow {runner.stats.power}</span>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() => removeCustomRunner(runner.id)}
                          title="Delete saved Uma"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="library-section">
                <h3>Import Raw JSON</h3>
                <textarea
                  aria-label="Raw Uma JSON"
                  placeholder={'{\n  "character": "Taiki Shuttle",\n  "variant": "camping",\n  "buildName": "Mile Leader Build",\n  "stats": { "speed": 1000, "stamina": 800, "power": 900, "guts": 500, "wit": 700 },\n  "aptitudes": {\n    "surface": { "turf": "A", "dirt": "B" },\n    "distance": { "sprint": "A", "mile": "A", "medium": "E", "long": "G" },\n    "strategy": { "front": "C", "pace": "A", "late": "E", "end": "G" }\n  },\n  "strategy": "Pace Chaser",\n  "uniqueSkillLevel": 3,\n  "skills": ["Swinging Maestro", "Homestretch Haste"]\n}'}
                  value={rawUmaJson}
                  onChange={(event) => {
                    setRawUmaJson(event.target.value);
                    setImportError("");
                    setImportMessage("");
                    setPendingCharacterChoice(null);
                    setPendingSkillChoice(null);
                    setImportCardSelections({});
                    setImportSkillSelections({});
                  }}
                />
                {importError ? <p className="form-message error">{importError}</p> : null}
                {importMessage ? <p className="form-message success">{importMessage}</p> : null}
                <button
                  className="primary-button import-button"
                  disabled={!rawUmaJson.trim()}
                  onClick={() => importRawUmas()}
                  type="button"
                >
                  <Upload size={16} />
                  Import JSON
                </button>
              </section>
            </div>
          </div>
        </section>
      ) : null}

      {pendingCharacterChoice ? (
        <section
          aria-labelledby="character-choice-title"
          aria-modal="true"
          className="modal-backdrop character-choice-backdrop"
          role="dialog"
        >
          <div className="panel modal-panel character-choice-panel">
            <div className="modal-heading">
              <div className="panel-heading">
                <Sparkles size={18} />
                <h2 id="character-choice-title">Which Uma is this?</h2>
              </div>
              <button
                className="icon-button modal-close"
                onClick={() => setPendingCharacterChoice(null)}
                title="Close"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <p className="choice-query">
              <strong>{pendingCharacterChoice.query}</strong> matched more than one outfit.
            </p>

            <div className="character-choice-list">
              {pendingCharacterChoice.choices.map((choice) => (
                <button
                  className="character-choice-option"
                  key={choice.cardId}
                  onClick={() => chooseImportedCharacterCard(choice.cardId)}
                  type="button"
                >
                  <img alt="" src={choice.thumbImg} />
                  <span>
                    <strong>{choice.name}</strong>
                    <small>{choice.outfitTitle}</small>
                    <small>
                      {choice.variant ? `${toTitleCase(choice.variant)} · ` : ""}
                      {choice.uniqueSkillName}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {pendingSkillChoice ? (
        <section
          aria-labelledby="skill-choice-title"
          aria-modal="true"
          className="modal-backdrop character-choice-backdrop"
          role="dialog"
        >
          <div className="panel modal-panel character-choice-panel">
            <div className="modal-heading">
              <div className="panel-heading">
                <Sparkles size={18} />
                <h2 id="skill-choice-title">Which skill is this?</h2>
              </div>
              <button
                className="icon-button modal-close"
                onClick={() => setPendingSkillChoice(null)}
                title="Close"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <p className="choice-query">
              <strong>{pendingSkillChoice.query}</strong> matched more than one skill tier.
            </p>

            <div className="character-choice-list">
              {pendingSkillChoice.choices.map((choice) => (
                <button
                  className="character-choice-option skill-choice-option"
                  key={choice.skillId}
                  onClick={() => chooseImportedSkill(choice.skillId)}
                  type="button"
                >
                  <span className="skill-tier-mark">
                    {choice.tier === "double-circle" ? "◎" : choice.tier === "circle" ? "○" : "S"}
                  </span>
                  <span>
                    <strong>{choice.name}</strong>
                    <small>{choice.description}</small>
                    <small>
                      {choice.rarity}
                      {choice.prerequisiteNames.length
                        ? ` · includes ${choice.prerequisiteNames.join(", ")}`
                        : ""}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {inspectedUma && inspectedUmaTemplate && inspectedUmaOverride ? (
        <section
          aria-labelledby="uma-details-title"
          aria-modal="true"
          className="modal-backdrop runner-details-backdrop"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspectedUmaId(null);
          }}
        >
          <div
            className="panel modal-panel runner-details-panel"
            style={{
              "--runner-main": inspectedUmaTemplate.colorMain,
              "--runner-sub": inspectedUmaTemplate.colorSub,
            } as CSSProperties}
          >
            <div className="runner-details-hero">
              <div className="runner-art">
                <img alt={inspectedUma.characterName} src={inspectedUmaTemplate.fullImage} />
              </div>
              <div className="runner-sheet">
                <div className="runner-sheet-heading">
                  <div>
                    <span>{inspectedUma.outfitTitle}</span>
                    <h2 id="uma-details-title">{inspectedUma.characterName}</h2>
                    <p>{inspectedUma.buildName}</p>
                  </div>
                  <button
                    className="icon-button modal-close"
                    onClick={() => setInspectedUmaId(null)}
                    title="Close"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="runner-status-line">
                  <span>{toTitleCase(inspectedUmaOverride.strategy)}</span>
                  <span>Base build</span>
                  <span>Unique Lv {inspectedUma.uniqueSkillLevel}</span>
                </div>

                <div className="runner-stat-grid">
                  {statKeys.map((stat) => (
                    <div className={`runner-stat is-${stat}`} key={stat}>
                      <span>{stat}</span>
                      <strong>{inspectedUma.stats[stat]}</strong>
                    </div>
                  ))}
                </div>

                <div className="runner-aptitude-groups">
                  <AptitudeGroup label="Surface" values={surfaces.map((key) => [key, inspectedUma.aptitudes.surface[key]])} />
                  <AptitudeGroup
                    label="Distance"
                    values={distanceCategories.map((key) => [key, inspectedUma.aptitudes.distance[key]])}
                  />
                  <AptitudeGroup
                    label="Strategy"
                    values={strategies.map((key) => [key, inspectedUma.aptitudes.strategy[key]])}
                  />
                </div>

                <div className="runner-skill-sheet">
                  {inspectedRaceSummary && false ? (
                    <div className="runner-race-trace">
                      <div className="runner-trace-heading">
                        <h3>Race trace</h3>
                        <span>
                          {inspectedRaceSummary?.finishTime.toFixed(2)}s · {inspectedRaceSummary?.triggeredSkillCount} skills
                        </span>
                      </div>
                      <TrackDiagram
                        markers={inspectedRunnerEvents.map((event) => ({
                          id: `${event.skillId}-${event.second}`,
                          label: event.skillName,
                          distanceMeters: event.distanceMeters,
                          second: event.second,
                          phase: event.phase,
                        }))}
                        track={track}
                      />
                      <div className="runner-event-timeline">
                        {inspectedRunnerEvents.length === 0 ? (
                          <p className="runner-trace-empty">No simulated skill activations on this run.</p>
                        ) : (
                          inspectedRunnerEvents.map((event) => (
                            <div className="runner-event-row" key={`${event.skillId}-${event.second}`}>
                              <span className="runner-event-distance">{event.distanceMeters.toFixed(0)}m</span>
                              <div className="runner-event-copy">
                                <strong>{event.skillName}</strong>
                                <small>
                                  {event.second.toFixed(1)}s · {toTitleCase(event.phase)} · {Math.round(event.progress * 100)}%
                                </small>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                  <h3>Skills</h3>
                  <div className="runner-skill-list">
                    <div className="runner-skill-chip is-unique">
                      <strong>{inspectedUmaTemplate.uniqueSkillName}</strong>
                      <small>Unique · Lv {inspectedUma.uniqueSkillLevel}</small>
                    </div>
                    {inspectedUma.skillIds.map((skillId) => {
                      const skill = allSkillById.get(skillId);
                      return (
                        <div className="runner-skill-chip" key={skillId}>
                          <strong>{skill?.name ?? skillId}</strong>
                          <small>{skill?.description ?? "Skill data unavailable"}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {inspectedRaceRunner && inspectedRaceTemplate && inspectedRaceOverride && inspectedRaceSummary ? (
        <section
          aria-labelledby="race-run-title"
          aria-modal="true"
          className="modal-backdrop runner-details-backdrop"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspectedRaceRunnerId(null);
          }}
        >
          <div
            className="panel modal-panel runner-details-panel race-run-panel"
            style={{
              "--runner-main": inspectedRaceTemplate.colorMain,
              "--runner-sub": inspectedRaceTemplate.colorSub,
            } as CSSProperties}
          >
            <div className="runner-details-hero">
              <div className="runner-art race-run-art">
                <img alt={inspectedRaceRunner.characterName} src={inspectedRaceTemplate.fullImage} />
              </div>
              <div className="runner-sheet">
                <div className="runner-sheet-heading">
                  <div>
                    <span>{track.name}</span>
                    <h2 id="race-run-title">{inspectedRaceRunner.characterName}</h2>
                    <p>{inspectedRaceRunner.buildName}</p>
                  </div>
                  <button
                    className="icon-button modal-close"
                    onClick={() => setInspectedRaceRunnerId(null)}
                    title="Close"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="runner-status-line">
                  <span>{toTitleCase(inspectedRaceOverride.strategy)}</span>
                  <span>{toTitleCase(inspectedRaceOverride.mood)} mood</span>
                  <span>{inspectedRaceSummary.finishTime.toFixed(2)}s finish</span>
                  <span>{inspectedRaceSummary.triggeredSkillCount} skills</span>
                </div>

                <div className="runner-stat-grid race-stat-grid">
                  <div className="runner-stat is-speed">
                    <span>avg speed</span>
                    <strong>{inspectedRaceSummary.averageSpeed.toFixed(2)}</strong>
                  </div>
                  <div className="runner-stat is-stamina">
                    <span>top speed</span>
                    <strong>{inspectedRaceSummary.topSpeed.toFixed(2)}</strong>
                  </div>
                  <div className="runner-stat is-power">
                    <span>stamina</span>
                    <strong>{inspectedRaceSummary.remainingStamina.toFixed(0)}</strong>
                  </div>
                  <div className="runner-stat is-guts">
                    <span>gap</span>
                    <strong>{inspectedRaceSummary.gapToWinner.toFixed(2)}</strong>
                  </div>
                  <div className="runner-stat is-wit">
                    <span>finish</span>
                    <strong>#{result.placements.find((placement) => placement.runnerId === inspectedRaceRunner.id)?.place ?? "-"}</strong>
                  </div>
                </div>

                <div className="runner-race-trace">
                  <div className="runner-trace-heading">
                    <h3>Race trace</h3>
                    <span>
                      {track.distanceMeters}m - {track.surface} - {toTitleCase(track.direction ?? "straight")}
                    </span>
                  </div>
                  <TrackDiagram
                    markers={[
                      ...inspectedSampledMarkers,
                      ...inspectedRunnerEvents.map((event) => ({
                        id: `${event.skillId}-${event.second}`,
                        label: event.skillName,
                        distanceMeters: event.distanceMeters,
                        second: event.second,
                        phase: event.phase,
                        status: "activated",
                      })),
                    ]}
                    track={track}
                  />
                  <RaceTriggerTimeline debugEntries={inspectedSkillDebug} events={inspectedRunnerEvents} track={track} />
                  <div className="runner-event-timeline">
                    {inspectedRunnerEvents.length === 0 ? (
                      <p className="runner-trace-empty">No simulated skill activations on this run.</p>
                    ) : (
                      inspectedRunnerEvents.map((event) => (
                        <div className="runner-event-row" key={`${event.skillId}-${event.second}`}>
                          <span className="runner-event-distance">{event.distanceMeters.toFixed(0)}m</span>
                          <div className="runner-event-copy">
                            <strong>{event.skillName}</strong>
                            <small>
                              {event.second.toFixed(1)}s - {toTitleCase(event.phase)} - {Math.round(event.progress * 100)}%
                            </small>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="runner-skill-debug-list">
                    {inspectedSkillDebug.length === 0 ? (
                      <p className="runner-trace-empty">No skill debug data for this runner.</p>
                    ) : (
                      inspectedSkillDebug.map((entry) => (
                        <details className={`runner-skill-debug-row is-${entry.status}`} key={entry.skillId}>
                          <summary>
                            <span>{entry.status}</span>
                            <strong>{entry.skillName}</strong>
                            <small>{entry.sampledTargets.length ? `${entry.sampledTargets.length} sampled points` : "no sampled window"}</small>
                          </summary>
                          <p>{entry.reason}</p>
                          <small>{entry.conditionSummary}</small>
                          {entry.sampledTargets.length ? (
                            <div className="runner-debug-targets">
                              {entry.sampledTargets.map((target) => (
                                <span key={`${entry.skillId}-${target.label}-${target.distanceMeters}`}>
                                  {target.label}: {target.distanceMeters.toFixed(0)}m
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </details>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {isTrackDetailsOpen ? (
        <section
          aria-labelledby="track-details-title"
          aria-modal="true"
          className="modal-backdrop track-details-backdrop"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsTrackDetailsOpen(false);
          }}
        >
          <div className="panel modal-panel track-details-panel">
            <div className="track-details-heading">
              <div>
                <span>{track.venue ?? "Racecourse"}</span>
                <h2 id="track-details-title">{track.name}</h2>
                <p>
                  {track.distanceMeters}m · {track.surface} · {track.distanceCategory} · {track.direction}
                </p>
              </div>
              <button
                className="icon-button modal-close"
                onClick={() => setIsTrackDetailsOpen(false)}
                title="Close"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <TrackDiagram track={track} />

            <div className="track-detail-grid">
              <section>
                <h3>Course</h3>
                <dl>
                  <div><dt>Venue</dt><dd>{track.venue ?? "Unknown"}</dd></div>
                  <div><dt>Surface</dt><dd>{toTitleCase(track.surface)}</dd></div>
                  <div><dt>Distance</dt><dd>{track.distanceMeters}m</dd></div>
                  <div><dt>Direction</dt><dd>{toTitleCase(track.direction ?? "straight")}</dd></div>
                  <div><dt>Layout</dt><dd>{track.courseVariant ?? "Standard"}</dd></div>
                </dl>
              </section>

              <section>
                <h3>Sections</h3>
                <dl>
                  <div><dt>Corners</dt><dd>{track.segments.filter((segment) => segment.kind === "corner").length}</dd></div>
                  <div><dt>Straights</dt><dd>{track.segments.filter((segment) => segment.kind === "straight").length}</dd></div>
                  <div><dt>Uphill</dt><dd>{formatSegmentDistance(track, "uphill")}m</dd></div>
                  <div><dt>Downhill</dt><dd>{formatSegmentDistance(track, "downhill")}m</dd></div>
                </dl>
              </section>

              <section>
                <h3>Representative races</h3>
                <div className="track-race-list">
                  {track.representativeRaces?.length ? (
                    track.representativeRaces.map((race) => <span key={race.id}>{race.name}</span>)
                  ) : (
                    <span>No listed races</span>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      ) : null}

      <section className="detail-grid">
        <div className="panel timeline-panel">
          <div className="panel-heading">
            <ChevronRight size={18} />
            <h2>Race state</h2>
          </div>

          <div className="timeline-list">
            {selectedRunners.map((runner) => {
              const latest = timelineEnd?.runners.find((candidate) => candidate.runnerId === runner.id);
              const summary = resultByRunnerId.get(runner.id);
              const progress = latest ? (latest.distanceMeters / track.distanceMeters) * 100 : 0;

              return (
                <button
                  className="timeline-row timeline-runner-button"
                  key={runner.id}
                  onClick={() => setInspectedRaceRunnerId(runner.id)}
                  type="button"
                >
                  <div className="timeline-copy">
                    <strong>{runner.name}</strong>
                    <span>
                      {latest?.phase ?? "early"} · avg {summary?.averageSpeed.toFixed(2) ?? "0.00"} m/s · top{" "}
                      {summary?.topSpeed.toFixed(2) ?? "0.00"} m/s · stamina {summary?.remainingStamina.toFixed(0) ?? "0"} ·{" "}
                      {summary?.triggeredSkillCount ?? 0} skills
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel events-panel">
          <div className="panel-heading">
            <Sparkles size={18} />
            <h2>Skill log</h2>
            <span className="simulation-badge">Simulated activations</span>
          </div>

          {simulationCoverage.ignoredSkills.length ? (
            <details className="coverage-warning">
              <summary>{simulationCoverage.ignoredSkills.length} imported skills not simulated yet</summary>
              <p>{simulationCoverage.ignoredSkills.join(", ")}</p>
            </details>
          ) : null}

          {result.skillEvents.length === 0 ? (
            <p className="empty-state">No skills triggered on this run.</p>
          ) : (
            <div className="event-list">
              {result.skillEvents.map((event) => (
                <div className="event-row" key={`${event.runnerId}-${event.skillId}-${event.second}`}>
                  <span>{event.second.toFixed(1)}s</span>
                  <strong>
                    {event.skillName}
                    <small>{event.source === "global" ? "Global" : "Fixture"}</small>
                  </strong>
                  <p>{event.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function BatchAnalysis({
  result,
  inspectedRunner,
  onInspect,
}: {
  result: RaceBatchResult;
  inspectedRunner: RaceBatchResult["runners"][number] | null;
  onInspect: (runnerId: string) => void;
}) {
  return (
    <div className="batch-analysis">
      <p className="batch-analysis-intro">
        {result.runCount} deterministic runs from seed <code>{result.baseSeed}</code>. Select a runner to inspect aggregate skill usage; the detail panels show the first representative replay.
      </p>
      <div className="batch-analysis-table" role="table" aria-label="Batch race analysis">
        <div className="batch-analysis-header" role="row">
          <span>Runner</span><span>Win</span><span>Top 3</span><span>Avg place</span><span>Avg time</span><span>P90 time</span>
        </div>
        {result.runners.map((runner) => (
          <button
            className={runner.runnerId === inspectedRunner?.runnerId ? "batch-analysis-row is-selected" : "batch-analysis-row"}
            key={runner.runnerId}
            onClick={() => onInspect(runner.runnerId)}
            type="button"
          >
            <strong>{runner.runnerName}</strong>
            <span>{runner.winRate.toFixed(0)}%</span>
            <span>{runner.topThreeRate.toFixed(0)}%</span>
            <span>{runner.averagePlace.toFixed(2)}</span>
            <span>{runner.averageFinishTime.toFixed(2)}s</span>
            <span>{runner.finishTimeP90.toFixed(2)}s</span>
          </button>
        ))}
      </div>
      {inspectedRunner ? (
        <section className="batch-skill-summary">
          <div>
            <span>Aggregate skills</span>
            <strong>{inspectedRunner.runnerName}</strong>
          </div>
          <small>Average remaining stamina: {inspectedRunner.averageRemainingStamina.toFixed(0)}</small>
          {inspectedRunner.skills.length ? (
            <div className="batch-skill-list">
              {inspectedRunner.skills.map((skill) => (
                <div className={skill.modeled ? "batch-skill-row" : "batch-skill-row is-unmodeled"} key={skill.skillId}>
                  <strong>{skill.skillName}</strong>
                  <span>{skill.modeled ? `${skill.activationRate.toFixed(0)}% activated` : "Unmodeled"}</span>
                </div>
              ))}
            </div>
          ) : <p>No equipped skills were available for this runner.</p>}
        </section>
      ) : null}
    </div>
  );
}

function createSetup(
  trackId: string,
  groundCondition: GroundCondition,
  weather: Weather,
  seed: string,
  runners: RunnerBuild[],
  selectedRunnerIds: string[],
  runnerOverrides: Record<string, Pick<RunnerBuild, "strategy" | "mood">>,
): RaceSetup {
  return {
    seed,
    trackId,
    groundCondition,
    weather,
    runners: runners
      .filter((runner) => selectedRunnerIds.includes(runner.id))
      .map((runner) => ({
        ...runner,
        ...(runnerOverrides[runner.id] ?? {}),
    })),
  };
}

function getRaceLaneCapacity(track: typeof catalog.tracks[number]): number {
  return track.laneCount ?? 18;
}

function selectDefaultRunnerIds(runners: RunnerBuild[], track: typeof catalog.tracks[number]): string[] {
  return runners.slice(0, getRaceLaneCapacity(track)).map((runner) => runner.id);
}

function addRunnerIdsWithinCapacity(
  currentRunnerIds: string[],
  nextRunnerIds: string[],
  track: typeof catalog.tracks[number],
): string[] {
  const selected = [...currentRunnerIds];
  const selectedSet = new Set(selected);
  const capacity = getRaceLaneCapacity(track);

  for (const runnerId of nextRunnerIds) {
    if (selectedSet.has(runnerId) || selected.length >= capacity) {
      continue;
    }

    selected.push(runnerId);
    selectedSet.add(runnerId);
  }

  return selected;
}

function normalizeStats(stats: RunnerBuild["stats"]): RunnerBuild["stats"] {
  return {
    speed: clampStat(stats.speed),
    stamina: clampStat(stats.stamina),
    power: clampStat(stats.power),
    guts: clampStat(stats.guts),
    wit: clampStat(stats.wit),
  };
}

function clampStat(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(value), 1), 2000);
}

function createRandomSeed(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().split("-")[0];
  }

  return Math.random().toString(36).slice(2, 10);
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isUniqueSkill(skillId: string): boolean {
  return skillId.startsWith("unique-") || globalUniqueSkillIds.has(skillId);
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AptitudeGroup({
  label,
  values,
}: {
  label: string;
  values: Array<[string, AptitudeRank]>;
}) {
  return (
    <section className="runner-aptitude-group">
      <h3>{label}</h3>
      <div>
        {values.map(([name, rank]) => (
          <span className={`aptitude-rank is-${rank.toLowerCase()}`} key={name}>
            <small>{name}</small>
            <strong>{rank}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function CompactStatRow({ stats }: { stats: RunnerBuild["stats"] }) {
  return (
    <div className="compact-stat-row">
      {statKeys.map((stat) => (
        <span className={`compact-stat is-${stat}`} key={stat}>
          <strong>{stats[stat]}</strong>
        </span>
      ))}
    </div>
  );
}

function TrackDiagram({
  track,
  markers = [],
}: {
  track: typeof catalog.tracks[number];
  markers?: Array<{
    id: string;
    label: string;
    distanceMeters: number;
    second: number;
    phase: string;
    status?: string;
  }>;
}) {
  const width = 1000;
  const height = 300;
  const left = 44;
  const right = 24;
  const plotWidth = width - left - right;
  const scaleX = (meters: number) => left + (meters / track.distanceMeters) * plotWidth;
  const phaseBoundaries = [0, 1 / 6, 2 / 3, 5 / 6, 1];
  const phaseNames = ["Opening", "Mid-race", "Late-race", "Last spurt"];
  const tickStep = track.distanceMeters <= 1400 ? 200 : track.distanceMeters <= 2400 ? 400 : 600;
  const ticks = Array.from(
    { length: Math.floor(track.distanceMeters / tickStep) + 1 },
    (_, index) => index * tickStep,
  ).filter((tick) => tick < track.distanceMeters);
  ticks.push(track.distanceMeters);

  let elevation = 0;
  const elevationPoints: Array<[number, number]> = [[left, 228]];

  for (const segment of track.segments) {
    const direction = segment.slope === "uphill" ? -1 : segment.slope === "downhill" ? 1 : 0;
    elevation += direction * 14;
    elevation = Math.min(Math.max(elevation, -34), 34);
    elevationPoints.push([scaleX(segment.endMeters), 228 + elevation]);
  }

  return (
    <div className="track-diagram-shell">
      <div className="track-diagram-title">
        <Route size={17} />
        <span>Course diagram</span>
      </div>
      <svg
        aria-label={`${track.name} full course diagram`}
        className="track-diagram"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect className="diagram-bg" height={height} rx="12" width={width} />

        {phaseNames.map((phase, index) => {
          const start = left + phaseBoundaries[index] * plotWidth;
          const end = left + phaseBoundaries[index + 1] * plotWidth;
          return (
            <g key={phase}>
              <rect className={`phase-band phase-${index}`} height="34" width={end - start} x={start} y="26" />
              <text className="phase-label" textAnchor="middle" x={(start + end) / 2} y="48">{phase}</text>
            </g>
          );
        })}

        <line className="diagram-axis" x1={left} x2={width - right} y1="105" y2="105" />
        {track.segments.map((segment) => {
          const x = scaleX(segment.startMeters);
          const segmentWidth = scaleX(segment.endMeters) - x;
          const isFinal = segment.tags?.includes("finalCorner") || segment.tags?.includes("finalStraight");
          return (
            <g key={`${segment.startMeters}-${segment.endMeters}`}>
              <rect
                className={`course-segment is-${segment.kind} ${isFinal ? "is-final" : ""}`}
                height="54"
                rx="7"
                width={Math.max(segmentWidth - 2, 2)}
                x={x + 1}
                y="78"
              />
              {segmentWidth > 72 ? (
                <text className="segment-label" textAnchor="middle" x={x + segmentWidth / 2} y="110">
                  {segment.kind === "corner" ? "Corner" : "Straight"}
                </text>
              ) : null}
            </g>
          );
        })}

        {ticks.map((tick) => {
          const x = scaleX(tick);
          return (
            <g key={tick}>
              <line className="tick-line" x1={x} x2={x} y1="137" y2="151" />
              <text className="tick-label" textAnchor="middle" x={x} y="169">{tick}m</text>
            </g>
          );
        })}

        <text className="elevation-label" x={left} y="204">Elevation</text>
        <line className="elevation-base" x1={left} x2={width - right} y1="228" y2="228" />
        <polyline
          className="elevation-line"
          points={elevationPoints.map(([x, y]) => `${x},${y}`).join(" ")}
        />

        {markers.map((marker) => {
          const x = scaleX(Math.min(Math.max(marker.distanceMeters, 0), track.distanceMeters));
          return (
            <g className={`track-event-marker is-${marker.status ?? marker.phase.toLowerCase()}`} key={marker.id}>
              <title>
                {marker.status === "activated" ? `${marker.label} at ${marker.second.toFixed(1)}s` : marker.label}
              </title>
              <line className="track-event-line" x1={x} x2={x} y1="72" y2="150" />
              <circle className="track-event-dot" cx={x} cy={105} r="7" />
            </g>
          );
        })}

        <circle className="start-marker" cx={left} cy="105" r="7" />
        <line className="finish-marker" x1={width - right} x2={width - right} y1="72" y2="139" />
        <text className="finish-label" textAnchor="end" x={width - right - 7} y="70">Finish</text>
      </svg>
      <div className="track-diagram-legend">
        <span><i className="legend-straight" /> Straight</span>
        <span><i className="legend-corner" /> Corner</span>
        <span><i className="legend-final" /> Final section</span>
        <span><i className="legend-slope" /> Elevation</span>
        {markers.length ? <span><i className="legend-event" /> Skill trigger</span> : null}
      </div>
    </div>
  );
}

function RaceTriggerTimeline({
  track,
  events,
  debugEntries,
}: {
  track: typeof catalog.tracks[number];
  events: Array<{
    skillId: string;
    skillName: string;
    distanceMeters: number;
    second: number;
    progress: number;
    phase: string;
  }>;
  debugEntries: NonNullable<RaceResult["skillDebug"]>;
}) {
  const width = 1000;
  const left = 44;
  const right = 24;
  const plotWidth = width - left - right;

  return (
    <div className="runner-trigger-strip-shell">
      <div className="runner-trigger-strip" style={{ width }}>
        <div className="runner-trigger-axis" />
        {debugEntries.flatMap((entry) =>
          entry.sampledTargets.map((target, index) => {
            const clampedProgress = Math.min(Math.max(target.distanceRate / 100, 0), 1);
            const leftPx = left + clampedProgress * plotWidth;
            return (
              <div
                className={`runner-trigger-sample is-${entry.status}`}
                key={`${entry.skillId}-sample-${index}`}
                style={{ left: `${leftPx}px` }}
                title={`${entry.skillName}: ${target.label}`}
              />
            );
          }),
        )}
        {events.map((event, index) => {
          const clampedProgress = Math.min(Math.max(event.progress, 0), 1);
          const leftPx = left + clampedProgress * plotWidth;
          return (
            <div
              className={`runner-trigger-marker ${index % 2 === 0 ? "is-upper" : "is-lower"}`}
              key={`${event.skillId}-${event.second}`}
              style={{ left: `${leftPx}px` }}
              title={`${event.skillName} at ${event.second.toFixed(1)}s`}
            >
              <span>{event.skillName}</span>
              <small>
                {event.second.toFixed(1)}s - {event.distanceMeters.toFixed(0)}m
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatSegmentDistance(
  track: typeof catalog.tracks[number],
  slope: "uphill" | "downhill",
): number {
  return track.segments
    .filter((segment) => segment.slope === slope)
    .reduce((total, segment) => total + segment.endMeters - segment.startMeters, 0);
}
