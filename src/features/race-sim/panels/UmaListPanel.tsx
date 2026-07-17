import {
  Activity,
  ChevronsRight,
  Database,
  Dices,
  GripVertical,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";
import { characterTemplates } from "../../../data/characters";
import type { Placement, RaceTeam } from "../../../domain/race/types";
import type { Mood, RunnerBuild, StatKey, Strategy } from "../../../domain/uma/types";

const moods: Mood[] = ["awful", "bad", "normal", "good", "great"];
const strategies: Strategy[] = ["front", "pace", "late", "end"];
const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wit"];

export type RunnerOverride = Pick<RunnerBuild, "strategy" | "mood"> & {
  popularityRank: number;
  gateBlock?: number;
};

export type UmaListPanelProps = {
  batchActive: boolean;
  isOpen: boolean;
  maxRunnerCount: number;
  targetRunnerCount: number;
  onAddTeam: () => void;
  onChangeOverride: (runnerId: string, override: RunnerOverride) => void;
  onChangeTeam: (teamId: string, updates: Partial<Pick<RaceTeam, "name" | "color">>) => void;
  onChangeTeamMode: (mode: "individual" | "teams") => void;
  onFillRaceField: () => void;
  onTargetRunnerCountChange: (count: number) => void;
  onToggle: () => void;
  onInspectRunner: (runnerId: string) => void;
  onMoveRunnerToField: (runnerId: string, teamId?: string) => void;
  onOpenBuilder: () => void;
  onOpenLibrary: () => void;
  onRemoveRunnerFromField: (runnerId: string) => void;
  onRemoveTeam: (teamId: string) => void;
  placements: Placement[];
  runnerOverrides: Record<string, RunnerOverride>;
  runners: RunnerBuild[];
  runnerTeamIds: Record<string, string>;
  selectedRunnerIds: string[];
  teamMode: "individual" | "teams";
  teams: RaceTeam[];
};

export function UmaListPanel({
  batchActive,
  isOpen,
  maxRunnerCount,
  targetRunnerCount,
  onAddTeam,
  onChangeOverride,
  onChangeTeam,
  onChangeTeamMode,
  onFillRaceField,
  onTargetRunnerCountChange,
  onToggle,
  onInspectRunner,
  onMoveRunnerToField,
  onOpenBuilder,
  onOpenLibrary,
  onRemoveRunnerFromField,
  onRemoveTeam,
  placements,
  runnerOverrides,
  runners,
  runnerTeamIds,
  selectedRunnerIds,
  teamMode,
  teams,
}: UmaListPanelProps) {
  const [draggedRunnerId, setDraggedRunnerId] = useState<string | null>(null);
  const [mobileTeamChoices, setMobileTeamChoices] = useState<Record<string, string>>({});

  if (!isOpen) return null;
  const placementByRunnerId = new Map(placements.map((placement) => [placement.runnerId, placement]));
  const selectedSet = new Set(selectedRunnerIds);
  const knownTeamIds = new Set(teams.map((team) => team.id));
  const selectedRunners = selectedRunnerIds
    .map((id) => runners.find((runner) => runner.id === id))
    .filter((runner): runner is RunnerBuild => runner !== undefined);
  const availableRunners = runners.filter((runner) => !selectedSet.has(runner.id));
  const unassignedRunners = selectedRunners.filter((runner) => {
    const teamId = runnerTeamIds[runner.id];
    return !teamId || !knownTeamIds.has(teamId);
  });

  function beginDrag(event: DragEvent, runnerId: string) {
    setDraggedRunnerId(runnerId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", runnerId);
  }

  function getDroppedRunnerId(event: DragEvent) {
    return event.dataTransfer.getData("text/plain") || draggedRunnerId;
  }

  function dropIntoField(event: DragEvent, teamId?: string) {
    event.preventDefault();
    const runnerId = getDroppedRunnerId(event);
    if (runnerId) onMoveRunnerToField(runnerId, teamId);
    setDraggedRunnerId(null);
  }

  function dropIntoAvailable(event: DragEvent) {
    event.preventDefault();
    const runnerId = getDroppedRunnerId(event);
    if (runnerId) onRemoveRunnerFromField(runnerId);
    setDraggedRunnerId(null);
  }

  const renderRunner = (runner: RunnerBuild, selected: boolean) => {
    const entryIndex = Math.max(selectedRunnerIds.indexOf(runner.id), 0);
    const override = runnerOverrides[runner.id] ?? getDefaultRunnerOverride(runner, entryIndex);
    const placement = batchActive ? null : placementByRunnerId.get(runner.id);
    const template = characterTemplates.find((character) => character.cardId === runner.cardId);

    return (
      <article
        className={selected ? "field-runner-card is-selected" : "field-runner-card"}
        draggable
        key={runner.id}
        onDragEnd={() => setDraggedRunnerId(null)}
        onDragStart={(event) => beginDrag(event, runner.id)}
      >
        <GripVertical aria-hidden="true" className="runner-drag-handle" size={17} />
        <button className="field-runner-identity" onClick={() => onInspectRunner(runner.id)} type="button">
          <img alt="" src={template?.thumbImg ?? ""} />
          <span>
            <strong>{runner.characterName}</strong>
            <small>{runner.buildName}</small>
          </span>
        </button>
        {selected ? (
          <span className={placement ? "field-place-chip" : "field-place-chip is-empty"}>
            {placement ? `#${placement.place}` : "—"}
          </span>
        ) : null}
        <CompactStatRow stats={runner.stats} />

        {selected ? (
          <div className="field-runner-controls">
            <label>
              <span>Strategy</span>
              <select
                aria-label={`${runner.name} strategy`}
                value={override.strategy}
                onChange={(event) => onChangeOverride(runner.id, { ...override, strategy: event.target.value as Strategy })}
              >
                {strategies.map((strategy) => <option key={strategy} value={strategy}>{strategy}</option>)}
              </select>
            </label>
            <label>
              <span>Mood</span>
              <select
                aria-label={`${runner.name} mood`}
                value={override.mood}
                onChange={(event) => onChangeOverride(runner.id, { ...override, mood: event.target.value as Mood })}
              >
                {moods.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
              </select>
            </label>
            <label>
              <span>Popularity</span>
              <select
                aria-label={`${runner.name} popularity rank`}
                value={override.popularityRank}
                onChange={(event) => onChangeOverride(runner.id, { ...override, popularityRank: Number(event.target.value) })}
              >
                {Array.from({ length: Math.max(selectedRunnerIds.length, 1) }, (_, index) => index + 1).map((rank) => (
                  <option key={rank} value={rank}>#{rank}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Gate</span>
              <select
                aria-label={`${runner.name} gate block`}
                value={override.gateBlock ?? ""}
                onChange={(event) => onChangeOverride(runner.id, {
                  ...override,
                  gateBlock: event.target.value ? Number(event.target.value) : undefined,
                })}
              >
                <option value="">Unset</option>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((block) => (
                  <option key={block} value={block}>{block}</option>
                ))}
              </select>
            </label>
            {teamMode === "teams" ? (
              <label>
                <span>Team</span>
                <select
                  aria-label={`${runner.name} team`}
                  value={runnerTeamIds[runner.id] ?? ""}
                  onChange={(event) => onMoveRunnerToField(runner.id, event.target.value || undefined)}
                >
                  <option value="">Independent</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="mobile-roster-actions">
          {!selected && teamMode === "teams" ? (
            <select
              aria-label={`${runner.name} team before adding`}
              onChange={(event) => setMobileTeamChoices((current) => ({ ...current, [runner.id]: event.target.value }))}
              value={mobileTeamChoices[runner.id] ?? ""}
            >
              <option value="">Independent</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          ) : null}
          <button
            className={selected ? "mobile-roster-action is-remove" : "mobile-roster-action"}
            onClick={() => selected
              ? onRemoveRunnerFromField(runner.id)
              : onMoveRunnerToField(runner.id, mobileTeamChoices[runner.id] || undefined)}
            type="button"
          >
            {selected ? <Trash2 size={15} /> : <Plus size={15} />}
            {selected ? "Remove" : "Add to race"}
          </button>
        </div>

      </article>
    );
  };

  return (
    <aside className="panel runner-panel field-drawer is-open">
      <div className="panel-heading">
        <Activity size={18} />
        <h2>Race field</h2>
        <span className="field-drawer-count">{selectedRunnerIds.length} / {targetRunnerCount}</span>
        <button className="drawer-close-button" onClick={onToggle} title="Collapse race field" type="button">
          <ChevronsRight size={18} />
        </button>
      </div>

      <div className="field-drawer-actions">
        <button className="ghost-button" onClick={onOpenLibrary} type="button"><Database size={16} /> Uma Library</button>
        <button className="ghost-button" onClick={onOpenBuilder} type="button"><Plus size={16} /> Add Uma</button>
      </div>

      <div className="field-roster-controls">
        <label>
          <span>Runners</span>
          <input
            aria-label="Declared runner count"
            max={maxRunnerCount}
            min={1}
            onChange={(event) => onTargetRunnerCountChange(Number(event.target.value))}
            type="number"
            value={targetRunnerCount}
          />
          <small>Max {maxRunnerCount} for this course</small>
        </label>
        <button className="ghost-button" disabled={selectedRunnerIds.length >= targetRunnerCount} onClick={onFillRaceField} type="button">
          <Dices size={16} /> Fill roster
        </button>
      </div>

      <section className="team-mode-card">
        <div className="team-mode-toggle" role="group" aria-label="Race team mode">
          <button className={teamMode === "individual" ? "is-active" : ""} onClick={() => onChangeTeamMode("individual")} type="button">
            <UserRound size={15} /> Individual
          </button>
          <button className={teamMode === "teams" ? "is-active" : ""} onClick={() => onChangeTeamMode("teams")} type="button">
            <Users size={15} /> Teams
          </button>
        </div>
      </section>

      <div className="race-field-board">
        <section
          className="runner-drop-lane available-runner-lane"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropIntoAvailable}
        >
          <div className="runner-lane-heading">
            <strong>Builds</strong>
            <span>{availableRunners.length}</span>
          </div>
          <div className="field-runner-list">
            {availableRunners.length ? availableRunners.map((runner) => renderRunner(runner, false)) : (
              <p className="runner-lane-empty">Every saved build is in the field.</p>
            )}
          </div>
        </section>

        <div className="race-entry-lanes">
          {teamMode === "individual" ? (
            <section
              className="runner-drop-lane individual-runner-lane"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropIntoField(event)}
            >
              <div className="runner-lane-heading">
                <strong>Entries</strong>
                <span>{selectedRunners.length}</span>
              </div>
              <div className="field-runner-list">
                {selectedRunners.map((runner) => renderRunner(runner, true))}
              </div>
            </section>
          ) : (
            <>
              <div className="team-lanes-toolbar">
                <strong>Teams</strong>
                <button className="team-add-button" onClick={onAddTeam} title="Add team" type="button"><Plus size={17} /></button>
              </div>
              {teams.map((team) => {
                const teamRunners = selectedRunners.filter((runner) => runnerTeamIds[runner.id] === team.id);
                return (
                  <section
                    className="runner-drop-lane team-runner-lane"
                    key={team.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropIntoField(event, team.id)}
                    style={{ "--team-color": team.color } as CSSProperties}
                  >
                    <div className="runner-lane-heading team-lane-heading">
                      <input
                        aria-label={`${team.name} color`}
                        className="team-color-input"
                        onChange={(event) => onChangeTeam(team.id, { color: event.target.value })}
                        type="color"
                        value={team.color}
                      />
                      <input
                        aria-label="Team name"
                        className="team-name-input"
                        onChange={(event) => onChangeTeam(team.id, { name: event.target.value })}
                        value={team.name}
                      />
                      <span>{teamRunners.length}</span>
                      <button className="icon-button" onClick={() => onRemoveTeam(team.id)} title={`Remove ${team.name}`} type="button">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="field-runner-list">
                      {teamRunners.length ? teamRunners.map((runner) => renderRunner(runner, true)) : (
                        <p className="runner-lane-empty">Drop runners here</p>
                      )}
                    </div>
                  </section>
                );
              })}
              {unassignedRunners.length ? (
                <section
                  className="runner-drop-lane unassigned-runner-lane"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropIntoField(event)}
                >
                  <div className="runner-lane-heading">
                    <strong>Independent</strong>
                    <span>{unassignedRunners.length}</span>
                  </div>
                  <div className="field-runner-list">{unassignedRunners.map((runner) => renderRunner(runner, true))}</div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function getDefaultRunnerOverride(runner: RunnerBuild, entryIndex: number): RunnerOverride {
  return { strategy: runner.strategy, mood: runner.mood, popularityRank: entryIndex + 1 };
}

function CompactStatRow({ stats }: { stats: RunnerBuild["stats"] }) {
  return (
    <div className="compact-stat-row" aria-label="Runner stats">
      {statKeys.map((stat) => (
        <span className={`compact-stat is-${stat}`} key={stat}><strong>{stats[stat]}</strong></span>
      ))}
    </div>
  );
}
