import { BarChart3, Dices, Gauge, LoaderCircle, Medal, Play, Route } from "lucide-react";
import { useMemo } from "react";
import type { GroundCondition, RaceSeason, Track, Weather } from "../../../domain/race/types";

export const batchRunCounts = [25, 100, 500] as const;
export type BatchRunCount = (typeof batchRunCounts)[number];

const tickRateOptions = [
  { value: 0.5, label: "0.5s (current default)" },
  { value: 0.1, label: "0.1s" },
  { value: 1 / 30, label: "1/30s" },
  { value: 1 / 60, label: "1/60s" },
] as const;

const groundConditions: GroundCondition[] = ["firm", "good", "soft", "heavy"];
const weatherConditions: Weather[] = ["sunny", "cloudy", "rainy", "snowy"];
const seasons: RaceSeason[] = ["spring", "summer", "fall", "winter", "cherryBlossom"];

export type SetupPanelProps = {
  batchRunCount: BatchRunCount;
  groundCondition: GroundCondition;
  isSimulating: boolean;
  onBatchRunCountChange: (count: BatchRunCount) => void;
  onGroundConditionChange: (condition: GroundCondition) => void;
  onOpenTrackDetails: () => void;
  onRandomizeSeed: () => void;
  onRunAnalysis: () => void;
  onRunReplay: () => void;
  onSeedChange: (seed: string) => void;
  onSeasonChange: (season: RaceSeason) => void;
  onTickSecondsChange: (tickSeconds: number) => void;
  onTrackChange: (trackId: string) => void;
  onWeatherChange: (weather: Weather) => void;
  seed: string;
  season: RaceSeason;
  tickSeconds: number;
  track: Track;
  trackId: string;
  tracks: Track[];
  weather: Weather;
};

export function SetupPanel({
  batchRunCount,
  groundCondition,
  isSimulating,
  onBatchRunCountChange,
  onGroundConditionChange,
  onOpenTrackDetails,
  onRandomizeSeed,
  onRunAnalysis,
  onRunReplay,
  onSeedChange,
  onSeasonChange,
  onTickSecondsChange,
  onTrackChange,
  onWeatherChange,
  seed,
  season,
  tickSeconds,
  track,
  trackId,
  tracks,
  weather,
}: SetupPanelProps) {
  const trackGroups = useMemo(
    () =>
      Object.entries(
        tracks.reduce<Record<string, Track[]>>((groups, candidate) => {
          const venue = candidate.venue ?? "Other";
          groups[venue] = [...(groups[venue] ?? []), candidate];
          return groups;
        }, {}),
      ).sort(([left], [right]) => left.localeCompare(right)),
    [tracks],
  );

  return (
    <div className="panel setup-panel">
      <div className="panel-heading">
        <Gauge size={18} />
        <h2>Setup</h2>
      </div>

      <button className="course-card course-card-button" onClick={onOpenTrackDetails} type="button">
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
        <select value={trackId} onChange={(event) => onTrackChange(event.target.value)}>
          {trackGroups.map(([venue, venueTracks]) => (
            <optgroup key={venue} label={venue}>
              {venueTracks.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name.replace(`${venue} `, "")}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <section className="preset-stubs" aria-labelledby="preset-stubs-heading">
        <div>
          <span id="preset-stubs-heading">Preset setup</span>
          <small>Preset catalogs will apply reviewable course and condition drafts.</small>
        </div>
        <div className="preset-stub-actions">
          <button className="preset-stub-button" disabled type="button">
            <Route size={16} />
            Choose race preset
            <em>Coming soon</em>
          </button>
          <button className="preset-stub-button" disabled type="button">
            <Medal size={16} />
            Choose CM preset
            <em>Coming soon</em>
          </button>
        </div>
      </section>

      <div className="analysis-controls">
        <span>Analysis job</span>
        <label className="field compact-field">
          <span>Deterministic runs</span>
          <select
            value={batchRunCount}
            onChange={(event) => onBatchRunCountChange(Number(event.target.value) as BatchRunCount)}
          >
            {batchRunCounts.map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>
        <label className="field compact-field">
          <span>Simulation tick</span>
          <select value={tickSeconds} onChange={(event) => onTickSecondsChange(Number(event.target.value))}>
            {tickRateOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
          <small className="field-note">Finer ticks increase batch runtime.</small>
        </label>
        <button className="primary-button analysis-run-button" disabled={isSimulating} onClick={() => void onRunAnalysis()} type="button">
          {isSimulating ? <LoaderCircle className="simulation-spinner" size={16} /> : <BarChart3 size={16} />}
          {isSimulating ? "Running analysis…" : `Run ${batchRunCount}-race analysis`}
        </button>
      </div>

      <div className="compact-grid three">
        <label className="field">
          <span>Ground</span>
          <select
            value={groundCondition}
            onChange={(event) => onGroundConditionChange(event.target.value as GroundCondition)}
          >
            {groundConditions.map((condition) => (
              <option key={condition} value={condition}>{condition}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Weather</span>
          <select value={weather} onChange={(event) => onWeatherChange(event.target.value as Weather)}>
            {weatherConditions.map((condition) => (
              <option key={condition} value={condition}>{condition}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Season</span>
          <select value={season} onChange={(event) => onSeasonChange(event.target.value as RaceSeason)}>
            {seasons.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate === "cherryBlossom" ? "cherry blossom" : candidate}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="replay-seed-control">
        <summary>Seed &amp; single replay</summary>
        <p>Use this seed as the analysis family, or replay it once for a detailed trace.</p>
        <label className="field">
          <span>Seed</span>
          <div className="input-action-row">
            <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
            <button
              aria-label="Generate random seed"
              className="icon-button seed-button"
              onClick={onRandomizeSeed}
              title="Generate random seed"
              type="button"
            >
              <Dices size={16} />
            </button>
          </div>
        </label>
        <button className="ghost-button replay-seed-button" disabled={isSimulating} onClick={() => void onRunReplay()} type="button">
          {isSimulating ? <LoaderCircle className="simulation-spinner" size={16} /> : <Play size={16} />}
          {isSimulating ? "Simulating replay…" : "Replay one seed"}
        </button>
        {isSimulating ? <p className="simulation-progress" role="status">Simulating the current setup…</p> : null}
      </details>
    </div>
  );
}
