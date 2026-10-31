import { inverseKinematics } from '../kinematics/kinematics';
import {
  generateArrivalSchedule,
  PickPlaceScenario,
  type PickPlaceConfig,
  type ScheduledArrival,
} from '../scenarios/pickPlace/pickPlace';
import { SIM_DT } from '../sim/simLoop';
import {
  PARAM_BOUNDS,
  type CandidateRunRecord,
  type CandidateValidation,
  type ConfigDiffEntry,
  type EditableParam,
  type HeldOutAggregate,
  type HeldOutSummary,
  type RangeStat,
  type SimulationRunMetrics,
  type StructuredChangeRequest,
  type SuccessCriteriaSpec,
} from './types';

/**
 * Construct the "Before" configuration: the engineer's current line settings
 * subjected to the NEW production requirements (so we never compare an easy old
 * workload against a harder new workload).
 */
export function applyRequirementsToBaseline(
  initialConfig: PickPlaceConfig,
  request: StructuredChangeRequest,
): PickPlaceConfig {
  const next: PickPlaceConfig = {
    ...initialConfig,
    ...request.changedRequirements,
    seed: request.evaluationSpec.selectionSeed,
  };
  if (request.fixedConstraints.requireOrientationAlignment !== undefined) {
    next.alignProducts = request.fixedConstraints.requireOrientationAlignment;
  }
  if (request.fixedConstraints.fixedPlaceMode !== undefined) {
    next.placeMode = request.fixedConstraints.fixedPlaceMode;
  }
  if (request.fixedConstraints.fixedTrayFlow !== undefined) {
    next.trayFlow = request.fixedConstraints.fixedTrayFlow;
  }
  if (request.fixedConstraints.fixedTraySync !== undefined) {
    next.traySync = request.fixedConstraints.fixedTraySync;
  }
  return next;
}

/**
 * Validate a candidate configuration proposed by the model or user against:
 * 1. Physical simulator bounds (conveyorSpeed, traySpeed, valid enums)
 * 2. Immutable production requirements (cannot lower spawnRate, change mix, or disable alignment)
 * 3. Fixed constraints and editable parameter whitelist
 */
export function validateCandidateConfig(
  candidate: Partial<PickPlaceConfig>,
  baselineUnderNewReqs: PickPlaceConfig,
  request: StructuredChangeRequest,
): { merged: PickPlaceConfig; validation: CandidateValidation } {
  const violations: string[] = [];
  const editable = new Set<EditableParam>(request.editableParameters);

  // Check if candidate attempts to alter non-editable workload parameters
  if (
    candidate.spawnRate !== undefined &&
    Math.abs(candidate.spawnRate - baselineUnderNewReqs.spawnRate) > 1e-6
  ) {
    violations.push(
      `Cannot alter required arrival rate (${baselineUnderNewReqs.spawnRate} items/s is fixed by the production order; proposed ${candidate.spawnRate} items/s).`,
    );
  }
  if (candidate.mix !== undefined && candidate.mix !== baselineUnderNewReqs.mix) {
    violations.push(
      `Cannot alter required product mix ('${baselineUnderNewReqs.mix}' is fixed by the production order; proposed '${candidate.mix}').`,
    );
  }
  if (
    candidate.alignProducts !== undefined &&
    candidate.alignProducts !== baselineUnderNewReqs.alignProducts
  ) {
    violations.push(
      `Cannot disable product orientation alignment (alignProducts=${baselineUnderNewReqs.alignProducts} is a fixed constraint).`,
    );
  }

  // Check editable parameter permissions
  const checkPermission = (param: EditableParam, proposedVal: unknown, baseVal: unknown) => {
    if (proposedVal !== undefined && proposedVal !== baseVal && !editable.has(param)) {
      violations.push(
        `Parameter '${param}' is locked by fixed constraints (must remain ${String(baseVal)}, proposed ${String(proposedVal)}).`,
      );
    }
  };

  checkPermission('strategy', candidate.strategy, baselineUnderNewReqs.strategy);
  checkPermission('conveyorSpeed', candidate.conveyorSpeed, baselineUnderNewReqs.conveyorSpeed);
  checkPermission('placeMode', candidate.placeMode, baselineUnderNewReqs.placeMode);
  checkPermission('trayFlow', candidate.trayFlow, baselineUnderNewReqs.trayFlow);
  checkPermission('traySpeed', candidate.traySpeed, baselineUnderNewReqs.traySpeed);
  checkPermission('traySync', candidate.traySync, baselineUnderNewReqs.traySync);

  // Check physical & enum bounds
  if (candidate.conveyorSpeed !== undefined) {
    const v = Number(candidate.conveyorSpeed);
    const maxV = request.fixedConstraints.maxConveyorSpeed ?? PARAM_BOUNDS.conveyorSpeed.max;
    const minV = request.fixedConstraints.minConveyorSpeed ?? PARAM_BOUNDS.conveyorSpeed.min;
    if (!Number.isFinite(v) || v < PARAM_BOUNDS.conveyorSpeed.min || v > PARAM_BOUNDS.conveyorSpeed.max) {
      violations.push(
        `conveyorSpeed (${String(candidate.conveyorSpeed)} m/s) is outside physical bounds [${PARAM_BOUNDS.conveyorSpeed.min}, ${PARAM_BOUNDS.conveyorSpeed.max}] m/s.`,
      );
    } else if (v > maxV + 1e-6 || v < minV - 1e-6) {
      violations.push(
        `conveyorSpeed (${v.toFixed(2)} m/s) violates line constraint [${minV.toFixed(2)}, ${maxV.toFixed(2)}] m/s.`,
      );
    }
  }

  if (candidate.traySpeed !== undefined) {
    const tv = Number(candidate.traySpeed);
    if (!Number.isFinite(tv) || tv < PARAM_BOUNDS.traySpeed.min || tv > PARAM_BOUNDS.traySpeed.max) {
      violations.push(
        `traySpeed (${String(candidate.traySpeed)} m/s) is outside physical bounds [${PARAM_BOUNDS.traySpeed.min}, ${PARAM_BOUNDS.traySpeed.max}] m/s.`,
      );
    }
  }

  if (
    candidate.strategy !== undefined &&
    !PARAM_BOUNDS.strategies.includes(candidate.strategy)
  ) {
    violations.push(`Invalid scheduling strategy '${String(candidate.strategy)}'.`);
  }

  if (
    candidate.placeMode !== undefined &&
    !PARAM_BOUNDS.placeModes.includes(candidate.placeMode)
  ) {
    violations.push(`Invalid placeMode '${String(candidate.placeMode)}'.`);
  }

  if (
    candidate.trayFlow !== undefined &&
    !PARAM_BOUNDS.trayFlows.includes(candidate.trayFlow)
  ) {
    violations.push(`Invalid trayFlow '${String(candidate.trayFlow)}'.`);
  }

  const merged: PickPlaceConfig = {
    ...baselineUnderNewReqs,
    ...(editable.has('strategy') && candidate.strategy !== undefined ? { strategy: candidate.strategy } : {}),
    ...(editable.has('conveyorSpeed') && candidate.conveyorSpeed !== undefined
      ? { conveyorSpeed: Number(Number(candidate.conveyorSpeed).toFixed(2)) }
      : {}),
    ...(editable.has('placeMode') && candidate.placeMode !== undefined
      ? { placeMode: candidate.placeMode }
      : {}),
    ...(editable.has('trayFlow') && candidate.trayFlow !== undefined
      ? { trayFlow: candidate.trayFlow }
      : {}),
    ...(editable.has('traySpeed') && candidate.traySpeed !== undefined
      ? { traySpeed: Number(Number(candidate.traySpeed).toFixed(2)) }
      : {}),
    ...(editable.has('traySync') && candidate.traySync !== undefined
      ? { traySync: Boolean(candidate.traySync) }
      : {}),
    // Always preserve required workload parameters
    spawnRate: baselineUnderNewReqs.spawnRate,
    mix: baselineUnderNewReqs.mix,
    alignProducts: baselineUnderNewReqs.alignProducts,
    seed: baselineUnderNewReqs.seed,
  };

  return {
    merged,
    validation: {
      valid: violations.length === 0,
      violations,
    },
  };
}

/**
 * Run a deterministic headless simulation on a pre-generated arrival schedule
 * and record complete workload accounting and kinematic checks.
 */
export function evaluateConfigurationOnSchedule(
  config: PickPlaceConfig,
  schedule: readonly ScheduledArrival[],
  arrivalWindowSeconds: number,
  drainSeconds: number,
): SimulationRunMetrics {
  const totalSeconds = arrivalWindowSeconds + drainSeconds;
  const scenario = new PickPlaceScenario(config, {
    arrivalSchedule: schedule,
    prefillSeconds: 0,
  });

  const steps = Math.round(totalSeconds / SIM_DT);
  let peakTorqueNm = 0;
  let workspaceViolations = 0;

  for (let i = 0; i < steps; i++) {
    scenario.step(SIM_DT);
    for (const tau of scenario.robot.torque) {
      const absTau = Math.abs(tau);
      if (absTau > peakTorqueNm) peakTorqueNm = absTau;
    }
    const ik = inverseKinematics(scenario.params, scenario.robot.flange, -1e-4);
    if (!ik.ok) workspaceViolations++;
  }

  const d = scenario.detailedCounters();
  const stats = scenario.robot.stats;
  const avgCycleSeconds = stats.cycleTimes.length
    ? stats.cycleTimes.reduce((a, b) => a + b, 0) / stats.cycleTimes.length
    : 0;
  const utilisationPct = (100 * stats.busyTime) / Math.max(stats.totalTime, 1e-9);
  const offered = Math.max(d.offered, schedule.length);
  // Completion rate strictly divides placed by total offered (unprocessed items never count as placed)
  const completionRatePct = offered > 0 ? (100 * d.placed) / offered : 100;
  const missRatePct = offered > 0 ? (100 * d.missed) / offered : 0;
  const throughputPpm = (d.placed / Math.max(arrivalWindowSeconds, 1)) * 60;

  return {
    offered,
    placed: d.placed,
    missed: d.missed,
    queued: d.queued,
    onBelt: d.onBelt,
    carried: d.carried,
    unfinished: d.unfinished,
    completionRatePct: Number(completionRatePct.toFixed(1)),
    missRatePct: Number(missRatePct.toFixed(1)),
    throughputPpm: Number(throughputPpm.toFixed(1)),
    avgCycleSeconds: Number(avgCycleSeconds.toFixed(2)),
    utilisationPct: Number(utilisationPct.toFixed(1)),
    traysFilled: d.traysDone,
    traysIncomplete: d.traysIncomplete,
    entryBlockedEvents: d.entryBlockedEvents,
    peakTorqueNm: Number(peakTorqueNm.toFixed(2)),
    workspaceViolations,
    simulatedDurationSeconds: totalSeconds,
  };
}

export function checkSuccessCriteria(
  metrics: SimulationRunMetrics,
  criteria: SuccessCriteriaSpec,
): { passes: boolean; failures: string[] } {
  const failures: string[] = [];

  if (metrics.completionRatePct < criteria.minCompletionRatePct - 1e-6) {
    failures.push(
      `Completion rate ${metrics.completionRatePct.toFixed(1)}% is below required ${criteria.minCompletionRatePct.toFixed(1)}% (${metrics.placed}/${metrics.offered} placed, ${metrics.missed} missed, ${metrics.unfinished} unfinished).`,
    );
  }
  if (metrics.missed > criteria.maxMissedItems) {
    failures.push(
      `Missed ${metrics.missed} items, exceeding max allowed ${criteria.maxMissedItems}.`,
    );
  }
  if (
    criteria.minThroughputPpm !== undefined &&
    metrics.throughputPpm < criteria.minThroughputPpm - 1e-6
  ) {
    failures.push(
      `Throughput ${metrics.throughputPpm.toFixed(1)} picks/min is below required ${criteria.minThroughputPpm.toFixed(1)} picks/min.`,
    );
  }
  if (
    criteria.minFullTrays !== undefined &&
    metrics.traysFilled < criteria.minFullTrays
  ) {
    failures.push(
      `Only ${metrics.traysFilled} full trays completed, below required ${criteria.minFullTrays} full trays.`,
    );
  }
  if (
    criteria.maxIncompleteTrays !== undefined &&
    metrics.traysIncomplete > criteria.maxIncompleteTrays
  ) {
    failures.push(
      `${metrics.traysIncomplete} incomplete trays dispatched, exceeding max allowed ${criteria.maxIncompleteTrays}.`,
    );
  }
  if (metrics.workspaceViolations > 0) {
    failures.push(
      `Robot encountered ${metrics.workspaceViolations} kinematic workspace violations.`,
    );
  }

  return {
    passes: failures.length === 0,
    failures,
  };
}

/** Score a candidate run for ranking when comparing multiple runs. */
export function scoreCandidateRun(run: CandidateRunRecord): number {
  if (!run.validation.valid || !run.metrics) return -1e9;
  const m = run.metrics;
  const passBonus = run.meetsSuccessCriteria ? 1000 : 0;
  return (
    passBonus +
    m.completionRatePct * 4 -
    m.missed * 6 -
    m.unfinished * 4 +
    m.traysFilled * 3 -
    m.traysIncomplete * 1.5
  );
}

function summarizeRange(values: number[]): RangeStat {
  if (values.length === 0) return { mean: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean: Number(mean.toFixed(1)),
    min: Number(Math.min(...values).toFixed(1)),
    max: Number(Math.max(...values).toFixed(1)),
  };
}

function aggregateRuns(metricsList: SimulationRunMetrics[]): HeldOutAggregate {
  return {
    completionRatePct: summarizeRange(metricsList.map((m) => m.completionRatePct)),
    throughputPpm: summarizeRange(metricsList.map((m) => m.throughputPpm)),
    missed: summarizeRange(metricsList.map((m) => m.missed)),
    unfinished: summarizeRange(metricsList.map((m) => m.unfinished)),
    traysFilled: summarizeRange(metricsList.map((m) => m.traysFilled)),
  };
}

/**
 * Evaluate Baseline and Finalist across held-out seeds that were not used during candidate selection.
 * Each seed generates an identical pre-generated arrival schedule for both configs.
 */
export function evaluateHeldOutSummary(
  baselineConfig: PickPlaceConfig,
  finalistConfig: PickPlaceConfig,
  request: StructuredChangeRequest,
): HeldOutSummary {
  const { heldOutSeeds, arrivalWindowSeconds, drainSeconds } = request.evaluationSpec;
  const baseMetrics: SimulationRunMetrics[] = [];
  const finalistMetrics: SimulationRunMetrics[] = [];

  for (const seed of heldOutSeeds) {
    const schedule = generateArrivalSchedule(
      seed,
      baselineConfig.spawnRate,
      baselineConfig.mix,
      arrivalWindowSeconds,
    );
    baseMetrics.push(
      evaluateConfigurationOnSchedule(
        { ...baselineConfig, seed },
        schedule,
        arrivalWindowSeconds,
        drainSeconds,
      ),
    );
    finalistMetrics.push(
      evaluateConfigurationOnSchedule(
        { ...finalistConfig, seed },
        schedule,
        arrivalWindowSeconds,
        drainSeconds,
      ),
    );
  }

  const baseline = aggregateRuns(baseMetrics);
  const finalist = aggregateRuns(finalistMetrics);
  const improvesOverBaseline =
    finalist.completionRatePct.mean > baseline.completionRatePct.mean + 0.5 ||
    (Math.abs(finalist.completionRatePct.mean - baseline.completionRatePct.mean) <= 0.5 &&
      (finalist.missed.mean < baseline.missed.mean ||
        finalist.traysFilled.mean > baseline.traysFilled.mean));

  return {
    seeds: [...heldOutSeeds],
    sampleCount: heldOutSeeds.length,
    baseline,
    finalist,
    improvesOverBaseline,
  };
}

const PARAM_LABELS: Record<keyof PickPlaceConfig, { label: string; unit?: string }> = {
  seed: { label: 'Random seed' },
  strategy: { label: 'Scheduling strategy' },
  conveyorSpeed: { label: 'Conveyor speed', unit: 'm/s' },
  spawnRate: { label: 'Product arrival rate', unit: '/s' },
  placeMode: { label: 'Place mode' },
  trayFlow: { label: 'Tray belt flow' },
  traySpeed: { label: 'Tray belt speed', unit: 'm/s' },
  traySync: { label: 'Auto-sync tray belt' },
  mix: { label: 'Product mix' },
  alignProducts: { label: 'Align orientation' },
};

/** Compute exact parameter differences between two configurations. */
export function computeConfigDiff(
  before: PickPlaceConfig,
  after: PickPlaceConfig,
  includeWorkloadChanges = false,
): ConfigDiffEntry[] {
  const keys: (keyof PickPlaceConfig)[] = [
    'strategy',
    'conveyorSpeed',
    'placeMode',
    'trayFlow',
    'traySync',
    'traySpeed',
    ...(includeWorkloadChanges
      ? (['spawnRate', 'mix', 'alignProducts'] as (keyof PickPlaceConfig)[])
      : []),
  ];

  const diffs: ConfigDiffEntry[] = [];
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (b !== a) {
      diffs.push({
        parameter: key,
        label: PARAM_LABELS[key].label,
        before: b,
        after: a,
        unit: PARAM_LABELS[key].unit,
      });
    }
  }
  return diffs;
}
