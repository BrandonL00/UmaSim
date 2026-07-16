import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestUrl = "https://gametora.com/data/manifests/umamusume.json";
const dataBaseUrl = "https://gametora.com/data/umamusume";
const importerVersion = "3";
const trackDataKey = "history/pre_2nd_anni/racetracks";
const outputDir = path.resolve("src/data/generated");
const outputPath = path.join(outputDir, "gametoraGlobalTracks.json");

const venueNames = {
  10001: "Sapporo",
  10002: "Hakodate",
  10003: "Niigata",
  10004: "Fukushima",
  10005: "Nakayama",
  10006: "Tokyo",
  10007: "Chukyo",
  10008: "Kyoto",
  10009: "Hanshin",
  10010: "Kokura",
  10101: "Ooi",
  10103: "Kawasaki",
  10104: "Funabashi",
  10105: "Morioka",
  10201: "Longchamp",
};

const periods = [
  "pre_aoharu",
  "pre_first_anni",
  "pre_mant",
  "pre_gl",
  "pre_nar",
  "pre_2nd_anni",
  "pre_2_5th_anni",
  "pre_3rd_anni",
  "pre_gff",
  "pre_2024_wedding",
  "pre_mecha",
  "pre_tl",
  "pre_dyi",
  "pre_sp_removal",
  "pre_yhs",
  "pre_santa_anita",
  "pre_breeders",
  "present",
];

const globalPeriod = "pre_gl";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "UmaSim data importer",
    },
  });

  if (!response.ok) {
    throw new Error(`GameTora request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}

function existedByGlobalPeriod(race) {
  if (!race.did_not_exist) {
    return true;
  }

  return periods.indexOf(globalPeriod) > periods.indexOf(race.did_not_exist);
}

function distanceCategory(length) {
  if (length < 1401) return "sprint";
  if (length < 1801) return "mile";
  if (length < 2401) return "medium";
  return "long";
}

function direction(turn) {
  if (turn === 1) return "clockwise";
  if (turn === 2) return "counterclockwise";
  return "straight";
}

function courseLabel(inout) {
  if (inout === 2) return "Inner";
  if (inout === 3) return "Outer";
  if (inout === 4) return "Outer to Inner";
  return "";
}

const seasonById = {
  1: "spring",
  2: "summer",
  3: "fall",
  4: "winter",
  5: "cherryBlossom",
};

const weatherById = {
  1: "sunny",
  2: "cloudy",
  3: "rainy",
  4: "snowy",
};

const groundConditionById = {
  1: "firm",
  2: "good",
  3: "soft",
  4: "heavy",
};

function createSegments(course) {
  const boundaries = new Set([0, course.length]);

  for (const range of [...course.corners, ...course.straights, ...course.slopes]) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const ordered = [...boundaries].sort((left, right) => left - right);
  const lastCorner = course.corners.at(-1);
  const lastStraight = course.straights.at(-1);

  return ordered.slice(0, -1).map((startMeters, index) => {
    const endMeters = ordered[index + 1];
    const midpoint = (startMeters + endMeters) / 2;
    const corner = course.corners.find((range) => midpoint >= range.start && midpoint < range.end);
    const slope = course.slopes.find((range) => midpoint >= range.start && midpoint < range.end);
    const tags = [];

    if (corner && lastCorner && corner.start === lastCorner.start && corner.end === lastCorner.end) {
      tags.push("finalCorner");
    }

    if (!corner && lastStraight && midpoint >= lastStraight.start && midpoint < lastStraight.end) {
      tags.push("finalStraight");
    }

    return {
      startMeters,
      endMeters,
      kind: corner ? "corner" : "straight",
      slope: slope ? (slope.slope > 0 ? "uphill" : "downhill") : "flat",
      ...(tags.length ? { tags } : {}),
    };
  });
}

const manifest = await fetchJson(manifestUrl);
const trackHash = manifest[trackDataKey];
const raceHash = manifest.races;
const globalCmHash = manifest["en/events/champions-meeting"];
const japanCmHash = manifest["events/champions-meeting"];

if (!trackHash || !raceHash || !globalCmHash || !japanCmHash) {
  throw new Error("GameTora manifest did not include the required track, race, or Champions Meeting hashes.");
}

const tracksUrl = `${dataBaseUrl}/${trackDataKey}.${trackHash}.json`;
const racesUrl = `${dataBaseUrl}/races.${raceHash}.json`;
const globalCmUrl = `${dataBaseUrl}/en/events/champions-meeting.${globalCmHash}.json`;
const japanCmUrl = `${dataBaseUrl}/events/champions-meeting.${japanCmHash}.json`;
const [rawVenues, rawRaces, rawGlobalCms, rawJapanCms] = await Promise.all([
  fetchJson(tracksUrl),
  fetchJson(racesUrl),
  fetchJson(globalCmUrl),
  fetchJson(japanCmUrl),
]);

const globalRaces = rawRaces.filter(
  (race) => !race.unreleased_servers?.includes("en") && existedByGlobalPeriod(race),
);
const racesByCourseId = new Map();

for (const race of globalRaces) {
  const current = racesByCourseId.get(race.course_id) ?? [];
  current.push(race);
  racesByCourseId.set(race.course_id, current);
}

const tracks = rawVenues
  .flatMap((venue) =>
    venue.courses
      .filter((course) => racesByCourseId.has(course.id))
      .map((course) => {
        const races = racesByCourseId.get(course.id);
        const venueName = venueNames[venue.id] ?? `Track ${venue.id}`;
        const variant = courseLabel(course.inout);
        const surface = course.terrain === 2 ? "dirt" : "turf";

        return {
          id: `gt-${course.id}`,
          sourceCourseId: course.id,
          venueId: Number(venue.id),
          venue: venueName,
          name: `${venueName} ${course.length}m ${surface === "turf" ? "Turf" : "Dirt"}${variant ? ` (${variant})` : ""}`,
          surface,
          distanceMeters: course.length,
          distanceCategory: distanceCategory(course.length),
          direction: direction(course.turn),
          courseVariant: variant || null,
          segments: createSegments(course),
          representativeRaces: races.slice(0, 4).map((race) => ({
            id: race.id,
            name: race.name_en,
          })),
        };
      }),
  )
  .sort(
    (left, right) =>
      left.venue.localeCompare(right.venue) ||
      left.distanceMeters - right.distanceMeters ||
      left.surface.localeCompare(right.surface),
  );

const trackByCourseId = new Map(tracks.map((track) => [track.sourceCourseId, track]));
const racePresets = globalRaces
  .map((race) => {
    const track = trackByCourseId.get(race.course_id);
    if (!track || !seasonById[race.season]) return null;

    return {
      id: `gt-race-${race.id}`,
      sourceRaceId: race.id,
      bannerId: race.banner_id ?? null,
      name: race.name_en,
      trackId: track.id,
      season: seasonById[race.season],
      entryCount: race.entries ?? null,
      time: race.time ?? null,
      grade: race.grade ?? null,
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.name.localeCompare(right.name) || left.sourceRaceId - right.sourceRaceId)
  .filter((preset, index, presets) =>
    !presets.slice(0, index).some((candidate) =>
      candidate.name === preset.name &&
      candidate.trackId === preset.trackId &&
      candidate.season === preset.season &&
      candidate.entryCount === preset.entryCount &&
      candidate.time === preset.time &&
      candidate.grade === preset.grade,
    ),
  );

function createChampionsMeetingPreset(event, server) {
  const race = event.race;
  const candidates = tracks.filter(
    (track) =>
      track.venueId === race.track &&
      track.distanceMeters === race.distance &&
      track.surface === (race.ground === 2 ? "dirt" : "turf") &&
      track.direction === direction(race.turn),
  );

  return {
    id: `gt-cm-${server}-${event.id}`,
    sourceEventId: event.id,
    name: event.name_en ?? event.name,
    server,
    resourceId: event.resource_id ?? 1,
    start: event.start,
    end: event.end,
    trackId: candidates.length === 1 ? candidates[0].id : null,
    trackCandidateIds: candidates.map((track) => track.id),
    distanceMeters: race.distance,
    surface: race.ground === 2 ? "dirt" : "turf",
    direction: direction(race.turn),
    season: seasonById[race.season] ?? null,
    weather: weatherById[race.weather] ?? null,
    groundCondition: groundConditionById[race.condition] ?? null,
  };
}

const championsMeetingPresets = [
  ...rawGlobalCms.map((event) => createChampionsMeetingPreset(event, "global")),
  ...rawJapanCms.map((event) => createChampionsMeetingPreset(event, "jp")),
].sort((left, right) => right.start - left.start || left.server.localeCompare(right.server));

const payload = {
  generatedAt: new Date().toISOString(),
  importerVersion,
  server: "global",
  ruleset: trackDataKey,
  source: {
    provider: "gametora.com",
    manifestUrl,
    tracksUrl,
    racesUrl,
    trackHash,
    raceHash,
    championsMeetings: {
      global: { url: globalCmUrl, hash: globalCmHash },
      japan: { url: japanCmUrl, hash: japanCmHash },
    },
  },
  count: tracks.length,
  tracks,
  racePresets,
  championsMeetingPresets,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${tracks.length} Global course layouts to ${outputPath}`);
