import type { PickPlaceConfig, PlaceMode, ProductMix, TrayFlow } from '../scenarios/pickPlace/pickPlace';
import type { Strategy } from '../scheduling/scheduler';

export type EditableParam =
  | 'strategy'
  | 'conveyorSpeed'
  | 'placeMode'
  | 'trayFlow'
  | 'traySpeed'
  | 'traySync';

export const ALL_EDITABLE_PARAMS: readonly EditableParam[] = [
  'strategy',
  'conveyorSpeed',
  'placeMode',
  'trayFlow',
  'traySpeed',
  'traySync',
] as const;

export const PARAM_BOUNDS = {
  conveyorSpeed: { min: 0.1, max: 0.6, step: 0.01, unit: 'm/s', label: 'Conveyor speed' },
  traySpeed: { min: 0.02, max: 0.4, step: 0.01, unit: 'm/s', label: 'Tray belt speed' },
  spawnRate: { min: 0.3, max: 2.5, step: 0.05, unit: 'items/s', label: 'Arrival rate' },
  strategies: ['edf', 'fifo', 'nearest'] as readonly Strategy[],
  placeModes: ['trayConveyor', 'staticTrays'] as readonly PlaceMode[],
  trayFlows: ['counter', 'co'] as readonly TrayFlow[],
  mixes: ['boxes', 'mixed'] as readonly ProductMix[],
} as const;

export interface FixedConstraintsSpec {
  /** Robot kinematic & motion limits (vMax=5m/s, aMax=60m/s², jMax=3000m/s³) are always fixed */
  keepRobotLimitsFixed: true;
  requireOrientationAlignment?: boolean;
  fixedPlaceMode?: PlaceMode;
  fixedTrayFlow?: TrayFlow;
  fixedTraySync?: boolean;
  maxConveyorSpeed?: number;
  minConveyorSpeed?: number;
  notes: string[];
}

export interface SuccessCriteriaSpec {
  /** Minimum percentage of offered products placed into trays (0..100) */
  minCompletionRatePct: number;
  /** Maximum number of products missed during the evaluation run */
  maxMissedItems: number;
  /** Optional minimum throughput in picks/min */
  minThroughputPpm?: number;
  /** Optional minimum number of completely filled trays */
  minFullTrays?: number;
  /** Optional maximum incomplete trays allowed */
  maxIncompleteTrays?: number;
}

export interface EvaluationSpec {
  /** Window during which new products arrive on the belt [s] */
  arrivalWindowSeconds: number;
  /** Additional drain time after the arrival window so offered items reach the robot [s] */
  drainSeconds: number;
  /** Primary deterministic seed used during candidate selection */
  selectionSeed: number;
  /** Held-out seeds never used to pick the candidate, used for finalist verification */
  heldOutSeeds: number[];
  /** Maximum candidate simulations allowed in the search budget */
  maxCandidates: number;
}

export interface StructuredChangeRequest {
  id: string;
  presetId?: string;
  title: string;
  rawPrompt: string;
  summary: string;
  /** Production requirements that define the new workload/task (agent may NOT relax these) */
  changedRequirements: Partial<
    Pick<PickPlaceConfig, 'spawnRate' | 'mix' | 'alignProducts' | 'placeMode' | 'trayFlow' | 'traySync'>
  >;
  fixedConstraints: FixedConstraintsSpec;
  editableParameters: EditableParam[];
  successCriteria: SuccessCriteriaSpec;
  evaluationSpec: EvaluationSpec;
}

export interface SimulationRunMetrics {
  /** Total products scheduled and offered during the arrival window */
  offered: number;
  /** Products successfully placed into tray slots */
  placed: number;
  /** Products that passed missX (0.9m) or were dropped */
  missed: number;
  /** Offered products still waiting for belt entry clearance at end of run */
  queued: number;
  /** Products still on the conveyor belt or reserved at end of run */
  onBelt: number;
  /** Product currently held in gripper at end of run */
  carried: number;
  /** Total unprocessed products (queued + onBelt + carried); never counted as placed */
  unfinished: number;
  /** True completion rate: 100 * placed / offered */
  completionRatePct: number;
  /** True miss rate: 100 * missed / offered */
  missRatePct: number;
  /** Effective throughput over the arrival window [picks/min] */
  throughputPpm: number;
  /** Mean robot pick-and-place cycle time [s] */
  avgCycleSeconds: number;
  /** Robot busy time fraction [%] */
  utilisationPct: number;
  /** Completely filled trays dispatched */
  traysFilled: number;
  /** Partially filled trays that exited the belt */
  traysIncomplete: number;
  /** Number of simulation steps where belt entry was temporarily blocked (<0.15m spacing) */
  entryBlockedEvents: number;
  /** Estimated peak motor shaft torque across the 3 delta axes [N·m] (lumped-mass estimate) */
  peakTorqueNm: number;
  /** Steps where inverse kinematics failed (unreachable, joint limit, or ball-joint tilt) */
  workspaceViolations: number;
  /** Total simulated seconds (arrivalWindowSeconds + drainSeconds) */
  simulatedDurationSeconds: number;
}

export interface CandidateValidation {
  valid: boolean;
  violations: string[];
}

export interface CandidateRunRecord {
  runId: string;
  label: string;
  isBaseline: boolean;
  config: PickPlaceConfig;
  rationale: string;
  validation: CandidateValidation;
  metrics: SimulationRunMetrics | null;
  meetsSuccessCriteria: boolean;
  criteriaFailures: string[];
}

export interface RangeStat {
  mean: number;
  min: number;
  max: number;
}

export interface HeldOutAggregate {
  completionRatePct: RangeStat;
  throughputPpm: RangeStat;
  missed: RangeStat;
  unfinished: RangeStat;
  traysFilled: RangeStat;
}

export interface HeldOutSummary {
  seeds: number[];
  sampleCount: number;
  baseline: HeldOutAggregate;
  finalist: HeldOutAggregate;
  improvesOverBaseline: boolean;
}

export interface ConfigDiffEntry {
  parameter: keyof PickPlaceConfig;
  label: string;
  before: string | number | boolean;
  after: string | number | boolean;
  unit?: string;
}

export type AgentToolName =
  | 'inspect_line'
  | 'validate_change'
  | 'simulate_candidate'
  | 'compare_candidates'
  | 'propose_configuration'
  | 'explain_failure';

export interface AgentToolActivity {
  id: string;
  timestamp: number;
  tool: AgentToolName;
  statusLabel: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
}

export interface ChangeoverSessionResult {
  sessionId: string;
  mode: 'live_gemini' | 'replay' | 'deterministic_search';
  modelId: string;
  createdAt: string;
  initialConfig: PickPlaceConfig;
  /** The old configuration subjected to the NEW production requirements ("Before") */
  baselineUnderNewRequirementsConfig: PickPlaceConfig;
  request: StructuredChangeRequest;
  activities: AgentToolActivity[];
  baselineRun: CandidateRunRecord;
  candidateRuns: CandidateRunRecord[];
  status: 'recommended' | 'rejected_infeasible' | 'error';
  recommendedRunId: string | null;
  recommendedConfig: PickPlaceConfig | null;
  configDiff: ConfigDiffEntry[];
  heldOutEvaluation: HeldOutSummary | null;
  agentExplanation: string;
  failureAnalysis?: string;
  apiError?: string;
  checkedInvariants: string[];
}
