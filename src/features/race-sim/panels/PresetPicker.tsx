import { Medal, Route, Search, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { formatChampionsMeetingPresetName, type ChampionsMeetingPreset, type RacePreset } from "../../../domain/race/presets";
import type { Track } from "../../../domain/race/types";

type PickerSharedProps = {
  onClose: () => void;
  tracks: Track[];
};

export function RacePresetPicker({ onApply, onClose, presets, tracks }: PickerSharedProps & {
  onApply: (preset: RacePreset) => void;
  presets: RacePreset[];
}) {
  const [query, setQuery] = useState("");
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const visiblePresets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return presets;
    return presets.filter((preset) => {
      const track = trackById.get(preset.trackId);
      return [preset.name, track?.name ?? ""].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [presets, query, trackById]);

  return (
    <PresetDialog icon={<Route size={19} />} onClose={onClose} title="Race presets">
      <label className="preset-search">
        <Search size={16} />
        <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Search race or venue" value={query} />
      </label>
      <div className="preset-picker-list">
        {visiblePresets.map((preset) => {
          const track = trackById.get(preset.trackId);
          return (
            <button className="preset-picker-row" key={preset.id} onClick={() => onApply(preset)} type="button">
              {preset.bannerId ? (
                <img
                  alt={`${preset.name} race banner`}
                  className="preset-race-banner"
                  loading="lazy"
                  src={raceBannerUrl(preset.bannerId)}
                />
              ) : null}
              <span className="preset-picker-copy">
              <strong>{preset.name}</strong>
              <span>{track?.name ?? "Unavailable course"}</span>
              <small>{toTitle(preset.season)} · {preset.entryCount ?? "?"} entries</small>
              </span>
            </button>
          );
        })}
      </div>
    </PresetDialog>
  );
}

export function ChampionsMeetingPresetPicker({ onApply, onClose, presets, tracks }: PickerSharedProps & {
  onApply: (preset: ChampionsMeetingPreset) => void;
  presets: ChampionsMeetingPreset[];
}) {
  const [query, setQuery] = useState("");
  const [server, setServer] = useState<"global" | "jp">("global");
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const visiblePresets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return presets.filter((preset) => {
      if (preset.server !== server) return false;
      const track = preset.trackId ? trackById.get(preset.trackId) : undefined;
      return !normalized || [formatChampionsMeetingPresetName(preset), track?.name ?? ""].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [presets, query, server, trackById]);

  return (
    <PresetDialog icon={<Medal size={19} />} onClose={onClose} title="Champions Meeting presets">
      <div className="preset-picker-controls">
        <label className="preset-search">
          <Search size={16} />
          <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Search CM or venue" value={query} />
        </label>
        <div className="preset-server-toggle" role="group" aria-label="Champions Meeting server">
          <button className={server === "global" ? "is-active" : ""} onClick={() => setServer("global")} type="button">Global</button>
          <button className={server === "jp" ? "is-active" : ""} onClick={() => setServer("jp")} type="button">JP archive</button>
        </div>
      </div>
      <div className="preset-picker-list">
        {visiblePresets.map((preset) => {
          const track = preset.trackId ? trackById.get(preset.trackId) : undefined;
          const canApply = Boolean(track && preset.season && preset.weather && preset.groundCondition);
          return (
            <button
              className={canApply ? "preset-picker-row" : "preset-picker-row is-unavailable"}
              disabled={!canApply}
              key={preset.id}
              onClick={() => onApply(preset)}
              type="button"
            >
              <strong>{formatChampionsMeetingPresetName(preset)}</strong>
              <span>{track?.name ?? "Course not in the imported Global catalog"}</span>
              <small>{formatDate(preset.start)} · {preset.distanceMeters}m · {toTitle(preset.groundCondition)} · {toTitle(preset.weather)}</small>
            </button>
          );
        })}
      </div>
    </PresetDialog>
  );
}

function PresetDialog({ children, icon, onClose, title }: Pick<PickerSharedProps, "onClose"> & { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section aria-labelledby="preset-picker-title" aria-modal="true" className="modal-backdrop preset-picker-backdrop" role="dialog">
      <div className="modal-panel preset-picker-panel">
        <div className="modal-heading">
          <div className="panel-heading"><span>{icon}</span><h2 id="preset-picker-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} title="Close preset picker" type="button"><X size={18} /></button>
        </div>
        {children}
      </div>
    </section>
  );
}

function toTitle(value: string | null) {
  return value ? value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()) : "Unknown";
}

function formatDate(seconds: number) {
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(seconds * 1000));
}

function raceBannerUrl(bannerId: number) {
  return `https://media.gametora.com/umamusume/races/banners/en/${bannerId}.png`;
}
