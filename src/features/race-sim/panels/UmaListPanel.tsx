import { Activity, ChevronsRight, Database, Plus, Trash2 } from "lucide-react";
import { characterTemplates } from "../../../data/characters";
import type { Placement } from "../../../domain/race/types";
import type { Mood, RunnerBuild, StatKey, StoredUma, Strategy } from "../../../domain/uma/types";

const moods: Mood[] = ["awful", "bad", "normal", "good", "great"];
const strategies: Strategy[] = ["front", "pace", "late", "end"];
const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wit"];

export type RunnerOverride = Pick<RunnerBuild, "strategy" | "mood">;

export type UmaListPanelProps = {
  batchActive: boolean;
  isOpen: boolean;
  onChangeOverride: (runnerId: string, override: RunnerOverride) => void;
  onClose: () => void;
  onInspectRunner: (runnerId: string) => void;
  onOpenBuilder: () => void;
  onOpenLibrary: () => void;
  onRemoveRunner: (runnerId: string) => void;
  onToggleRunner: (runnerId: string) => void;
  placements: Placement[];
  runnerOverrides: Record<string, RunnerOverride>;
  runners: RunnerBuild[];
  savedUmas: StoredUma[];
  selectedRunnerIds: string[];
};

export function UmaListPanel({
  batchActive,
  isOpen,
  onChangeOverride,
  onClose,
  onInspectRunner,
  onOpenBuilder,
  onOpenLibrary,
  onRemoveRunner,
  onToggleRunner,
  placements,
  runnerOverrides,
  runners,
  savedUmas,
  selectedRunnerIds,
}: UmaListPanelProps) {
  const placementByRunnerId = new Map(placements.map((placement) => [placement.runnerId, placement]));
  const savedRunnerIds = new Set(savedUmas.map((runner) => runner.id));

  return (
    <div className={isOpen ? "panel runner-panel field-drawer" : "panel runner-panel field-drawer is-closed"}>
      <div className="panel-heading">
        <Activity size={18} />
        <h2>Uma list</h2>
        <span className="field-drawer-count">{selectedRunnerIds.length} selected</span>
        <button className="drawer-close-button" onClick={onClose} title="Collapse Uma list" type="button">
          <ChevronsRight size={18} />
        </button>
      </div>

      <div className="field-drawer-actions">
        <button className="ghost-button" onClick={onOpenLibrary} type="button">
          <Database size={16} />
          Uma Library
        </button>
        <button className="ghost-button" onClick={onOpenBuilder} type="button">
          <Plus size={16} />
          Add Uma
        </button>
      </div>

      <div className="runner-table">
        {runners.map((runner) => {
          const isSelected = selectedRunnerIds.includes(runner.id);
          const override = runnerOverrides[runner.id] ?? { strategy: runner.strategy, mood: runner.mood };
          const placement = batchActive ? null : placementByRunnerId.get(runner.id);

          return (
            <div className={isSelected ? "runner-row is-selected" : "runner-row"} key={runner.id}>
              <div className="runner-select-cell">
                <input
                  aria-label={`Select ${runner.name}`}
                  checked={isSelected}
                  onChange={() => onToggleRunner(runner.id)}
                  type="checkbox"
                />
                <button className="runner-profile-button" onClick={() => onInspectRunner(runner.id)} type="button">
                  <img
                    alt=""
                    src={characterTemplates.find((character) => character.cardId === runner.cardId)?.thumbImg ?? ""}
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
                  onChangeOverride(runner.id, { ...override, strategy: event.target.value as Strategy })
                }
              >
                {strategies.map((strategy) => (
                  <option key={strategy} value={strategy}>{strategy}</option>
                ))}
              </select>
              <select
                aria-label={`${runner.name} mood`}
                disabled={!isSelected}
                value={override.mood}
                onChange={(event) => onChangeOverride(runner.id, { ...override, mood: event.target.value as Mood })}
              >
                {moods.map((mood) => (
                  <option key={mood} value={mood}>{mood}</option>
                ))}
              </select>
              {savedRunnerIds.has(runner.id) ? (
                <button
                  className="icon-button"
                  onClick={() => onRemoveRunner(runner.id)}
                  title="Remove custom runner"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactStatRow({ stats }: { stats: RunnerBuild["stats"] }) {
  return (
    <div className="compact-stat-row" aria-label="Runner stats">
      {statKeys.map((stat) => (
        <span className={`compact-stat is-${stat}`} key={stat}>
          <strong>{stats[stat]}</strong>
        </span>
      ))}
    </div>
  );
}
