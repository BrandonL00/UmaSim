import type { RuntimeRunner, RunnerNeighbors } from "./engineState";

const maxLane = 2;
const laneChangeStep = 0.5;

export function updateRunnerPathing(
  runner: RuntimeRunner,
  neighbors: RunnerNeighbors,
  runnerCount: number,
  navigationBonus = 0,
  laneChangeResistance = 0,
) {
  const preferredLane = preferredBaseLane(runnerCount);
  const currentLane = runner.spatial.lane;
  const isPressured = runner.rival.pressuredByIds.length > 0;

  if (runner.traffic.boxedIn) {
    if (!runner.traffic.outerLaneBlocked && currentLane < maxLane) {
      runner.spatial.targetLane = currentLane + 1;
    } else if (!runner.traffic.innerLaneBlocked && currentLane > 0) {
      runner.spatial.targetLane = currentLane - 1;
    } else {
      runner.spatial.targetLane = currentLane;
    }
  } else if (neighbors.blockedFront && currentLane < maxLane && !neighbors.blockedSide) {
    runner.spatial.targetLane = currentLane + 1;
  } else if (isPressured && currentLane < maxLane) {
    runner.spatial.targetLane = currentLane + 1;
  } else if (!neighbors.blockedFront && currentLane > preferredLane) {
    runner.spatial.targetLane = currentLane - 1;
  } else if (!neighbors.blockedFront && currentLane < preferredLane) {
    runner.spatial.targetLane = currentLane + 1;
  } else {
    runner.spatial.targetLane = currentLane;
  }

  const direction = getLaneMoveDirection(runner);

  if (direction === 0) {
    runner.spatial.laneChangeProgress = 0;
    runner.spatial.moveLane = 0;
    return;
  }

  runner.spatial.laneChangeProgress += Math.max(0.1, laneChangeStep + navigationBonus - laneChangeResistance);
  runner.spatial.moveLane = direction;

  if (runner.spatial.laneChangeProgress < 1) {
    return;
  }

  runner.spatial.lane = clamp(currentLane + (direction === 2 ? 1 : -1), 0, maxLane);
  runner.spatial.laneChangeProgress = 0;
  runner.spatial.moveLane = getLaneMoveDirection(runner);
}

export function getLaneMoveDirection(runner: RuntimeRunner): 0 | 1 | 2 {
  if (runner.spatial.targetLane > runner.spatial.lane) {
    return 2;
  }

  if (runner.spatial.targetLane < runner.spatial.lane) {
    return 1;
  }

  return 0;
}

export function getLaneType(runner: RuntimeRunner): number {
  return runner.spatial.lane === 0 ? 0 : runner.spatial.lane === 1 ? 1 : 2;
}

function preferredBaseLane(runnerCount: number) {
  return runnerCount >= 10 ? 1 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
