import {
  generateArrivalSchedule,
  LAYOUT,
  type PickPlaceConfig,
  type ScheduledArrival,
} from '../scenarios/pickPlace/pickPlace';
import {
  applyRequirementsToBaseline,
  checkSuccessCriteria,
  computeConfigDiff,
  evaluateConfigurationOnSchedule,
  evaluateHeldOutSummary,
  scoreCandidateRun,
  validateCandidateConfig,
} from './evaluator';
import {
  PARAM_BOUNDS,
  type AgentToolActivity,
  type AgentToolName,
  type CandidateRunRecord,
  type ChangeoverSessionResult,
  type HeldOutSummary,
  type StructuredChangeRequest,
} from './types';

export interface ToolExecutorCallbacks {
  onActivity?: (activity: AgentToolActivity) => void;
  onCandidateRun?: (run: CandidateRunRecord) => void;
}

/**
 * Stateful tool execution harness for a single changeover investigation.
 * Used identically by the live Gemini tool loop on the Node server and by
 * deterministic replay / unit verification tests.
 */
export class ChangeoverToolExecutor {
  readonly baselineUnderNewReqs: PickPlaceConfig;
  readonly selectionSchedule: ScheduledArrival[];
  readonly baselineRun: CandidateRunRecord;
  readonly candidateRuns: CandidateRunRecord[] = [];
  readonly activities: AgentToolActivity[] = [];

  private nextActivityIdx = 1;
  private recommendedRunId: string | null = null;
  private agentExplanation = '';
  private failureAnalysis: string | undefined;
  private heldOutEvaluation: HeldOutSummary | null = null;
  private status: 'recommended' | 'rejected_infeasible' | 'error' = 'rejected_infeasible';

  constructor(
    public readonly initialConfig: PickPlaceConfig,
    public readonly request: StructuredChangeRequest,
    private readonly callbacks?: ToolExecutorCallbacks,
  ) {
    this.baselineUnderNewReqs = applyRequirementsToBaseline(initialConfig, request);
    this.selectionSchedule = generateArrivalSchedule(
      request.evaluationSpec.selectionSeed,
      this.baselineUnderNewReqs.spawnRate,
      this.baselineUnderNewReqs.mix,
      request.evaluationSpec.arrivalWindowSeconds,
    );

    const baseMetrics = evaluateConfigurationOnSchedule(
      this.baselineUnderNewReqs,
      this.selectionSchedule,
      request.evaluationSpec.arrivalWindowSeconds,
      request.evaluationSpec.drainSeconds,
    );
    const baseCheck = checkSuccessCriteria(baseMetrics, request.successCriteria);

    this.baselineRun = {
      runId: 'baseline',
      label: 'Baseline (Current Config under New Requirements)',
      isBaseline: true,
      config: this.baselineUnderNewReqs,
      rationale: 'Benchmark current line parameters against the new production requirements.',
      validation: { valid: true, violations: [] },
      metrics: baseMetrics,
      meetsSuccessCriteria: baseCheck.passes,
      criteriaFailures: baseCheck.failures,
    };
  }

  private pushActivity(
    tool: AgentToolName,
    statusLabel: string,
    detail: string,
    tone: AgentToolActivity['tone'] = 'neutral',
  ) {
    const act: AgentToolActivity = {
      id: `act-${this.nextActivityIdx++}`,
      timestamp: Date.now(),
      tool,
      statusLabel,
      detail,
      tone,
    };
    this.activities.push(act);
    this.callbacks?.onActivity?.(act);
  }

  /** Tool 1: inspect_line() */
  inspectLine() {
    this.pushActivity(
      'inspect_line',
      'Reading constraints',
      `Inspected line state, baseline metrics (${this.baselineRun.metrics?.completionRatePct}% completion, ${this.baselineRun.metrics?.missed} missed), and editable bounds.`,
      'neutral',
    );
    return {
      initialLineConfig: this.initialConfig,
      baselineUnderNewRequirements: this.baselineUnderNewReqs,
      baselineMetricsUnderNewRequirements: this.baselineRun.metrics,
      baselineMeetsCriteria: this.baselineRun.meetsSuccessCriteria,
      baselineCriteriaFailures: this.baselineRun.criteriaFailures,
      editableParameters: this.request.editableParameters,
      fixedConstraints: this.request.fixedConstraints,
      successCriteria: this.request.successCriteria,
      parameterBounds: PARAM_BOUNDS,
      linePhysicsHint: {
        traySlotsPerTray: LAYOUT.tray.slots ** 2,
        trayPitchMetres: LAYOUT.tray.pitch,
        idealSyncedTraySpeedFormula: '(spawnRate * 0.42 * 1.05) / 4',
        idealTraySpeedForCurrentRate: Number(
          ((this.baselineUnderNewReqs.spawnRate * LAYOUT.tray.pitch * 1.05) / (LAYOUT.tray.slots ** 2)).toFixed(3),
        ),
        singleRobotTheoreticalCeilingPpm: 88,
      },
      searchBudgetRemaining:
        this.request.evaluationSpec.maxCandidates - this.candidateRuns.length,
    };
  }

  /** Tool 2: validate_change(request) */
  validateChange(args: {
    summary?: string;
    editableParameters?: string[];
    minCompletionRatePct?: number;
    maxMissedItems?: number;
  }) {
    if (args.summary && args.summary.trim().length > 0) {
      this.request.summary = args.summary.trim();
    }
    this.pushActivity(
      'validate_change',
      'Validating change request',
      `Confirmed workload (${this.baselineUnderNewReqs.spawnRate} items/s, ${this.baselineUnderNewReqs.mix}) and editable controls [${this.request.editableParameters.join(', ')}].`,
      'neutral',
    );
    return {
      ok: true,
      validatedRequest: {
        summary: this.request.summary,
        changedRequirements: this.request.changedRequirements,
        fixedConstraints: this.request.fixedConstraints,
        editableParameters: this.request.editableParameters,
        successCriteria: this.request.successCriteria,
      },
    };
  }

  /** Tool 3: simulate_candidate(config, evaluationSpec) */
  simulateCandidate(args: {
    config: Partial<PickPlaceConfig>;
    rationale?: string;
    label?: string;
  }) {
    const idx = this.candidateRuns.length + 1;
    const maxCands = this.request.evaluationSpec.maxCandidates;
    if (idx > maxCands) {
      this.pushActivity(
        'simulate_candidate',
        `Rejected: search budget (${maxCands}) exhausted`,
        'Cannot run additional candidate simulations beyond the bounded search budget.',
        'warn',
      );
      return {
        ok: false,
        error: `Search budget of ${maxCands} candidate simulations reached. Call compare_candidates or propose_configuration.`,
      };
    }

    const runId = `cand-${idx}`;
    const label = args.label?.trim() || `Candidate ${idx}`;
    const rationale = args.rationale?.trim() || 'Candidate configuration test';

    const { merged, validation } = validateCandidateConfig(
      args.config,
      this.baselineUnderNewReqs,
      this.request,
    );

    if (!validation.valid) {
      const reason = validation.violations[0] ?? 'Constraint violation';
      const rejectedRecord: CandidateRunRecord = {
        runId,
        label,
        isBaseline: false,
        config: merged,
        rationale,
        validation,
        metrics: null,
        meetsSuccessCriteria: false,
        criteriaFailures: validation.violations,
      };
      this.candidateRuns.push(rejectedRecord);
      this.callbacks?.onCandidateRun?.(rejectedRecord);
      this.pushActivity(
        'simulate_candidate',
        `Rejected: ${reason.slice(0, 68)}`,
        `${label} violated line constraints: ${validation.violations.join(' ')}`,
        'bad',
      );
      return {
        ok: false,
        runId,
        valid: false,
        violations: validation.violations,
      };
    }

    this.pushActivity(
      'simulate_candidate',
      `Testing candidate ${idx} of ${maxCands}`,
      `${label}: strategy=${merged.strategy}, conv=${merged.conveyorSpeed} m/s, mode=${merged.placeMode}, flow=${merged.trayFlow}, sync=${merged.traySync}, traySpeed=${merged.traySpeed} m/s`,
      'neutral',
    );

    const metrics = evaluateConfigurationOnSchedule(
      merged,
      this.selectionSchedule,
      this.request.evaluationSpec.arrivalWindowSeconds,
      this.request.evaluationSpec.drainSeconds,
    );
    const check = checkSuccessCriteria(metrics, this.request.successCriteria);

    const record: CandidateRunRecord = {
      runId,
      label,
      isBaseline: false,
      config: merged,
      rationale,
      validation,
      metrics,
      meetsSuccessCriteria: check.passes,
      criteriaFailures: check.failures,
    };
    this.candidateRuns.push(record);
    this.callbacks?.onCandidateRun?.(record);

    if (!check.passes) {
      this.pushActivity(
        'simulate_candidate',
        `Candidate ${idx}: ${metrics.completionRatePct}% completion (${metrics.missed} missed)`,
        check.failures[0] ?? 'Did not meet target criteria.',
        'warn',
      );
    } else {
      this.pushActivity(
        'simulate_candidate',
        `Candidate ${idx} passed: ${metrics.completionRatePct}% completion (${metrics.missed} missed)`,
        `Placed ${metrics.placed}/${metrics.offered} items (${metrics.throughputPpm} picks/min, ${metrics.traysFilled} full trays).`,
        'good',
      );
    }

    return {
      ok: true,
      runId,
      valid: true,
      appliedConfig: merged,
      metrics,
      meetsSuccessCriteria: check.passes,
      criteriaFailures: check.failures,
    };
  }

  /** Tool 4: compare_candidates(runIds) */
  compareCandidates(args: { runIds?: string[] }) {
    const allRuns = [this.baselineRun, ...this.candidateRuns];
    const requested =
      args.runIds && args.runIds.length > 0
        ? allRuns.filter((r) => args.runIds!.includes(r.runId) || r.isBaseline)
        : allRuns;

    const validRuns = requested.filter((r) => r.validation.valid && r.metrics !== null);
    const ranked = [...validRuns].sort((a, b) => scoreCandidateRun(b) - scoreCandidateRun(a));
    const best = ranked[0] ?? null;

    this.pushActivity(
      'compare_candidates',
      `Comparing ${requested.length} simulated runs`,
      best
        ? `Top run is ${best.runId} (${best.metrics?.completionRatePct}% completion, ${best.metrics?.missed} missed vs baseline ${this.baselineRun.metrics?.completionRatePct}%).`
        : 'No valid runs to compare.',
      'neutral',
    );

    return {
      baseline: {
        runId: this.baselineRun.runId,
        metrics: this.baselineRun.metrics,
        meetsSuccessCriteria: this.baselineRun.meetsSuccessCriteria,
      },
      rankedCandidates: ranked.map((r) => ({
        runId: r.runId,
        label: r.label,
        isBaseline: r.isBaseline,
        meetsSuccessCriteria: r.meetsSuccessCriteria,
        metrics: r.metrics,
        deltaCompletionPct: Number(
          ((r.metrics?.completionRatePct ?? 0) - (this.baselineRun.metrics?.completionRatePct ?? 0)).toFixed(1),
        ),
        deltaMissed: (r.metrics?.missed ?? 0) - (this.baselineRun.metrics?.missed ?? 0),
        configDiffFromBaseline: computeConfigDiff(this.baselineUnderNewReqs, r.config),
      })),
    };
  }

  /** Tool 5: propose_configuration(candidateId) */
  proposeConfiguration(args: { candidateId: string; explanation: string }) {
    const target = this.candidateRuns.find((r) => r.runId === args.candidateId);
    if (!target || !target.validation.valid || !target.metrics) {
      return {
        ok: false,
        error: `Candidate '${args.candidateId}' is not a valid simulated run.`,
      };
    }

    // Run held-out evaluation on seeds not used during selection
    this.pushActivity(
      'propose_configuration',
      'Evaluating finalist on held-out arrivals',
      `Testing ${target.runId} across ${this.request.evaluationSpec.heldOutSeeds.length} held-out arrival schedules (seeds ${this.request.evaluationSpec.heldOutSeeds.join(', ')}).`,
      'good',
    );

    this.heldOutEvaluation = evaluateHeldOutSummary(
      this.baselineUnderNewReqs,
      target.config,
      this.request,
    );

    if (!target.meetsSuccessCriteria || !this.heldOutEvaluation.improvesOverBaseline) {
      this.status = 'rejected_infeasible';
      this.recommendedRunId = null;
      this.agentExplanation = args.explanation;
      return {
        ok: false,
        status: 'rejected_infeasible',
        reason: !target.meetsSuccessCriteria
          ? `Candidate ${target.runId} did not satisfy success criteria: ${target.criteriaFailures.join(' ')}`
          : 'Candidate did not improve over baseline on held-out arrival schedules.',
        heldOutEvaluation: this.heldOutEvaluation,
      };
    }

    this.recommendedRunId = target.runId;
    this.agentExplanation = args.explanation;
    this.status = 'recommended';

    return {
      ok: true,
      status: 'recommended',
      recommendedRunId: target.runId,
      configDiff: computeConfigDiff(this.baselineUnderNewReqs, target.config),
      heldOutEvaluation: this.heldOutEvaluation,
    };
  }

  /** Tool 6: explain_failure(runId) */
  explainFailure(args: { runId: string; analysis: string }) {
    const run =
      args.runId === 'baseline'
        ? this.baselineRun
        : this.candidateRuns.find((r) => r.runId === args.runId);

    this.failureAnalysis = args.analysis;
    this.pushActivity(
      'explain_failure',
      `Diagnosed bottleneck on ${args.runId}`,
      args.analysis,
      'warn',
    );

    return {
      ok: true,
      runId: args.runId,
      recordedMetrics: run?.metrics ?? null,
      criteriaFailures: run?.criteriaFailures ?? [],
      analysisRecorded: true,
    };
  }

  /** Finalize the session result into a serializable ChangeoverSessionResult. */
  buildResult(
    mode: ChangeoverSessionResult['mode'],
    modelId: string,
    fallbackExplanation?: string,
  ): ChangeoverSessionResult {
    // If the model didn't explicitly call propose_configuration, check if any candidate passed
    if (!this.recommendedRunId) {
      const passing = this.candidateRuns
        .filter((r) => r.validation.valid && r.meetsSuccessCriteria && r.metrics)
        .sort((a, b) => scoreCandidateRun(b) - scoreCandidateRun(a));

      if (passing.length > 0) {
        const best = passing[0]!;
        this.proposeConfiguration({
          candidateId: best.runId,
          explanation:
            fallbackExplanation ||
            `Recommended ${best.label} (${best.runId}), improving completion from ${this.baselineRun.metrics?.completionRatePct}% to ${best.metrics?.completionRatePct}% under the new workload.`,
        });
      } else {
        // Still compute held-out on the best valid candidate so the engineer sees held-out variability even on infeasible requests
        const bestAttempt = [...this.candidateRuns]
          .filter((r) => r.validation.valid && r.metrics)
          .sort((a, b) => scoreCandidateRun(b) - scoreCandidateRun(a))[0];
        if (bestAttempt && !this.heldOutEvaluation) {
          this.heldOutEvaluation = evaluateHeldOutSummary(
            this.baselineUnderNewReqs,
            bestAttempt.config,
            this.request,
          );
        }
        this.status = 'rejected_infeasible';
      }
    }

    const recommendedRun = this.recommendedRunId
      ? this.candidateRuns.find((r) => r.runId === this.recommendedRunId) ?? null
      : null;

    const explanation =
      this.agentExplanation ||
      this.failureAnalysis ||
      fallbackExplanation ||
      (recommendedRun
        ? `Selected ${recommendedRun.label} based on verified simulation throughput and completion rate.`
        : 'No candidate configuration satisfied the requested production criteria within the physical limits of a single delta robot.');

    return {
      sessionId: `shift-${Date.now()}`,
      mode,
      modelId,
      createdAt: new Date().toISOString(),
      initialConfig: this.initialConfig,
      baselineUnderNewRequirementsConfig: this.baselineUnderNewReqs,
      request: this.request,
      activities: this.activities,
      baselineRun: this.baselineRun,
      candidateRuns: this.candidateRuns,
      status: this.status,
      recommendedRunId: this.recommendedRunId,
      recommendedConfig: recommendedRun?.config ?? null,
      configDiff: recommendedRun
        ? computeConfigDiff(this.baselineUnderNewReqs, recommendedRun.config)
        : [],
      heldOutEvaluation: this.heldOutEvaluation,
      agentExplanation: explanation,
      failureAnalysis: this.failureAnalysis,
      checkedInvariants: [
        'Identical pre-generated arrival schedule across Baseline and all Candidates',
        'Blocked belt entry arrivals queued in FIFO buffer (never silently dropped)',
        'Unfinished items (queued + on belt + carried) excluded from successful placements',
        'Inverse kinematics (rod reach, motor joint angles [-104.5°, +45.5°], ball-joint tilt <= 46.6°) checked at 240 Hz',
        'Lumped-mass motor shaft torque estimated via Jacobian transpose at 240 Hz',
        'Static geometry (belt spacing, base height) and 6g motion limits held constant',
      ],
    };
  }
}

/**
 * Execute a deterministic, genuine-simulation replay trace when running without API credentials
 * or when replaying a recorded agent workflow. Clearly tagged with `mode: 'replay'`.
 */
export function runRecordedReplaySession(
  initialConfig: PickPlaceConfig,
  request: StructuredChangeRequest,
  callbacks?: ToolExecutorCallbacks,
): ChangeoverSessionResult {
  const exec = new ChangeoverToolExecutor(initialConfig, request, callbacks);
  exec.inspectLine();
  exec.validateChange({ summary: request.summary });

  const presetId = request.presetId;

  if (presetId === 'demand_surge') {
    // 1. Test an out-of-bounds conveyor speed to demonstrate real constraint validation
    exec.simulateCandidate({
      label: 'Over-speed Belt Attempt',
      rationale: 'Attempt 0.58 m/s belt speed to clear entry faster.',
      config: { strategy: 'edf', conveyorSpeed: 0.58, traySync: true },
    });
    // 2. Enable traySync with EDF at current high belt speed (0.44 m/s)
    exec.simulateCandidate({
      label: 'EDF + Tray Sync (0.44 m/s)',
      rationale: 'Enable automatic tray speed sync and switch to Earliest Deadline First.',
      config: { strategy: 'edf', conveyorSpeed: 0.44, traySync: true },
    });
    // 3. Slow conveyor to 0.26 m/s with EDF + Tray Sync to widen reach window
    exec.simulateCandidate({
      label: 'EDF + Tray Sync + 0.26 m/s Belt',
      rationale: 'Reduce conveyor speed to 0.26 m/s so items stay in the reach zone longer during surge bursts.',
      config: { strategy: 'edf', conveyorSpeed: 0.26, traySync: true },
    });
    // 4. Test FIFO at 0.26 m/s + Tray Sync
    exec.simulateCandidate({
      label: 'FIFO + Tray Sync + 0.26 m/s Belt',
      rationale: 'Compare FIFO scheduling against EDF at 0.26 m/s with synchronized trays.',
      config: { strategy: 'fifo', conveyorSpeed: 0.26, traySync: true },
    });
  } else if (presetId === 'product_change') {
    // 1. Keep co-flow trays, switch to EDF and moderate belt speed (0.32 m/s)
    exec.simulateCandidate({
      label: 'EDF + Co-Flow (0.32 m/s)',
      rationale: 'Switch scheduler to EDF and lower belt speed to 0.32 m/s for taller cylinders.',
      config: { strategy: 'edf', conveyorSpeed: 0.32, placeMode: 'trayConveyor', trayFlow: 'co', traySync: true },
    });
    // 2. Switch tray belt to counter-flow at 0.26 m/s with EDF
    exec.simulateCandidate({
      label: 'EDF + Counter-Flow (0.26 m/s)',
      rationale: 'Use counter-flow trays and 0.26 m/s conveyor speed to maximize intercept overlap.',
      config: {
        strategy: 'edf',
        conveyorSpeed: 0.26,
        placeMode: 'trayConveyor',
        trayFlow: 'counter',
        traySync: true,
      },
    });
    // 3. Static trays with EDF at 0.26 m/s
    exec.simulateCandidate({
      label: 'EDF + Static Trays (0.26 m/s)',
      rationale: 'Eliminate moving-tray intercept wait by placing into static trays at 0.26 m/s.',
      config: { strategy: 'edf', conveyorSpeed: 0.26, placeMode: 'staticTrays' },
    });
  } else if (presetId === 'tray_change') {
    // 1. Try violating locked traySync=false constraint to verify guardrails
    exec.simulateCandidate({
      label: 'Auto-Sync Override Attempt',
      rationale: 'Test whether automatic tray sync can be re-enabled.',
      config: { traySync: true, strategy: 'edf', conveyorSpeed: 0.28 },
    });
    // 2. Manual tray speed too fast (0.26 m/s) -> leaves trays incomplete
    exec.simulateCandidate({
      label: 'Fast Manual Tray Belt (0.26 m/s)',
      rationale: 'Run co-flow trays at 0.26 m/s with EDF and 0.28 m/s conveyor.',
      config: { traySpeed: 0.26, conveyorSpeed: 0.28, strategy: 'edf' },
    });
    // 3. Matched manual tray speed (0.14 m/s) with EDF and 0.26 m/s conveyor
    exec.simulateCandidate({
      label: 'Matched Manual Tray Speed (0.14 m/s)',
      rationale:
        'Set manual traySpeed to 0.14 m/s (matching 1.35 items/s / 4 slots * 0.42m pitch) with EDF and 0.26 m/s belt.',
      config: { traySpeed: 0.14, conveyorSpeed: 0.26, strategy: 'edf' },
    });
    // 4. Slightly slower manual tray speed (0.12 m/s) with FIFO and 0.26 m/s conveyor
    exec.simulateCandidate({
      label: 'Compact Manual Tray Speed (0.12 m/s)',
      rationale: 'Test 0.12 m/s manual tray speed to maximize completely filled trays.',
      config: { traySpeed: 0.12, conveyorSpeed: 0.26, strategy: 'fifo' },
    });
  } else if (presetId === 'infeasible_overload') {
    exec.simulateCandidate({
      label: 'EDF + Fast Belt (0.42 m/s)',
      rationale: 'Test EDF with faster 0.42 m/s belt to prevent entry queue pileup at 2.5 items/s.',
      config: { strategy: 'edf', conveyorSpeed: 0.42, traySync: true },
    });
    exec.simulateCandidate({
      label: 'Nearest + Medium Belt (0.30 m/s)',
      rationale: 'Minimize horizontal travel distance by picking nearest items first at 0.30 m/s.',
      config: { strategy: 'nearest', conveyorSpeed: 0.3, traySync: true },
    });
    exec.simulateCandidate({
      label: 'Nearest + Static Trays (0.28 m/s)',
      rationale: 'Use static trays with Nearest strategy to achieve shortest possible cycle time.',
      config: { strategy: 'nearest', conveyorSpeed: 0.28, placeMode: 'staticTrays' },
    });
    exec.compareCandidates({});
    exec.explainFailure({
      runId: 'cand-3',
      analysis:
        'At 2.50 items/s (150 items/min), offered workload exceeds a single delta robot’s physical cycle ceiling (~0.68 s/pick = ~88 picks/min under 6g motion limits). Even the fastest candidate (Nearest + Static Trays) reaches ~99% robot utilisation but can only place ~62% of offered items. Recommendation: reject changeover or split workload across two delta pickers.',
    });
    return exec.buildResult(
      'replay',
      'recorded-agent-trace (replay)',
      'Changeover rejected: 2.50 items/s (150 items/min) exceeds the physical cycle capacity (~88 picks/min) of a single delta robot under fixed 6g motion limits.',
    );
  } else {
    // Custom request exploration
    exec.simulateCandidate({
      label: 'EDF + Synced Trays (0.26 m/s)',
      rationale: 'Switch to Earliest Deadline First at 0.26 m/s conveyor speed with synchronized trays.',
      config: { strategy: 'edf', conveyorSpeed: 0.26, traySync: true, traySpeed: 0.15 },
    });
    exec.simulateCandidate({
      label: 'FIFO + Counter-Flow (0.28 m/s)',
      rationale: 'Test FIFO scheduling at 0.28 m/s belt speed.',
      config: { strategy: 'fifo', conveyorSpeed: 0.28, trayFlow: 'counter', traySync: true, traySpeed: 0.14 },
    });
    exec.simulateCandidate({
      label: 'EDF + Static Trays (0.26 m/s)',
      rationale: 'Test static tray placement with EDF at 0.26 m/s.',
      config: { strategy: 'edf', conveyorSpeed: 0.26, placeMode: 'staticTrays', traySpeed: 0.14 },
    });
  }

  exec.compareCandidates({});
  return exec.buildResult('replay', 'recorded-agent-trace (replay)');
}
