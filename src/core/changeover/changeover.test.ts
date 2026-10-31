import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PICK_PLACE,
  generateArrivalSchedule,
  PickPlaceScenario,
  type ScheduledArrival,
} from '../scenarios/pickPlace/pickPlace';
import {
  applyRequirementsToBaseline,
  evaluateConfigurationOnSchedule,
  validateCandidateConfig,
} from './evaluator';
import { CHANGEOVER_PRESETS, INITIAL_LINE_CONFIG, interpretNaturalLanguageRequest } from './presets';
import { ChangeoverToolExecutor, runRecordedReplaySession } from './sessionRunner';

describe('SHIFT changeover core verification & fairness invariants', () => {
  it('guarantees identical offered workload across configurations and exact item accounting (offered = placed + missed + unfinished)', () => {
    const schedule = generateArrivalSchedule(42, 1.4, 'mixed', 20);
    expect(schedule.length).toBeGreaterThan(20);

    const fastBeltConfig = {
      ...DEFAULT_PICK_PLACE,
      conveyorSpeed: 0.48,
      spawnRate: 1.4,
      mix: 'mixed' as const,
      strategy: 'nearest' as const,
    };
    const slowBeltConfig = {
      ...DEFAULT_PICK_PLACE,
      conveyorSpeed: 0.22,
      spawnRate: 1.4,
      mix: 'mixed' as const,
      strategy: 'edf' as const,
    };

    const mFast = evaluateConfigurationOnSchedule(fastBeltConfig, schedule, 20, 10);
    const mSlow = evaluateConfigurationOnSchedule(slowBeltConfig, schedule, 20, 10);

    // Both runs face the exact same offered item count
    expect(mFast.offered).toBe(schedule.length);
    expect(mSlow.offered).toBe(schedule.length);

    // Conservation of products: offered === placed + missed + unfinished
    expect(mFast.placed + mFast.missed + mFast.unfinished).toBe(mFast.offered);
    expect(mSlow.placed + mSlow.missed + mSlow.unfinished).toBe(mSlow.offered);

    // Unfinished work is never counted as placed
    expect(mFast.completionRatePct).toBeCloseTo((mFast.placed / mFast.offered) * 100, 1);
    expect(mSlow.completionRatePct).toBeCloseTo((mSlow.placed / mSlow.offered) * 100, 1);
  });

  it('queues blocked belt entry arrivals in FIFO order instead of silently dropping demand', () => {
    const tightSchedule: ScheduledArrival[] = [
      { id: 1, time: 0.01, y: 0, kind: 'box', yaw: 0, color: 0xef4444 },
      { id: 2, time: 0.02, y: 0, kind: 'box', yaw: 0, color: 0x3b82f6 },
      { id: 3, time: 0.03, y: 0, kind: 'box', yaw: 0, color: 0x10b981 },
    ];
    const scenario = new PickPlaceScenario(
      { ...DEFAULT_PICK_PLACE, conveyorSpeed: 0.2 },
      { arrivalSchedule: tightSchedule },
    );

    // Step 0.1s: first item enters belt, remaining two are held in FIFO entry queue
    for (let i = 0; i < 6; i++) scenario.step(1 / 60);
    const earlyCounts = scenario.detailedCounters();
    expect(earlyCounts.offered).toBe(3);
    expect(earlyCounts.onBelt + earlyCounts.queued).toBe(3);
    expect(earlyCounts.queued).toBeGreaterThanOrEqual(1);

    // Step another 4 seconds: all 3 items have cleared the entry spacing and entered the belt
    for (let i = 0; i < 240; i++) scenario.step(1 / 60);
    const laterCounts = scenario.detailedCounters();
    expect(laterCounts.queued).toBe(0);
    expect(laterCounts.placed + laterCounts.missed + laterCounts.onBelt + laterCounts.carried).toBe(3);
  });

  it('produces deterministic replay results across repeated runs', () => {
    const presetA = CHANGEOVER_PRESETS[0]!;
    const req = structuredClone(presetA.structuredRequest);
    req.evaluationSpec.arrivalWindowSeconds = 12;
    req.evaluationSpec.drainSeconds = 6;
    req.evaluationSpec.heldOutSeeds = [101];

    const run1 = runRecordedReplaySession(presetA.baselineLineConfig, structuredClone(req));
    const run2 = runRecordedReplaySession(presetA.baselineLineConfig, structuredClone(req));

    expect(run1.mode).toBe('replay');
    expect(run1.status).toBe('recommended');
    expect(run1.recommendedRunId).toBe(run2.recommendedRunId);
    expect(run1.baselineRun.metrics).toEqual(run2.baselineRun.metrics);
    expect(run1.candidateRuns.map((c) => c.metrics)).toEqual(
      run2.candidateRuns.map((c) => c.metrics),
    );
    expect(run1.heldOutEvaluation).toEqual(run2.heldOutEvaluation);
  });

  it('rejects invalid or out-of-range tool arguments and attempts to cheat workload or constraints without fabricating metrics', () => {
    const presetA = CHANGEOVER_PRESETS[0]!;
    const req = structuredClone(presetA.structuredRequest);
    req.evaluationSpec.arrivalWindowSeconds = 10;
    req.evaluationSpec.drainSeconds = 6;

    const exec = new ChangeoverToolExecutor(presetA.baselineLineConfig, req);

    // 1. Out-of-bounds conveyor speed (> 0.50 m/s limit in Preset A)
    const overSpeed = exec.simulateCandidate({
      label: 'Illegal Fast Belt',
      config: { conveyorSpeed: 0.58 },
    });
    expect(overSpeed.ok).toBe(false);
    expect(overSpeed.valid).toBe(false);
    expect(exec.candidateRuns[0]?.metrics).toBeNull();

    // 2. Attempt to reduce required spawnRate below 1.38 items/s
    const cheatDemand = exec.simulateCandidate({
      label: 'Lower Demand Cheat',
      config: { spawnRate: 0.7 },
    });
    expect(cheatDemand.ok).toBe(false);
    expect(cheatDemand.violations?.some((v) => v.includes('arrival rate'))).toBe(true);

    // 3. Attempt to disable required orientation alignment
    const cheatAlign = exec.simulateCandidate({
      label: 'Disable Alignment Cheat',
      config: { alignProducts: false },
    });
    expect(cheatAlign.ok).toBe(false);
    expect(cheatAlign.violations?.some((v) => v.includes('alignProducts'))).toBe(true);

    // 4. Attempt to modify locked traySync in Preset C
    const presetC = CHANGEOVER_PRESETS[2]!;
    const baseC = applyRequirementsToBaseline(presetC.baselineLineConfig, presetC.structuredRequest);
    const lockedSyncCheck = validateCandidateConfig(
      { traySync: true },
      baseC,
      presetC.structuredRequest,
    );
    expect(lockedSyncCheck.validation.valid).toBe(false);
    expect(lockedSyncCheck.validation.violations[0]).toContain('traySync');
  });

  it('honestly rejects an infeasible overload request (2.50 items/s on a single delta picker)', () => {
    const presetD = CHANGEOVER_PRESETS[3]!;
    const req = structuredClone(presetD.structuredRequest);
    req.evaluationSpec.arrivalWindowSeconds = 14;
    req.evaluationSpec.drainSeconds = 8;
    req.evaluationSpec.heldOutSeeds = [101];

    const result = runRecordedReplaySession(presetD.baselineLineConfig, req);

    expect(result.status).toBe('rejected_infeasible');
    expect(result.recommendedRunId).toBeNull();
    expect(result.recommendedConfig).toBeNull();
    expect(result.candidateRuns.every((c) => !c.meetsSuccessCriteria)).toBe(true);
    expect(result.failureAnalysis).toContain('2.50 items/s');
  });

  it('parses natural-language changeover requests and falls back cleanly without API credentials', () => {
    const parsed = interpretNaturalLanguageRequest(
      'Increase output to 1.5 items/s with mixed products and co-flow trays',
      INITIAL_LINE_CONFIG,
    );
    expect(parsed.changedRequirements.spawnRate).toBe(1.5);
    expect(parsed.changedRequirements.mix).toBe('mixed');
    expect(parsed.fixedConstraints.fixedTrayFlow).toBe('co');
    expect(parsed.fixedConstraints.keepRobotLimitsFixed).toBe(true);
  });
});
