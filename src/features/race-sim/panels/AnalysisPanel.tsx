import { Clock, Download, Medal, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { characterTemplates } from "../../../data/characters";
import { globalSkills } from "../../../data/skills";
import {
  accuracyLedger,
  accuracyStatusLabels,
  countAccuracyStatuses,
} from "../../../domain/race/accuracyLedger";
import type { RaceBatchResult } from "../../../domain/race/simulateRaceBatch";
import type { RaceRunLog } from "../../../domain/race/runHistory";
import type { RaceResult } from "../../../domain/race/types";
import { buildGlobalSkillCoverageReport } from "../../../domain/race/globalSkillCoverage";
import type { RunnerBuild } from "../../../domain/uma/types";

const accuracyStatusCounts = countAccuracyStatuses();
const globalSkillCoverage = buildGlobalSkillCoverageReport(globalSkills);

export type BatchView = "overview" | "runs" | "skills";

export type SimulationCoverage = {
  equippedCount: number;
  ignoredSkills: string[];
  modeledCount: number;
};

export type AnalysisPanelProps = {
  activeReplayRunIndex: number | null;
  batchResult: RaceBatchResult | null;
  batchView: BatchView;
  hasRunSimulation: boolean;
  isSimulating: boolean;
  inspectedBatchRunner: RaceBatchResult["runners"][number] | null;
  onBackToBatch: () => void;
  onBatchViewChange: (view: BatchView) => void;
  onClearRunHistory: () => void;
  onExportRunHistory: () => void;
  onInspectBatchRunner: (runnerId: string) => void;
  onInspectRunner: (runnerId: string) => void;
  onLoadRunLog: (log: RaceRunLog) => void;
  onOpenReplay: (runIndex: number) => void;
  result: RaceResult;
  runHistory: RaceRunLog[];
  runMode: "replay" | "analysis";
  selectedRunners: RunnerBuild[];
  simulationCoverage: SimulationCoverage;
};

export function AnalysisPanel({
  activeReplayRunIndex,
  batchResult,
  batchView,
  hasRunSimulation,
  isSimulating,
  inspectedBatchRunner,
  onBackToBatch,
  onBatchViewChange,
  onClearRunHistory,
  onExportRunHistory,
  onInspectBatchRunner,
  onInspectRunner,
  onLoadRunLog,
  onOpenReplay,
  result,
  runHistory,
  runMode,
  selectedRunners,
  simulationCoverage,
}: AnalysisPanelProps) {
  const batchActive = runMode === "analysis" && batchResult !== null;
  const resultByRunnerId = new Map(result.runners.map((runner) => [runner.runnerId, runner]));

  return (
    <div
      aria-busy={isSimulating}
      className={`${batchActive ? "panel result-panel analysis-result-panel" : "panel result-panel"}${isSimulating ? " is-simulating" : ""}`}
    >
      <div className="panel-heading">
        <Medal size={18} />
        <h2>{batchActive ? "Analysis - batch" : "Analysis - single run"}</h2>
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
        <div className="catalog-coverage-summary">
          <div>
            <span>Imported skills</span>
            <strong>{globalSkillCoverage.modeledSkillCount}/{globalSkillCoverage.skillCount}</strong>
          </div>
          <div>
            <span>Owner uniques</span>
            <strong>{globalSkillCoverage.uniqueSkills.owner.modeledSkillCount}/{globalSkillCoverage.uniqueSkills.owner.skillCount}</strong>
          </div>
          <div>
            <span>Inherited uniques</span>
            <strong>{globalSkillCoverage.uniqueSkills.inherited.modeledSkillCount}/{globalSkillCoverage.uniqueSkills.inherited.skillCount}</strong>
          </div>
        </div>
        {globalSkillCoverage.uniqueSkills.owner.unsupportedSkillCount > 0 ? (
          <details className="unique-coverage-list">
            <summary>{globalSkillCoverage.uniqueSkills.owner.unsupportedSkillCount} owner uniques not simulated</summary>
            <div>
              {globalSkillCoverage.uniqueSkills.owner.unsupportedSkills.map((skill) => (
                <p key={skill.id}>
                  <strong>{skill.name}</strong>
                  <span>{formatCoverageBlockers(skill.report)}</span>
                </p>
              ))}
            </div>
          </details>
        ) : (
          <p className="unique-coverage-complete">All imported owner and inherited unique skills are modeled.</p>
        )}
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

      {batchActive ? (
        <BatchAnalysis
          activeReplayRunIndex={activeReplayRunIndex}
          inspectedRunner={inspectedBatchRunner}
          onBackToBatch={onBackToBatch}
          onInspect={onInspectBatchRunner}
          onOpenReplay={onOpenReplay}
          result={batchResult}
          view={batchView}
          onViewChange={onBatchViewChange}
        />
      ) : hasRunSimulation ? (
        <div className="placements">
          {result.placements.map((placement) => {
            const summary = resultByRunnerId.get(placement.runnerId);
            const runner = selectedRunners.find((candidate) => candidate.id === placement.runnerId);

            return (
              <button
                className="placement-row detailed-placement-row placement-button"
                key={placement.runnerId}
                onClick={() => onInspectRunner(placement.runnerId)}
                type="button"
              >
                <div className="placement-copy">
                  <span>#{placement.place} {runner?.characterName ?? placement.runnerName}</span>
                  <small>
                    {runner?.buildName ?? "Unnamed build"} · {placement.finishTime.toFixed(2)}s
                    {summary && summary.gapToWinner > 0 ? ` · +${summary.gapToWinner.toFixed(2)}s` : " · Winner"}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="analysis-empty-state">
          <strong>Ready for a single-run analysis</strong>
          <p>
            Choose a seed and select <em>Replay one seed</em> to inspect this field, or run a batch analysis for aggregate results.
          </p>
        </div>
      )}

      <RunHistory
        logs={runHistory}
        onClear={onClearRunHistory}
        onExport={onExportRunHistory}
        onLoad={onLoadRunLog}
      />

      {isSimulating ? (
        <div className="analysis-loading-overlay" role="status">
          <div className="analysis-loading-orbit" aria-hidden="true">
            <span />
          </div>
          <strong>Simulating race data</strong>
          <p>Calculating placements, pace, stamina, and skill activations.</p>
        </div>
      ) : null}
    </div>
  );
}

function formatCoverageBlockers(report: { unsupportedConditionTokens: string[]; unsupportedEffectTypes: number[] }) {
  return [
    report.unsupportedConditionTokens.length
      ? `conditions: ${report.unsupportedConditionTokens.join(", ")}`
      : null,
    report.unsupportedEffectTypes.length
      ? `effects: ${report.unsupportedEffectTypes.join(", ")}`
      : null,
  ].filter(Boolean).join(" · ");
}

function RunHistory({
  logs,
  onClear,
  onExport,
  onLoad,
}: {
  logs: RaceRunLog[];
  onClear: () => void;
  onExport: () => void;
  onLoad: (log: RaceRunLog) => void;
}) {
  return (
    <div className="run-history">
      <div className="run-history-heading">
        <div>
          <span>Latest run log</span>
          <strong>{logs.length ? "1 saved run" : "No saved run"}</strong>
        </div>
        <div className="run-history-actions">
          <button className="icon-button" disabled={logs.length === 0} onClick={onExport} title="Export latest run" type="button">
            <Download size={15} />
          </button>
          <button className="icon-button" disabled={logs.length === 0} onClick={onClear} title="Clear run history" type="button">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="run-history-empty">Run a race to persist the latest setup, result, timeline, and skill debug log.</p>
      ) : (
        <div className="run-history-list">
          {logs.slice(0, 6).map((log) => {
            const winner = log.result.placements[0];
            const eventCount = log.result.skillEvents.length;

            return (
              <button className="run-history-row" key={log.id} onClick={() => onLoad(log)} type="button">
                <Clock size={15} />
                <div>
                  <strong>{winner?.runnerName ?? "No winner"}</strong>
                  <span>{formatRunDate(log.createdAt)} - {log.track.name} - seed {log.result.seed}</span>
                </div>
                <small>{winner ? `${winner.finishTime.toFixed(2)}s` : "--"} - {eventCount} skills</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type BatchAnalysisProps = {
  activeReplayRunIndex: number | null;
  inspectedRunner: RaceBatchResult["runners"][number] | null;
  onBackToBatch: () => void;
  onInspect: (runnerId: string) => void;
  onOpenReplay: (runIndex: number) => void;
  onViewChange: (view: BatchView) => void;
  result: RaceBatchResult;
  view: BatchView;
};

function BatchAnalysis({
  result,
  inspectedRunner,
  onInspect,
  view,
  onViewChange,
  activeReplayRunIndex,
  onOpenReplay,
  onBackToBatch,
}: BatchAnalysisProps) {
  return (
    <div className="batch-analysis">
      <p className="batch-analysis-intro">
        {result.runCount} deterministic runs from seed <code>{result.baseSeed}</code>. Detailed replays are regenerated from the selected run&apos;s exact seed.
      </p>
      <div className="batch-tabs" role="tablist" aria-label="Batch analysis views">
        {(["overview", "runs", "skills"] as const).map((tab) => (
          <button
            aria-selected={view === tab}
            className={view === tab ? "is-selected" : ""}
            key={tab}
            onClick={() => onViewChange(tab)}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      {activeReplayRunIndex !== null ? (
        <div className="batch-replay-context">
          <span>Viewing replay: Run {activeReplayRunIndex} of {result.runCount}</span>
          <button onClick={onBackToBatch} type="button">Back to batch</button>
        </div>
      ) : null}
      {view === "overview" ? <BatchOverview result={result} inspectedRunner={inspectedRunner} onInspect={onInspect} /> : null}
      {view === "runs" ? <BatchRuns result={result} onOpenReplay={onOpenReplay} /> : null}
      {view === "skills" ? <BatchSkills result={result} inspectedRunner={inspectedRunner} onInspect={onInspect} /> : null}
    </div>
  );
}

function BatchOverview({ result, inspectedRunner, onInspect }: Pick<BatchAnalysisProps, "result" | "inspectedRunner" | "onInspect">) {
  const leader = result.runners[0];
  const [hoveredRunnerId, setHoveredRunnerId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);

  function showRunnerTooltip(runnerId: string, target: HTMLElement) {
    const bounds = target.getBoundingClientRect();
    const tooltipHeight = 116;
    const viewportPadding = 12;
    const left = Math.min(bounds.left, Math.max(viewportPadding, window.innerWidth - 274));
    const top = bounds.bottom + tooltipHeight + 8 > window.innerHeight
      ? Math.max(viewportPadding, bounds.top - tooltipHeight - 8)
      : bounds.bottom + 8;

    setHoveredRunnerId(runnerId);
    setTooltipPosition({ left, top });
  }

  function hideRunnerTooltip() {
    setHoveredRunnerId(null);
    setTooltipPosition(null);
  }

  return (
    <>
      <div className="batch-overview-hero">
        <div><span>Win leader</span><strong>{leader?.runnerName ?? "--"}</strong><small>{leader?.winRate.toFixed(0) ?? "0"}% win rate</small></div>
        <div><span>Selected build</span><strong>{inspectedRunner?.runnerName ?? "--"}</strong><small>Avg place {inspectedRunner?.averagePlace.toFixed(2) ?? "--"}</small></div>
        <div><span>Field stability</span><strong>{leader?.finishTimeP90.toFixed(2) ?? "--"}s</strong><small>Leader P90 finish</small></div>
      </div>
      <div className="batch-analysis-table" role="table" aria-label="Batch race analysis">
        <div className="batch-analysis-header" role="row">
          <span>Runner</span><span>Win</span><span>Top 3</span><span>Avg place</span><span>Avg time</span><span>P90 time</span>
        </div>
        {result.runners.map((runner) => (
          <button
            className={runner.runnerId === inspectedRunner?.runnerId ? "batch-analysis-row is-selected" : "batch-analysis-row"}
            key={runner.runnerId}
            onBlur={hideRunnerTooltip}
            onClick={() => onInspect(runner.runnerId)}
            onFocus={(event) => showRunnerTooltip(runner.runnerId, event.currentTarget)}
            onMouseEnter={(event) => showRunnerTooltip(runner.runnerId, event.currentTarget)}
            onMouseLeave={hideRunnerTooltip}
            type="button"
          >
            <strong>{runner.runnerName}</strong><span>{runner.winRate.toFixed(0)}%</span><span>{runner.topThreeRate.toFixed(0)}%</span><span>{runner.averagePlace.toFixed(2)}</span><span>{runner.averageFinishTime.toFixed(2)}s</span><span>{runner.finishTimeP90.toFixed(2)}s</span>
          </button>
        ))}
      </div>
      {hoveredRunnerId && tooltipPosition ? (
        <AnalysisRunnerTooltip position={tooltipPosition} runnerId={hoveredRunnerId} result={result} />
      ) : null}
    </>
  );
}

function AnalysisRunnerTooltip({
  runnerId,
  result,
  position,
}: {
  runnerId: string;
  result: RaceBatchResult;
  position: { left: number; top: number };
}) {
  const runner = result.setup.runners.find((candidate) => candidate.id === runnerId);
  const character = runner ? characterTemplates.find((candidate) => candidate.cardId === runner.cardId) : null;

  if (!runner || typeof document === "undefined") return null;

  return createPortal(
    <aside className="analysis-runner-tooltip" role="tooltip" style={position}>
      {character?.thumbImg ? <img alt="" src={character.thumbImg} /> : null}
      <span>
        <strong>{runner.characterName}</strong>
        <small>{runner.buildName}</small>
        <em>S {runner.stats.speed} · St {runner.stats.stamina} · P {runner.stats.power}</em>
        <em>{runner.strategy} · {runner.mood} · {runner.skillIds.length} skills</em>
      </span>
    </aside>,
    document.body,
  );
}

function BatchRuns({ result, onOpenReplay }: Pick<BatchAnalysisProps, "result" | "onOpenReplay">) {
  return (
    <div className="batch-runs" aria-label="Batch runs">
      {result.runs.map((run) => {
        const winner = run.placements[0];
        return (
          <div className="batch-run-row" key={run.index}>
            <span>Run {run.index}</span>
            <strong>{winner?.runnerName ?? "No winner"}</strong>
            <small>{winner?.finishTime.toFixed(2) ?? "--"}s · {run.skillEvents.length} skills</small>
            <button onClick={() => onOpenReplay(run.index)} type="button">Open replay</button>
          </div>
        );
      })}
    </div>
  );
}

function BatchSkills({ result, inspectedRunner, onInspect }: Pick<BatchAnalysisProps, "result" | "inspectedRunner" | "onInspect">) {
  return (
    <section className="batch-skill-summary">
      <div className="batch-skill-runner-picker">
        {result.runners.map((runner) => (
          <button
            className={runner.runnerId === inspectedRunner?.runnerId ? "is-selected" : ""}
            key={runner.runnerId}
            onClick={() => onInspect(runner.runnerId)}
            type="button"
          >
            {runner.runnerName}
          </button>
        ))}
      </div>
      {inspectedRunner ? (
        <>
          <div><span>Aggregate skills</span><strong>{inspectedRunner.runnerName}</strong></div>
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
        </>
      ) : null}
    </section>
  );
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
