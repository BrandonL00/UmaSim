import {
  ChevronRight,
  Database,
  Download,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { catalog } from "../../data/catalog";
import { characterDataMeta, characterTemplates, type CharacterTemplate } from "../../data/characters";
import { championsMeetingPresets, racePresets } from "../../data/presets";
import { formatSnapshotDate, simulationProvenance } from "../../data/simulationProvenance";
import {
  createGlobalSkillEngineMap,
  globalSkillDataMeta,
  globalSkillOptions,
  globalSkills,
  inheritedUniqueSkillOptions,
  unmodeledSourceSkillOptions,
} from "../../data/skills";
import {
  CharacterCardAmbiguityError,
  createSkillSelectionKey,
  getMissingBuildNameRequests,
  parseHarvestedUmaJsonWithReport,
  SkillAmbiguityError,
  type CharacterCardChoice,
  type SkillChoice,
} from "../../data/umaImport";
import { simulateRace, simulationTickSeconds } from "../../domain/race/simulateRace";
import { replayBatchRun, simulateRaceBatch, type RaceBatchResult } from "../../domain/race/simulateRaceBatch";
import { canModelGlobalSkill } from "../../domain/race/globalSkillModel";
import {
  appendRaceRunLog,
  createRaceRunHistoryDocument,
  createRaceRunLog,
  loadRaceRunHistory,
  saveRaceRunHistory,
  type RaceRunLog,
} from "../../domain/race/runHistory";
import type { GroundCondition, RaceResult, RaceSeason, RaceSetup, RaceTeam, Weather } from "../../domain/race/types";
import { formatChampionsMeetingPresetName, type ChampionsMeetingPreset, type RacePreset } from "../../domain/race/presets";
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
  RunnerBuild,
  StatKey,
  StoredUma,
  Strategy,
  Surface,
} from "../../domain/uma/types";
import { AptitudeGroup, formatSegmentDistance, RaceTriggerTimeline, TrackDiagram } from "./components/RaceVisuals";
import {
  AnalysisPanel,
  type BatchRunCount,
  type BatchView,
  ChampionsMeetingPresetPicker,
  RaceDetailsPanel,
  RacePresetPicker,
  SetupPanel,
  UmaListPanel,
  type RunnerOverride,
} from "./panels";

const aptitudeRanks: AptitudeRank[] = ["G", "F", "E", "D", "C", "B", "A", "S"];
const distanceCategories: DistanceCategory[] = ["sprint", "mile", "medium", "long"];
const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wit"];
const strategies: Strategy[] = ["front", "pace", "late", "end"];
const surfaces: Surface[] = ["turf", "dirt"];
const teamColors = ["#55b89c", "#d6a944", "#6f9de8", "#d8738a", "#a887e8", "#e4874f"];

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

type PendingBuildName = {
  candidateIndex: number;
  suggestedName: string;
  value: string;
};

type SelectedSetupPreset =
  | { kind: "race"; preset: RacePreset }
  | { kind: "championsMeeting"; preset: ChampionsMeetingPreset };

export function RaceSimulatorPage() {
  const [trackId, setTrackId] = useState(catalog.tracks[0].id);
  const [targetRunnerCount, setTargetRunnerCount] = useState(() => getRaceLaneCapacity(catalog.tracks[0]));
  const [groundCondition, setGroundCondition] = useState<GroundCondition>("firm");
  const [weather, setWeather] = useState<Weather>("sunny");
  const [season, setSeason] = useState<RaceSeason>("spring");
  const [seed, setSeed] = useState(createRandomSeed);
  const [tickSeconds, setTickSeconds] = useState(simulationTickSeconds);
  const [runMode, setRunMode] = useState<"replay" | "analysis">("analysis");
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [batchRunCount, setBatchRunCount] = useState<BatchRunCount>(100);
  const [batchResult, setBatchResult] = useState<RaceBatchResult | null>(null);
  const [batchView, setBatchView] = useState<BatchView>("overview");
  const [selectedBatchRunnerId, setSelectedBatchRunnerId] = useState<string | null>(null);
  const [batchReplayRunIndex, setBatchReplayRunIndex] = useState<number | null>(null);
  const [isFieldDrawerOpen, setIsFieldDrawerOpen] = useState(false);
  const [savedUmas, setSavedUmas] = useState<StoredUma[]>(loadUmaLibrary);
  const [fieldFillers, setFieldFillers] = useState<RunnerBuild[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(defaultCharacterTemplate.id);
  const [customDraft, setCustomDraft] = useState<RunnerBuild>(defaultCustomRunner);
  const [skillSearch, setSkillSearch] = useState("");
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [rawUmaJson, setRawUmaJson] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingCharacterChoice, setPendingCharacterChoice] = useState<PendingCharacterChoice | null>(null);
  const [pendingSkillChoice, setPendingSkillChoice] = useState<PendingSkillChoice | null>(null);
  const [importCardSelections, setImportCardSelections] = useState<Record<number, number>>({});
  const [importSkillSelections, setImportSkillSelections] = useState<Record<string, string>>({});
  const [importBuildNameSelections, setImportBuildNameSelections] = useState<Record<number, string>>({});
  const [pendingBuildNames, setPendingBuildNames] = useState<PendingBuildName[] | null>(null);
  const [inspectedUmaId, setInspectedUmaId] = useState<string | null>(null);
  const [inspectedRaceRunnerId, setInspectedRaceRunnerId] = useState<string | null>(null);
  const [isTrackDetailsOpen, setIsTrackDetailsOpen] = useState(false);
  const [isRacePresetPickerOpen, setIsRacePresetPickerOpen] = useState(false);
  const [isChampionsMeetingPresetPickerOpen, setIsChampionsMeetingPresetPickerOpen] = useState(false);
  const [selectedSetupPreset, setSelectedSetupPreset] = useState<SelectedSetupPreset | null>(null);
  const [runHistory, setRunHistory] = useState<RaceRunLog[]>(loadRaceRunHistory);
  const [selectedRunnerIds, setSelectedRunnerIds] = useState(() =>
    selectDefaultRunnerIds(catalog.runners, catalog.tracks[0]),
  );
  const [runnerOverrides, setRunnerOverrides] = useState<Record<string, RunnerOverride>>({});
  const [teamMode, setTeamMode] = useState<"individual" | "teams">("individual");
  const [raceTeams, setRaceTeams] = useState<RaceTeam[]>(createDefaultRaceTeams);
  const [runnerTeamIds, setRunnerTeamIds] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RaceResult>(() =>
    simulateRace(
      createSetup(
        trackId,
        groundCondition,
        weather,
        season,
        seed,
        tickSeconds,
        [...catalog.runners, ...savedUmas.map((uma): RunnerBuild => ({ ...uma, mood: "normal" })), ...fieldFillers],
        selectedRunnerIds,
        runnerOverrides,
        teamMode,
        raceTeams,
        runnerTeamIds,
      ),
      catalog,
      { debugSkills: true },
    ),
  );

  const allRunners = useMemo(
    () => [...catalog.runners, ...savedUmas.map((uma): RunnerBuild => ({ ...uma, mood: "normal" })), ...fieldFillers],
    [fieldFillers, savedUmas],
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
    () => new Map([...globalSkillOptions, ...inheritedUniqueSkillOptions, ...unmodeledSourceSkillOptions].map((skill) => [skill.id, skill])),
    [],
  );
  const prerequisiteLockOwners = useMemo(
    () => getPrerequisiteLockOwners(customDraft.skillIds, builderSkillOptions),
    [customDraft.skillIds],
  );
  const track = catalog.tracks.find((candidate) => candidate.id === trackId) ?? catalog.tracks[0];

  const setup = useMemo(
    () => createSetup(
      trackId,
      groundCondition,
      weather,
      season,
      seed,
      tickSeconds,
      allRunners,
      selectedRunnerIds,
      runnerOverrides,
      teamMode,
      raceTeams,
      runnerTeamIds,
    ),
    [
      trackId,
      groundCondition,
      weather,
      season,
      seed,
      tickSeconds,
      allRunners,
      selectedRunnerIds,
      runnerOverrides,
      teamMode,
      raceTeams,
      runnerTeamIds,
    ],
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
        popularityRank: Math.max(selectedRunnerIds.indexOf(inspectedUma.id), 0) + 1,
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
        popularityRank: inspectedRaceRunner.popularityRank ?? 1,
        gateBlock: inspectedRaceRunner.gateBlock,
      }
    : null;
  const inspectedRaceSummary = inspectedRaceRunner ? resultByRunnerId.get(inspectedRaceRunner.id) ?? null : null;
  const inspectedBatchRunner = batchResult?.runners.find((runner) => runner.runnerId === selectedBatchRunnerId) ?? batchResult?.runners[0] ?? null;
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

  async function runAnalysis() {
    flushSync(() => setIsSimulating(true));
    await yieldToBrowser();

    try {
      const nextBatch = simulateRaceBatch(setup, catalog, batchRunCount);
      setRunMode("analysis");
      setBatchResult(nextBatch);
      setResult(replayBatchRun(nextBatch, catalog, 1));
      setBatchView("overview");
      setSelectedBatchRunnerId(nextBatch.runners[0]?.runnerId ?? null);
      setBatchReplayRunIndex(null);
      setInspectedRaceRunnerId(null);
      setHasRunSimulation(true);
    } finally {
      setIsSimulating(false);
    }
  }

  async function runReplay() {
    flushSync(() => setIsSimulating(true));
    await yieldToBrowser();

    try {
      const nextResult = simulateRace(setup, catalog, { debugSkills: true });

      setRunMode("replay");
      setBatchResult(null);
      setBatchReplayRunIndex(null);
      setResult(nextResult);
      setRunHistory((current) =>
        appendRaceRunLog(current, createRaceRunLog(setup, track, nextResult, simulationProvenance)),
      );
      setHasRunSimulation(true);
    } finally {
      setIsSimulating(false);
    }
  }

  function changeTrack(nextTrackId: string) {
    const nextTrack = catalog.tracks.find((candidate) => candidate.id === nextTrackId) ?? catalog.tracks[0];

    setTrackId(nextTrack.id);
    setSelectedRunnerIds((current) => current.slice(0, getRaceLaneCapacity(nextTrack)));
    setTargetRunnerCount((current) => Math.min(current, getRaceLaneCapacity(nextTrack)));
  }

  function changeTargetRunnerCount(nextCount: number) {
    const target = Math.min(Math.max(Math.round(nextCount) || 1, 1), getRaceLaneCapacity(track));
    setTargetRunnerCount(target);
    setSelectedRunnerIds((current) => current.slice(0, target));
  }

  function fillRaceField() {
    setSelectedRunnerIds((current) => {
      const needed = targetRunnerCount - current.length;
      if (needed <= 0) return current;

      const templates = [...characterTemplates].sort(() => Math.random() - 0.5).slice(0, needed);
      const fillers = templates.map((template, index) => createFieldFiller(template, Date.now() + index));
      setFieldFillers((existing) => [...existing, ...fillers]);
      return [...current, ...fillers.map((runner) => runner.id)];
    });
  }

  function applyRacePreset(preset: RacePreset) {
    changeTrack(preset.trackId);
    setSeason(preset.season);
    setSelectedSetupPreset({ kind: "race", preset });
    setIsRacePresetPickerOpen(false);
  }

  function applyChampionsMeetingPreset(preset: ChampionsMeetingPreset) {
    if (!preset.trackId || !preset.season || !preset.weather || !preset.groundCondition) return;

    changeTrack(preset.trackId);
    setSeason(preset.season);
    setWeather(preset.weather);
    setGroundCondition(preset.groundCondition);
    setSelectedSetupPreset({ kind: "championsMeeting", preset });
    setIsChampionsMeetingPresetPickerOpen(false);
  }

  function resetSample() {
    const nextSeed = createRandomSeed();

    const defaultTrack = catalog.tracks[0];

    setTrackId(defaultTrack.id);
    setTargetRunnerCount(getRaceLaneCapacity(defaultTrack));
    setGroundCondition("firm");
    setWeather("sunny");
    setSeason("spring");
    setSeed(nextSeed);
    setTickSeconds(simulationTickSeconds);
    setRunMode("analysis");
    setBatchResult(null);
    setBatchReplayRunIndex(null);
    setHasRunSimulation(false);
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
    setIsRacePresetPickerOpen(false);
    setIsChampionsMeetingPresetPickerOpen(false);
    setSelectedSetupPreset(null);
    setImportCardSelections({});
    setImportSkillSelections({});
    setFieldFillers([]);
    setSelectedRunnerIds(selectDefaultRunnerIds(catalog.runners, defaultTrack));
    setRunnerOverrides({});
    setTeamMode("individual");
    setRaceTeams(createDefaultRaceTeams());
    setRunnerTeamIds({});
    setResult(
      simulateRace(
        createSetup(
          defaultTrack.id,
          "firm",
          "sunny",
          "spring",
          nextSeed,
          simulationTickSeconds,
          allRunners,
          selectDefaultRunnerIds(catalog.runners, defaultTrack),
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
    setSeason(log.setup.season ?? "spring");
    setSeed(log.setup.seed);
    setTickSeconds(log.setup.tickSeconds ?? log.result.tickSeconds ?? simulationTickSeconds);
    setSelectedRunnerIds(log.setup.runners.map((runner) => runner.id));
    const loggedTeams = log.setup.teams ?? [];
    setTeamMode(loggedTeams.length > 0 || log.setup.runners.some((runner) => runner.teamId) ? "teams" : "individual");
    setRaceTeams(loggedTeams.length > 0 ? loggedTeams : createDefaultRaceTeams());
    setRunnerTeamIds(Object.fromEntries(
      log.setup.runners.flatMap((runner) => runner.teamId ? [[runner.id, runner.teamId]] : []),
    ));
    setRunnerOverrides(
      Object.fromEntries(log.setup.runners.map((runner, index) => [runner.id, {
        strategy: runner.strategy,
        mood: runner.mood,
        popularityRank: runner.popularityRank ?? index + 1,
        gateBlock: runner.gateBlock,
      }])),
    );
    setResult({
      ...log.result,
      tickSeconds: log.result.tickSeconds ?? log.setup.tickSeconds ?? simulationTickSeconds,
    });
    setRunMode("replay");
    setBatchResult(null);
    setBatchReplayRunIndex(null);
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
    setSelectedRunnerIds((current) => addRunnerIdsWithinCapacity(current, [runner.id], targetRunnerCount));
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
    setRunnerTeamIds((current) => {
      const next = { ...current };
      delete next[runnerId];
      return next;
    });
  }

  function changeTeamMode(nextMode: "individual" | "teams") {
    setTeamMode(nextMode);
    if (nextMode === "teams" && raceTeams.length === 0) {
      setRaceTeams(createDefaultRaceTeams());
    }
  }

  function addRaceTeam() {
    setRaceTeams((current) => {
      const number = current.length + 1;
      return [...current, {
        id: `team-${Date.now()}-${number}`,
        name: `Team ${number}`,
        color: teamColors[current.length % teamColors.length],
      }];
    });
  }

  function updateRaceTeam(teamId: string, updates: Partial<Pick<RaceTeam, "name" | "color">>) {
    setRaceTeams((current) => current.map((team) => team.id === teamId ? { ...team, ...updates } : team));
  }

  function removeRaceTeam(teamId: string) {
    setRaceTeams((current) => current.filter((team) => team.id !== teamId));
    setRunnerTeamIds((current) => Object.fromEntries(
      Object.entries(current).filter(([, assignedTeamId]) => assignedTeamId !== teamId),
    ));
  }

  function moveRunnerToField(runnerId: string, teamId?: string) {
    if (!selectedRunnerIds.includes(runnerId) && selectedRunnerIds.length >= targetRunnerCount) {
      return;
    }
    setSelectedRunnerIds((current) => current.includes(runnerId) ? current : [...current, runnerId]);
    setRunnerTeamIds((current) => {
      const next = { ...current };
      if (teamId) next[runnerId] = teamId;
      else delete next[runnerId];
      return next;
    });
  }

  function removeRunnerFromField(runnerId: string) {
    setSelectedRunnerIds((current) => current.filter((id) => id !== runnerId));
    setRunnerTeamIds((current) => {
      const next = { ...current };
      delete next[runnerId];
      return next;
    });
  }

  function importRawUmas(
    cardSelections = importCardSelections,
    skillSelections = importSkillSelections,
    buildNameSelections = importBuildNameSelections,
  ) {
    setImportError("");
    setImportMessage("");
    setImportWarnings([]);

    try {
      const missingNames = getMissingBuildNameRequests(rawUmaJson, buildNameSelections);
      if (missingNames.length) {
        setPendingBuildNames(missingNames.map((request) => ({ ...request, value: request.suggestedName })));
        setIsLibraryOpen(false);
        return;
      }
      const importResult = parseHarvestedUmaJsonWithReport(rawUmaJson, { cardSelections, skillSelections, buildNameSelections });
      setSavedUmas((current) => mergeUmaLibrary(current, importResult.runners));
      setSelectedRunnerIds((current) => addRunnerIdsWithinCapacity(current, importResult.runners.map((runner) => runner.id), targetRunnerCount));
      setImportMessage(`Imported ${importResult.runners.length} Uma${importResult.runners.length === 1 ? "" : "s"}.`);
      setImportWarnings(importResult.warnings.map((warning) =>
        `${warning.retained ? "Imported but not simulated" : "Not added"}: ${warning.skillName}. ${warning.reason}`,
      ));
      setRawUmaJson("");
      setPendingCharacterChoice(null);
      setPendingSkillChoice(null);
      setPendingBuildNames(null);
      setImportCardSelections({});
      setImportSkillSelections({});
      setImportBuildNameSelections({});
    } catch (error) {
      if (error instanceof CharacterCardAmbiguityError) {
        setPendingCharacterChoice({
          candidateIndex: error.candidateIndex,
          query: error.query,
          choices: error.choices,
        });
        setIsLibraryOpen(false);
        return;
      }
      if (error instanceof SkillAmbiguityError) {
        setPendingSkillChoice({
          candidateIndex: error.candidateIndex,
          skillIndex: error.skillIndex,
          query: error.query,
          choices: error.choices,
        });
        setIsLibraryOpen(false);
        return;
      }
      console.error("Uma import failed", error);
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
    importRawUmas(nextSelections, importSkillSelections, importBuildNameSelections);
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
    importRawUmas(importCardSelections, nextSelections, importBuildNameSelections);
  }

  function chooseImportedBuildNames() {
    if (!pendingBuildNames) return;

    if (pendingBuildNames.some((build) => !build.value.trim())) {
      setImportError("Build name is required.");
      return;
    }
    const nextSelections = {
      ...importBuildNameSelections,
      ...Object.fromEntries(pendingBuildNames.map((build) => [build.candidateIndex, build.value.trim()])),
    };
    setImportBuildNameSelections(nextSelections);
    setPendingBuildNames(null);
    importRawUmas(importCardSelections, importSkillSelections, nextSelections);
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
      {importError ? (
        <div className="import-diagnostic" role="alert">
          <strong>Import failed</strong>
          <span>{importError}</span>
        </div>
      ) : null}
      {importWarnings.length ? (
        <div className="import-diagnostic warning" role="status">
          <strong>Import notes</strong>
          <span>{importWarnings.join(" ")}</span>
          <button aria-label="Dismiss import notes" className="import-diagnostic-dismiss" onClick={() => setImportWarnings([])} type="button">
            <X size={15} />
          </button>
        </div>
      ) : null}
      <section className="toolbar">
        <div>
          <p className="eyebrow">UmaSim race lab</p>
          <h1>Race simulator</h1>
          <p className="toolbar-subtitle">
            Tune the course, runners, and seed, then inspect the pace state and skill calls.
          </p>
          <p
            className="data-provenance"
            title={`GameTora Global snapshots — characters ${characterDataMeta.generatedAt}, skills ${globalSkillDataMeta.generatedAt}, tracks ${simulationProvenance.datasets.tracks.generatedAt}.`}
          >
            <Database aria-hidden="true" size={14} />
            Global data snapshot: {formatSnapshotDate(simulationProvenance.snapshotGeneratedAt)} via GameTora
            <span>Engine {simulationProvenance.engineVersion}</span>
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="ghost-button roster-toolbar-button" onClick={() => setIsFieldDrawerOpen(true)} type="button">
            <Users size={16} />
            Race roster
            <span>{selectedRunnerIds.length}/{targetRunnerCount}</span>
          </button>
          <button className="ghost-button" onClick={resetSample} type="button">
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </section>

      <section className={runMode === "analysis" && batchResult ? "workspace-grid is-analysis" : "workspace-grid"}>
        <SetupPanel
          batchRunCount={batchRunCount}
          groundCondition={groundCondition}
          isSimulating={isSimulating}
          onBatchRunCountChange={setBatchRunCount}
          onGroundConditionChange={(value) => {
            setSelectedSetupPreset(null);
            setGroundCondition(value);
          }}
          onOpenChampionsMeetingPresets={() => setIsChampionsMeetingPresetPickerOpen(true)}
          onOpenRacePresets={() => setIsRacePresetPickerOpen(true)}
          onOpenTrackDetails={() => setIsTrackDetailsOpen(true)}
          onRandomizeSeed={() => setSeed(createRandomSeed())}
          onRunAnalysis={runAnalysis}
          onRunReplay={runReplay}
          onSeedChange={setSeed}
          onSeasonChange={(value) => {
            setSelectedSetupPreset(null);
            setSeason(value);
          }}
          onTickSecondsChange={setTickSeconds}
          onTrackChange={(value) => {
            setSelectedSetupPreset(null);
            changeTrack(value);
          }}
          onWeatherChange={(value) => {
            setSelectedSetupPreset(null);
            setWeather(value);
          }}
          racePresetCount={racePresets.length}
          selectedPreset={getSetupPresetDisplay(selectedSetupPreset)}
          seed={seed}
          season={season}
          tickSeconds={tickSeconds}
          track={track}
          trackId={trackId}
          tracks={catalog.tracks}
          weather={weather}
        />

        <UmaListPanel
          batchActive={batchResult !== null}
          isOpen={isFieldDrawerOpen}
          maxRunnerCount={getRaceLaneCapacity(track)}
          targetRunnerCount={targetRunnerCount}
          onAddTeam={addRaceTeam}
          onChangeOverride={(runnerId, override) =>
            setRunnerOverrides((current) => ({ ...current, [runnerId]: override }))
          }
          onChangeTeam={updateRaceTeam}
          onChangeTeamMode={changeTeamMode}
          onFillRaceField={fillRaceField}
          onTargetRunnerCountChange={changeTargetRunnerCount}
          onToggle={() => setIsFieldDrawerOpen((current) => !current)}
          onInspectRunner={setInspectedUmaId}
          onMoveRunnerToField={moveRunnerToField}
          onOpenBuilder={() => {
            setIsBuilderOpen(true);
            setIsLibraryOpen(false);
          }}
          onOpenLibrary={() => {
            setIsLibraryOpen(true);
            setIsBuilderOpen(false);
          }}
          onRemoveRunnerFromField={removeRunnerFromField}
          onRemoveTeam={removeRaceTeam}
          placements={result.placements}
          runnerOverrides={runnerOverrides}
          runners={allRunners}
          runnerTeamIds={runnerTeamIds}
          selectedRunnerIds={selectedRunnerIds}
          teamMode={teamMode}
          teams={raceTeams}
        />

        <AnalysisPanel
          activeReplayRunIndex={batchReplayRunIndex}
          batchResult={batchResult}
          batchView={batchView}
          hasRunSimulation={hasRunSimulation}
          isSimulating={isSimulating}
          inspectedBatchRunner={inspectedBatchRunner}
          onBackToBatch={() => setBatchReplayRunIndex(null)}
          onBatchViewChange={setBatchView}
          onClearRunHistory={clearRunHistory}
          onExportRunHistory={exportRunHistory}
          onInspectBatchRunner={setSelectedBatchRunnerId}
          onInspectRunner={setInspectedRaceRunnerId}
          onLoadRunLog={loadRunLog}
          onOpenReplay={(runIndex) => {
            if (!batchResult) return;
            setResult(replayBatchRun(batchResult, catalog, runIndex));
            setBatchReplayRunIndex(runIndex);
            setInspectedRaceRunnerId(null);
          }}
          result={result}
          runHistory={runHistory}
          runMode={runMode}
          selectedRunners={selectedRunners}
          simulationCoverage={simulationCoverage}
        />
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
                    setImportWarnings([]);
                    setPendingCharacterChoice(null);
                    setPendingSkillChoice(null);
                    setPendingBuildNames(null);
                    setImportCardSelections({});
                    setImportSkillSelections({});
                    setImportBuildNameSelections({});
                  }}
                />
                {importError ? <p className="form-message error">{importError}</p> : null}
                {importMessage ? <p className="form-message success">{importMessage}</p> : null}
                {importWarnings.length ? (
                  <div className="form-message warning" role="status">
                    <strong>Import notes</strong>
                    <ul>{importWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  </div>
                ) : null}
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

      {pendingBuildNames ? (
        <section aria-labelledby="build-name-title" aria-modal="true" className="modal-backdrop character-choice-backdrop" role="dialog">
          <div className="panel modal-panel character-choice-panel build-name-panel">
            <div className="modal-heading">
              <div className="panel-heading"><Sparkles size={18} /><h2 id="build-name-title">Name imported builds</h2></div>
              <button className="icon-button modal-close" onClick={() => setPendingBuildNames(null)} title="Close" type="button"><X size={16} /></button>
            </div>
            <p className="choice-query">Name all {pendingBuildNames.length} build{pendingBuildNames.length === 1 ? "" : "s"} before the rest of the import review continues.</p>
            <div className="batch-build-name-list">
              {pendingBuildNames.map((build, index) => (
                <label className="field" key={build.candidateIndex}>
                  <span>Uma {build.candidateIndex + 1}</span>
                  <input
                    autoFocus={index === 0}
                    onChange={(event) => setPendingBuildNames((current) => current?.map((candidate) =>
                      candidate.candidateIndex === build.candidateIndex ? { ...candidate, value: event.target.value } : candidate,
                    ) ?? null)}
                    value={build.value}
                  />
                </label>
              ))}
            </div>
            <button className="primary-button" onClick={chooseImportedBuildNames} type="button">Continue import</button>
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
                  <RaceTriggerTimeline debugEntries={inspectedSkillDebug} events={inspectedRunnerEvents} />
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

      {isRacePresetPickerOpen ? (
        <RacePresetPicker
          onApply={applyRacePreset}
          onClose={() => setIsRacePresetPickerOpen(false)}
          presets={racePresets}
          tracks={catalog.tracks}
        />
      ) : null}

      {isChampionsMeetingPresetPickerOpen ? (
        <ChampionsMeetingPresetPicker
          onApply={applyChampionsMeetingPreset}
          onClose={() => setIsChampionsMeetingPresetPickerOpen(false)}
          presets={championsMeetingPresets}
          tracks={catalog.tracks}
        />
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

      {(runMode === "replay" || batchReplayRunIndex !== null) ? (
        <RaceDetailsPanel
          onInspectRunner={setInspectedRaceRunnerId}
          result={result}
          runners={selectedRunners}
          simulationCoverage={simulationCoverage}
          track={track}
        />
      ) : null}
    </main>
  );
}

function createSetup(
  trackId: string,
  groundCondition: GroundCondition,
  weather: Weather,
  season: RaceSeason,
  seed: string,
  tickSeconds: number,
  runners: RunnerBuild[],
  selectedRunnerIds: string[],
  runnerOverrides: Record<string, RunnerOverride>,
  teamMode: "individual" | "teams" = "individual",
  raceTeams: RaceTeam[] = [],
  runnerTeamIds: Record<string, string> = {},
): RaceSetup {
  return {
    seed,
    tickSeconds,
    trackId,
    groundCondition,
    weather,
    season,
    teams: teamMode === "teams" ? raceTeams : undefined,
    runners: selectedRunnerIds
      .map((runnerId) => runners.find((runner) => runner.id === runnerId))
      .filter((runner): runner is RunnerBuild => runner !== undefined)
      .map((runner, index) => ({
        ...runner,
        strategy: runnerOverrides[runner.id]?.strategy ?? runner.strategy,
        mood: runnerOverrides[runner.id]?.mood ?? runner.mood,
        popularityRank: runnerOverrides[runner.id]?.popularityRank ?? index + 1,
        gateBlock: runnerOverrides[runner.id]?.gateBlock,
        teamId: teamMode === "teams" ? runnerTeamIds[runner.id] : undefined,
    })),
  };
}

function yieldToBrowser(): Promise<void> {
  // React has committed the loading state synchronously. Starting the engine
  // in the following task gives the browser an actual paint opportunity.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getRaceLaneCapacity(track: typeof catalog.tracks[number]): number {
  return track.laneCount ?? 18;
}

function createDefaultRaceTeams(): RaceTeam[] {
  return [
    { id: "team-1", name: "Team 1", color: teamColors[0] },
    { id: "team-2", name: "Team 2", color: teamColors[1] },
  ];
}

function selectDefaultRunnerIds(runners: RunnerBuild[], track: typeof catalog.tracks[number]): string[] {
  return runners.slice(0, getRaceLaneCapacity(track)).map((runner) => runner.id);
}

function createFieldFiller(template: CharacterTemplate, nonce: number): RunnerBuild {
  return {
    id: `field-filler-${template.cardId}-${nonce}`,
    name: template.name,
    cardId: template.cardId,
    characterId: template.characterId,
    characterName: template.name,
    outfitTitle: template.outfitTitle,
    variant: template.variant,
    buildName: "Default field build",
    stats: { speed: 800, stamina: 800, power: 800, guts: 600, wit: 600 },
    aptitudes: template.aptitudes,
    strategy: template.defaultStrategy,
    mood: "normal",
    uniqueSkillId: template.uniqueSkillId,
    uniqueSkillLevel: 1,
    skillIds: template.innateSkillIds.slice(0, 2),
  };
}

function addRunnerIdsWithinCapacity(
  currentRunnerIds: string[],
  nextRunnerIds: string[],
  targetRunnerCount: number,
): string[] {
  const selected = [...currentRunnerIds];
  const selectedSet = new Set(selected);

  for (const runnerId of nextRunnerIds) {
    if (selectedSet.has(runnerId) || selected.length >= targetRunnerCount) {
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

function isUniqueSkill(skillId: string): boolean {
  return skillId.startsWith("unique-") || globalUniqueSkillIds.has(skillId);
}

function getSetupPresetDisplay(selectedPreset: SelectedSetupPreset | null) {
  if (!selectedPreset) return null;

  if (selectedPreset.kind === "race") {
    const { preset } = selectedPreset;
    return {
      type: "Race preset" as const,
      name: preset.name,
      detail: `${toTitleCase(preset.season)} · ${preset.entryCount ?? "?"} entries`,
      imageAlt: `${preset.name} race banner`,
      imageUrl: `https://media.gametora.com/umamusume/races/banners/en/${preset.bannerId}.png`,
    };
  }

  const { preset } = selectedPreset;
  return {
    type: "Champions Meeting" as const,
    name: formatChampionsMeetingPresetName(preset),
    detail: `${preset.distanceMeters}m · ${toTitleCase(preset.groundCondition ?? "unknown")} · ${toTitleCase(preset.weather ?? "unknown")}`,
    imageAlt: `${preset.name} Champions Meeting logo`,
    imageUrl: `https://media.gametora.com/umamusume/events/cm/icon_${Math.min(preset.resourceId || 1, 13)}.png`,
  };
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
