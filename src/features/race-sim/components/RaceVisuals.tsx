import { Route } from "lucide-react";
import type { RaceResult, Track } from "../../../domain/race/types";
import type { AptitudeRank } from "../../../domain/uma/types";

export function AptitudeGroup({
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

export type TrackDiagramMarker = {
  distanceMeters: number;
  id: string;
  label: string;
  phase: string;
  second: number;
  status?: string;
};

export function TrackDiagram({
  track,
  markers = [],
}: {
  track: Track;
  markers?: TrackDiagramMarker[];
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
        <polyline className="elevation-line" points={elevationPoints.map(([x, y]) => `${x},${y}`).join(" ")} />

        {markers.map((marker) => {
          const x = scaleX(Math.min(Math.max(marker.distanceMeters, 0), track.distanceMeters));
          return (
            <g className={`track-event-marker is-${marker.status ?? marker.phase.toLowerCase()}`} key={marker.id}>
              <title>{marker.status === "activated" ? `${marker.label} at ${marker.second.toFixed(1)}s` : marker.label}</title>
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

export function RaceTriggerTimeline({
  events,
  debugEntries,
}: {
  events: Array<{
    distanceMeters: number;
    phase: string;
    progress: number;
    second: number;
    skillId: string;
    skillName: string;
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
              <small>{event.second.toFixed(1)}s - {event.distanceMeters.toFixed(0)}m</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatSegmentDistance(track: Track, slope: "uphill" | "downhill"): number {
  return track.segments
    .filter((segment) => segment.slope === slope)
    .reduce((total, segment) => total + segment.endMeters - segment.startMeters, 0);
}
