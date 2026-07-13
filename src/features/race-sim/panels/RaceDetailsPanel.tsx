import { ChevronDown, Flag, ListFilter, Sparkles, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { characterTemplates } from "../../../data/characters";
import type { RaceResult, Track } from "../../../domain/race/types";
import type { RunnerBuild } from "../../../domain/uma/types";
import type { SimulationCoverage } from "./AnalysisPanel";

type RunnerFilter = "all" | string;

export type RaceDetailsPanelProps = {
  onInspectRunner: (runnerId: string) => void;
  result: RaceResult;
  runners: RunnerBuild[];
  simulationCoverage: SimulationCoverage;
  track: Track;
};

export function RaceDetailsPanel({
  onInspectRunner,
  result,
  runners,
  simulationCoverage,
  track,
}: RaceDetailsPanelProps) {
  const [runnerFilter, setRunnerFilter] = useState<RunnerFilter>("all");
  const placementByRunnerId = useMemo(
    () => new Map(result.placements.map((placement) => [placement.runnerId, placement])),
    [result.placements],
  );
  const summaryByRunnerId = useMemo(
    () => new Map(result.runners.map((summary) => [summary.runnerId, summary])),
    [result.runners],
  );
  const runnersByPlacement = useMemo(
    () =>
      [...runners].sort((left, right) => {
        const leftPlace = placementByRunnerId.get(left.id)?.place ?? Number.POSITIVE_INFINITY;
        const rightPlace = placementByRunnerId.get(right.id)?.place ?? Number.POSITIVE_INFINITY;
        return leftPlace - rightPlace || left.characterName.localeCompare(right.characterName);
      }),
    [placementByRunnerId, runners],
  );
  const filteredEvents = useMemo(
    () =>
      [...result.skillEvents]
        .filter((event) => runnerFilter === "all" || event.runnerId === runnerFilter)
        .sort((left, right) => left.second - right.second || left.skillName.localeCompare(right.skillName)),
    [result.skillEvents, runnerFilter],
  );

  return (
    <section className="panel race-details-panel" aria-labelledby="race-details-title">
      <div className="panel-heading">
        <Flag size={18} />
        <h2 id="race-details-title">Race details</h2>
        <span className="simulation-badge">Single-run analysis</span>
      </div>

      <div className="race-details-layout">
        <section className="race-state-section" aria-labelledby="final-state-title">
          <div className="race-details-section-heading">
            <div>
              <span>Final race state</span>
              <h3 id="final-state-title">Finish, pace, and stamina</h3>
            </div>
            <small>{track.name}</small>
          </div>

          <div className="race-state-table" role="table" aria-label="Final race state">
            <div className="race-state-table-header" role="row">
              <span>Runner</span>
              <span>Finish</span>
              <span>Pace</span>
              <span>Stamina</span>
              <span>Skills</span>
            </div>
            {runnersByPlacement.map((runner) => {
              const placement = placementByRunnerId.get(runner.id);
              const summary = summaryByRunnerId.get(runner.id);

              return (
                <button
                  className="race-state-row"
                  key={runner.id}
                  onClick={() => onInspectRunner(runner.id)}
                  type="button"
                >
                  <span className="race-state-runner">
                    <strong>#{placement?.place ?? "—"}</strong>
                    <span>
                      <b>{runner.characterName}</b>
                      <small>{runner.buildName}</small>
                    </span>
                  </span>
                  <span className="race-state-metric">
                    <strong>{placement?.finishTime.toFixed(2) ?? "—"}s</strong>
                    <small>{summary?.gapToWinner ? `+${summary.gapToWinner.toFixed(2)}s` : "Winner"}</small>
                  </span>
                  <span className="race-state-metric">
                    <strong>{summary?.averageSpeed.toFixed(2) ?? "—"}</strong>
                    <small>avg · {summary?.topSpeed.toFixed(2) ?? "—"} top</small>
                  </span>
                  <span className="race-state-metric">
                    <strong>{summary?.remainingStamina.toFixed(0) ?? "—"}</strong>
                    <small>{summary?.staminaSpent.toFixed(0) ?? "—"} spent</small>
                  </span>
                  <span className="race-state-metric">
                    <strong>{summary?.triggeredSkillCount ?? 0}</strong>
                    <small>activated</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="skill-log-section" aria-labelledby="skill-log-title">
          <div className="race-details-section-heading">
            <div>
              <span>Activation log</span>
              <h3 id="skill-log-title">Skills</h3>
            </div>
            <RunnerFilterPicker
              runners={runnersByPlacement}
              selectedId={runnerFilter}
              onSelect={setRunnerFilter}
            />
          </div>

          <p className="skill-log-resolution">
            <Timer size={14} /> Activation time is recorded at this run&apos;s {formatTickSeconds(result.tickSeconds)} evaluation tick.
          </p>

          {simulationCoverage.ignoredSkills.length ? (
            <details className="coverage-warning">
              <summary>{simulationCoverage.ignoredSkills.length} imported skills not simulated yet</summary>
              <p>{simulationCoverage.ignoredSkills.join(", ")}</p>
            </details>
          ) : null}

          {filteredEvents.length === 0 ? (
            <p className="empty-state">
              {runnerFilter === "all" ? "No skills triggered on this run." : "No skills triggered for this runner."}
            </p>
          ) : (
            <div className="skill-log-list">
              {filteredEvents.map((event) => {
                const runner = runners.find((candidate) => candidate.id === event.runnerId);

                return (
                  <div className="skill-log-event" key={`${event.runnerId}-${event.skillId}-${event.second}`}>
                    <time dateTime={`PT${event.second}S`}>{event.second.toFixed(1)}<small>s</small></time>
                    <div>
                      <strong><Sparkles size={14} /> {event.skillName}</strong>
                      <span>{runner?.characterName ?? event.runnerId}</span>
                    </div>
                    <p>{getEffectSummary(event.message)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function RunnerFilterPicker({
  onSelect,
  runners,
  selectedId,
}: {
  onSelect: (runnerId: RunnerFilter) => void;
  runners: RunnerBuild[];
  selectedId: RunnerFilter;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedRunner = runners.find((runner) => runner.id === selectedId) ?? null;
  const selectedImage = selectedRunner
    ? characterTemplates.find((character) => character.cardId === selectedRunner.cardId)?.thumbImg ?? ""
    : "";

  function choose(runnerId: RunnerFilter) {
    onSelect(runnerId);
    setIsOpen(false);
  }

  return (
    <div className="runner-filter-picker">
      <span className="runner-filter-label"><ListFilter size={15} /> Runner</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="runner-filter-trigger"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {selectedRunner ? (
          <><img alt="" src={selectedImage} /><span><strong>{selectedRunner.characterName}</strong><small>{selectedRunner.buildName}</small></span></>
        ) : (
          <><span className="runner-filter-all-icon"><ListFilter size={15} /></span><span><strong>All runners</strong><small>{runners.length} builds</small></span></>
        )}
        <ChevronDown size={15} />
      </button>

      {isOpen ? (
        <div className="runner-filter-menu" role="listbox" aria-label="Filter skill log by runner">
          <button
            aria-selected={selectedId === "all"}
            className={selectedId === "all" ? "is-selected" : ""}
            onClick={() => choose("all")}
            role="option"
            type="button"
          >
            <span className="runner-filter-all-icon"><ListFilter size={15} /></span>
            <span><strong>All runners</strong><small>{runners.length} builds</small></span>
          </button>
          {runners.map((runner) => {
            const image = characterTemplates.find((character) => character.cardId === runner.cardId)?.thumbImg ?? "";
            return (
              <button
                aria-selected={selectedId === runner.id}
                className={selectedId === runner.id ? "is-selected" : ""}
                key={runner.id}
                onClick={() => choose(runner.id)}
                role="option"
                type="button"
              >
                <img alt="" src={image} />
                <span><strong>{runner.characterName}</strong><small>{runner.buildName}</small></span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getEffectSummary(message: string): string {
  const effect = message.match(/\((.+)\)$/)?.[1];
  return effect ?? "Activated";
}

function formatTickSeconds(tickSeconds: number): string {
  return tickSeconds === 1 / 30 ? "1/30s" : `${tickSeconds.toFixed(tickSeconds < 0.1 ? 3 : 1)}s`;
}
