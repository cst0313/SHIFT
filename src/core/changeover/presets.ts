import { DEFAULT_PICK_PLACE, type PickPlaceConfig } from '../scenarios/pickPlace/pickPlace';
import type { EditableParam, StructuredChangeRequest } from './types';

export interface ScenarioChangeItem {
  param: string;
  before: string;
  after: string;
  impact: 'changed' | 'locked' | 'warning';
}

export interface ChangeoverPreset {
  id: 'demand_surge' | 'product_change' | 'tray_change' | 'infeasible_overload';
  code: 'A' | 'B' | 'C' | 'D';
  title: string;
  subtitle: string;
  sceneBadge: string;
  prompt: string;
  /** Explicit visual breakdown of what changes in this scenario */
  scenarioChanges: ScenarioChangeItem[];
  /** Baseline operating configuration before the production order changes */
  baselineLineConfig: PickPlaceConfig;
  structuredRequest: StructuredChangeRequest;
}

export const INITIAL_LINE_CONFIG: PickPlaceConfig = {
  ...DEFAULT_PICK_PLACE,
  seed: 42,
  strategy: 'edf',
  conveyorSpeed: 0.34,
  spawnRate: 1.0,
  placeMode: 'trayConveyor',
  trayFlow: 'counter',
  traySpeed: 0.09,
  traySync: true,
  mix: 'boxes',
  alignProducts: true,
};

export const CHANGEOVER_PRESETS: readonly ChangeoverPreset[] = [
  {
    id: 'demand_surge',
    code: 'A',
    title: 'Demand Surge',
    subtitle: 'Arrival rate jumps to 1.38 items/s (+38%) with fixed robot motion limits',
    sceneBadge: '+38% Carton Surge (1.38/s Boxes)',
    prompt:
      'Upstream carton sealer surged output to 1.38 items/s (83 items/min) of boxes. Keep robot acceleration/velocity limits and orientation alignment fixed, and find a line configuration with >= 95% completion and at most 2 missed items.',
    scenarioChanges: [
      {
        param: 'Arrival Rate',
        before: '1.00/s (60/m)',
        after: '1.38/s (83/m · +38%)',
        impact: 'changed',
      },
      {
        param: 'Legacy Pick Order',
        before: 'Nearest (middle)',
        after: 'Skips front → 8 missed',
        impact: 'warning',
      },
      {
        param: 'Robot & Yaw',
        before: '6g · Align ON',
        after: 'Locked (5m/s, 60m/s²)',
        impact: 'locked',
      },
    ],
    baselineLineConfig: {
      seed: 42,
      strategy: 'nearest',
      conveyorSpeed: 0.48,
      spawnRate: 1.0,
      placeMode: 'trayConveyor',
      trayFlow: 'counter',
      traySpeed: 0.09,
      traySync: false,
      mix: 'boxes',
      alignProducts: true,
    },
    structuredRequest: {
      id: 'req-demand-surge',
      presetId: 'demand_surge',
      title: 'Preset A — Demand Surge (1.00 → 1.38 items/s)',
      rawPrompt:
        'Upstream carton sealer surged output to 1.38 items/s (83 items/min) of boxes. Keep robot acceleration/velocity limits and orientation alignment fixed, and find a line configuration with >= 95% completion and at most 2 missed items.',
      summary:
        'Increase arrival rate to 1.38 items/s while keeping delta picker motion limits (5 m/s, 60 m/s²) and product alignment locked.',
      changedRequirements: {
        spawnRate: 1.38,
        mix: 'boxes',
        alignProducts: true,
      },
      fixedConstraints: {
        keepRobotLimitsFixed: true,
        requireOrientationAlignment: true,
        maxConveyorSpeed: 0.5,
        minConveyorSpeed: 0.15,
        notes: [
          'Robot motion limits fixed at vMax=5 m/s, aMax=60 m/s², jMax=3000 m/s³',
          'Product orientation alignment in trays must remain enabled',
          'Conveyor speed constrained to [0.15, 0.50] m/s',
        ],
      },
      editableParameters: ['strategy', 'conveyorSpeed', 'traySync', 'traySpeed', 'trayFlow'],
      successCriteria: {
        minCompletionRatePct: 95,
        maxMissedItems: 2,
      },
      evaluationSpec: {
        arrivalWindowSeconds: 32,
        drainSeconds: 13,
        selectionSeed: 42,
        heldOutSeeds: [101, 202, 303],
        maxCandidates: 5,
      },
    },
  },
  {
    id: 'product_change',
    code: 'B',
    title: 'Product Mix Change',
    subtitle: 'Switch from uniform boxes to mixed boxes + cylinders keeping alignment',
    sceneBadge: 'Mixed SKUs (Boxes + Cylinders + Pouches @ 1.40/s)',
    prompt:
      'Switch the line from uniform boxes to a mixed SKU stream (boxes + taller cylinders at 1.40 items/s) while keeping tray orientation alignment enabled. Adapt scheduling, belt speed, and tray placement to hit >= 95% completion.',
    scenarioChanges: [
      {
        param: '3D Product Mix',
        before: 'Boxes Only',
        after: 'Mixed (Boxes+Cyl+Pouch)',
        impact: 'changed',
      },
      {
        param: 'Arrival Rate',
        before: '1.00/s (60/m)',
        after: '1.40/s (84/m · Mixed)',
        impact: 'changed',
      },
      {
        param: '4th-Axis Yaw',
        before: 'Boxes Aligned',
        after: 'Locked ON (All SKUs)',
        impact: 'locked',
      },
    ],
    baselineLineConfig: {
      seed: 42,
      strategy: 'nearest',
      conveyorSpeed: 0.46,
      spawnRate: 1.4,
      placeMode: 'trayConveyor',
      trayFlow: 'co',
      traySpeed: 0.15,
      traySync: true,
      mix: 'boxes',
      alignProducts: true,
    },
    structuredRequest: {
      id: 'req-product-change',
      presetId: 'product_change',
      title: 'Preset B — Product Change (Boxes → Mixed SKUs)',
      rawPrompt:
        'Switch the line from uniform boxes to a mixed SKU stream (boxes + taller cylinders at 1.40 items/s) while keeping tray orientation alignment enabled. Adapt scheduling, belt speed, and tray placement to hit >= 95% completion.',
      summary:
        'Change product stream from boxes-only to mixed boxes & cylinders at 1.40 items/s while preserving 4th-axis yaw alignment.',
      changedRequirements: {
        mix: 'mixed',
        spawnRate: 1.4,
        alignProducts: true,
      },
      fixedConstraints: {
        keepRobotLimitsFixed: true,
        requireOrientationAlignment: true,
        notes: [
          'Must keep 4th-axis yaw orientation alignment active (alignProducts=true)',
          'Mixed stream introduces 60 mm tall cylinders alongside 50 mm boxes',
          'Robot kinematic & dynamic limits remain fixed',
        ],
      },
      editableParameters: ['strategy', 'conveyorSpeed', 'placeMode', 'trayFlow', 'traySync'],
      successCriteria: {
        minCompletionRatePct: 95,
        maxMissedItems: 2,
      },
      evaluationSpec: {
        arrivalWindowSeconds: 32,
        drainSeconds: 13,
        selectionSeed: 42,
        heldOutSeeds: [101, 202, 303],
        maxCandidates: 5,
      },
    },
  },
  {
    id: 'tray_change',
    code: 'C',
    title: 'Tray Configuration Change',
    subtitle: 'Co-flow tray conveyor with fixed manual tray speed (auto-sync disabled)',
    sceneBadge: 'Co-Flow Trays · Auto-Sync OFF (1.35/s Mixed)',
    prompt:
      'Downstream case packer requires co-flow moving trays with automatic tray-sync disabled at 1.35 items/s. Find a manual tray belt speed, product conveyor speed, and scheduling strategy that achieves >= 95% completion and dispatches at least 3 full trays.',
    scenarioChanges: [
      {
        param: 'Tray Direction',
        before: 'Counter-Flow',
        after: 'Co-Flow Trays (Locked)',
        impact: 'changed',
      },
      {
        param: 'Tray Auto-Sync',
        before: 'Auto-Sync ON',
        after: 'OFF (Manual VFD speed)',
        impact: 'warning',
      },
      {
        param: 'Workload Target',
        before: '1.00/s Boxes',
        after: '1.35/s Mixed · ≥3 Trays',
        impact: 'changed',
      },
    ],
    baselineLineConfig: {
      seed: 42,
      strategy: 'nearest',
      conveyorSpeed: 0.38,
      spawnRate: 1.35,
      placeMode: 'trayConveyor',
      trayFlow: 'counter',
      traySpeed: 0.06,
      traySync: true,
      mix: 'mixed',
      alignProducts: true,
    },
    structuredRequest: {
      id: 'req-tray-change',
      presetId: 'tray_change',
      title: 'Preset C — Co-Flow Manual Tray Recipe',
      rawPrompt:
        'Downstream case packer requires co-flow moving trays with automatic tray-sync disabled at 1.35 items/s. Find a manual tray belt speed, product conveyor speed, and scheduling strategy that achieves >= 95% completion and dispatches at least 3 full trays.',
      summary:
        'Lock tray conveyor to co-flow with traySync=false at 1.35 items/s; tune manual traySpeed, conveyorSpeed, and scheduler.',
      changedRequirements: {
        spawnRate: 1.35,
        placeMode: 'trayConveyor',
        trayFlow: 'co',
        traySync: false,
        mix: 'mixed',
        alignProducts: true,
      },
      fixedConstraints: {
        keepRobotLimitsFixed: true,
        requireOrientationAlignment: true,
        fixedPlaceMode: 'trayConveyor',
        fixedTrayFlow: 'co',
        fixedTraySync: false,
        notes: [
          'Place mode locked to moving trayConveyor in co-flow direction',
          'Automatic tray synchronization disabled (traySync=false)',
          'Must calibrate manual traySpeed so trays neither starve nor leave empty',
        ],
      },
      editableParameters: ['traySpeed', 'conveyorSpeed', 'strategy'],
      successCriteria: {
        minCompletionRatePct: 95,
        maxMissedItems: 2,
        minFullTrays: 3,
      },
      evaluationSpec: {
        arrivalWindowSeconds: 32,
        drainSeconds: 13,
        selectionSeed: 42,
        heldOutSeeds: [101, 202, 303],
        maxCandidates: 5,
      },
    },
  },
  {
    id: 'infeasible_overload',
    code: 'D',
    title: 'Infeasible Overload (Reject)',
    subtitle: '2.50 items/s (150/min) surge exceeds single delta picker cycle capacity',
    sceneBadge: '2.50/s (150/min) Overload vs. 88/min 6g Limit',
    prompt:
      'Run the line at 2.50 items/s (150 items/min) of mixed products with >= 95% completion and at most 2 missed items, without increasing robot motor acceleration limits or adding a second robot.',
    scenarioChanges: [
      {
        param: 'Arrival Rate',
        before: '1.00/s (60/m)',
        after: '2.50/s (150/m Overload)',
        impact: 'warning',
      },
      {
        param: 'Product Stream',
        before: 'Boxes Only',
        after: 'Mixed SKUs + Yaw ON',
        impact: 'changed',
      },
      {
        param: '6g Picker Limit',
        before: '~88 picks/m max',
        after: 'Exceeds limit → Rejects',
        impact: 'locked',
      },
    ],
    baselineLineConfig: {
      seed: 42,
      strategy: 'edf',
      conveyorSpeed: 0.3,
      spawnRate: 1.2,
      placeMode: 'trayConveyor',
      trayFlow: 'counter',
      traySpeed: 0.15,
      traySync: true,
      mix: 'mixed',
      alignProducts: true,
    },
    structuredRequest: {
      id: 'req-infeasible-overload',
      presetId: 'infeasible_overload',
      title: 'Preset D — Infeasible 2.50 items/s Overload',
      rawPrompt:
        'Run the line at 2.50 items/s (150 items/min) of mixed products with >= 95% completion and at most 2 missed items, without increasing robot motor acceleration limits or adding a second robot.',
      summary:
        'Attempt 2.50 items/s (150 picks/min) mixed-product throughput on a single delta picker with fixed 6g motion limits.',
      changedRequirements: {
        spawnRate: 2.5,
        mix: 'mixed',
        alignProducts: true,
      },
      fixedConstraints: {
        keepRobotLimitsFixed: true,
        requireOrientationAlignment: true,
        notes: [
          'Single picker hardware fixed (min gate cycle ~0.68s → ~88 picks/min ceiling)',
          'Cannot lower arrival rate below 2.50 items/s or skip orientation alignment',
        ],
      },
      editableParameters: ['strategy', 'conveyorSpeed', 'placeMode', 'trayFlow', 'traySync', 'traySpeed'],
      successCriteria: {
        minCompletionRatePct: 95,
        maxMissedItems: 2,
      },
      evaluationSpec: {
        arrivalWindowSeconds: 32,
        drainSeconds: 13,
        selectionSeed: 42,
        heldOutSeeds: [101, 202, 303],
        maxCandidates: 5,
      },
    },
  },
] as const;

export function getPresetById(id: string): ChangeoverPreset | undefined {
  return CHANGEOVER_PRESETS.find((p) => p.id === id);
}

/**
 * Parse a free-form natural language changeover prompt into a StructuredChangeRequest
 * when no preset is explicitly selected or before Gemini refines it.
 */
export function interpretNaturalLanguageRequest(
  rawPrompt: string,
  currentConfig: PickPlaceConfig,
): StructuredChangeRequest {
  const lower = rawPrompt.toLowerCase();

  // Check if it closely matches one of our presets
  if (lower.includes('2.5') || lower.includes('150') || lower.includes('overload')) {
    return structuredClone(CHANGEOVER_PRESETS[3]!.structuredRequest);
  }
  if (lower.includes('downstream case packer') || lower.includes('manual tray') || lower.includes('sync disabled')) {
    return structuredClone(CHANGEOVER_PRESETS[2]!.structuredRequest);
  }
  if (lower.includes('taller cylinders') || lower.includes('mixed sku stream')) {
    return structuredClone(CHANGEOVER_PRESETS[1]!.structuredRequest);
  }

  // Extract numeric arrival rate if mentioned (e.g. "1.6 items/s" or "1.5/s")
  const rateMatch = rawPrompt.match(/(\d+(?:\.\d+)?)\s*(?:items?\s*\/\s*s|\/s|per\s*sec)/i);
  const parsedRate = rateMatch ? Math.min(2.5, Math.max(0.3, Number(rateMatch[1]))) : undefined;

  const wantsStatic = lower.includes('static tray');
  const wantsCoFlow = lower.includes('co-flow') || lower.includes('coflow');
  const wantsCounterFlow = lower.includes('counter-flow') || lower.includes('counterflow');
  const wantsMixed = lower.includes('mixed') || lower.includes('cylinder');
  const wantsBoxes = lower.includes('boxes only') || lower.includes('uniform box');
  const disableSync = lower.includes('disable sync') || lower.includes('without sync') || lower.includes('manual tray');

  const spawnRate = parsedRate ?? Math.min(2.5, Number((currentConfig.spawnRate * 1.3).toFixed(2)));
  const mix = wantsMixed ? 'mixed' : wantsBoxes ? 'boxes' : currentConfig.mix;

  const editableParameters: EditableParam[] = ['strategy', 'conveyorSpeed'];
  const fixedPlaceMode = wantsStatic ? 'staticTrays' : undefined;
  const fixedTrayFlow = wantsCoFlow ? 'co' : wantsCounterFlow ? 'counter' : undefined;
  const fixedTraySync = disableSync ? false : undefined;

  if (!fixedPlaceMode) editableParameters.push('placeMode');
  if (!fixedTrayFlow) editableParameters.push('trayFlow');
  if (fixedTraySync === undefined) editableParameters.push('traySync');
  editableParameters.push('traySpeed');

  return {
    id: `req-custom-${Date.now()}`,
    title: 'Custom Production Changeover',
    rawPrompt,
    summary: `Adapt line for ${spawnRate.toFixed(2)} items/s (${mix} products) while respecting fixed robot motion limits.`,
    changedRequirements: {
      spawnRate,
      mix,
      alignProducts: true,
      ...(fixedPlaceMode ? { placeMode: fixedPlaceMode } : {}),
      ...(fixedTrayFlow ? { trayFlow: fixedTrayFlow } : {}),
      ...(fixedTraySync !== undefined ? { traySync: fixedTraySync } : {}),
    },
    fixedConstraints: {
      keepRobotLimitsFixed: true,
      requireOrientationAlignment: true,
      fixedPlaceMode,
      fixedTrayFlow,
      fixedTraySync,
      notes: [
        'Robot motion limits fixed at vMax=5 m/s, aMax=60 m/s²',
        'Orientation alignment preserved (alignProducts=true)',
      ],
    },
    editableParameters,
    successCriteria: {
      minCompletionRatePct: 94,
      maxMissedItems: 3,
    },
    evaluationSpec: {
      arrivalWindowSeconds: 32,
      drainSeconds: 13,
      selectionSeed: currentConfig.seed || 42,
      heldOutSeeds: [101, 202, 303],
      maxCandidates: 5,
    },
  };
}
