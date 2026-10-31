import { create } from 'zustand';
import { type PickPlaceConfig } from '@/core/scenarios/pickPlace/pickPlace';
import { DEFAULT_WEEDING, type WeedingConfig } from '@/core/scenarios/weeding/weeding';
import type { PresetName } from '@/core/kinematics/params';
import {
  CHANGEOVER_PRESETS,
  INITIAL_LINE_CONFIG,
  getPresetById,
  interpretNaturalLanguageRequest,
} from '@/core/changeover/presets';
import { applyRequirementsToBaseline } from '@/core/changeover/evaluator';
import { runRecordedReplaySession } from '@/core/changeover/sessionRunner';
import type {
  AgentToolActivity,
  CandidateRunRecord,
  ChangeoverSessionResult,
  StructuredChangeRequest,
} from '@/core/changeover/types';
import { readUrlState } from './urlState';

const preloadedSessionCache = new Map<string, ChangeoverSessionResult>();

export function getPreloadedSessionForPreset(presetId: string): ChangeoverSessionResult | null {
  const cached = preloadedSessionCache.get(presetId);
  if (cached) return structuredClone(cached);
  const preset = getPresetById(presetId);
  if (!preset) return null;
  const computed = runRecordedReplaySession(
    structuredClone(preset.baselineLineConfig),
    structuredClone(preset.structuredRequest),
  );
  preloadedSessionCache.set(presetId, computed);
  return structuredClone(computed);
}

export type Mode = 'pickPlace' | 'weeding' | 'manual';
export type CameraMode = 'follow' | 'robot' | 'top' | 'free';
export type ChartKind = 'theta' | 'omega' | 'tau';
export type RightDockTab = 'changeover' | 'manualControls';
export type ComparisonReplayView = 'none' | 'before' | 'after';
export type DiagnosticsTab = 'candidates' | 'telemetry' | 'controls';
export type WorkflowStep = 1 | 2 | 3;

export interface ViewOptions {
  workspace: boolean;
  path: boolean;
  vision: boolean;
  markers: boolean;
}

export interface AgentBackendStatus {
  liveAvailable: boolean;
  modelId: string;
  mode: 'live_gemini' | 'replay';
}

export interface AppState {
  mode: Mode;
  pickPlace: PickPlaceConfig;
  weeding: WeedingConfig;
  manualPreset: PresetName;
  playing: boolean;
  timeScale: number;
  camera: CameraMode;
  view: ViewOptions;
  chart: ChartKind;
  panelOpen: boolean;
  quality: 'high' | 'low';
  benchmarkOpen: boolean;
  /** Incremented whenever the simulation has to be rebuilt */
  epoch: number;

  // SHIFT Changeover state
  workflowStep: WorkflowStep;
  photoCalibrated: boolean;
  rightDockTab: RightDockTab;
  diagnosticsOpen: boolean;
  diagnosticsTab: DiagnosticsTab;
  storyGuideOpen: boolean;
  selectedPresetId: string;
  draftPrompt: string;
  structuredRequest: StructuredChangeRequest;
  agentBackendStatus: AgentBackendStatus;
  isEvaluating: boolean;
  streamingActivities: AgentToolActivity[];
  streamingCandidates: CandidateRunRecord[];
  activeSession: ChangeoverSessionResult | null;
  appliedConfigHistory: PickPlaceConfig[];
  hasAppliedActiveRecommendation: boolean;
  comparisonReplayView: ComparisonReplayView;

  setMode(mode: Mode): void;
  /** Update settings; `rebuild` restarts the simulation (for structural changes) */
  setPickPlace(patch: Partial<PickPlaceConfig>, rebuild?: boolean): void;
  setWeeding(patch: Partial<WeedingConfig>, rebuild?: boolean): void;
  set<K extends keyof AppState>(key: K, value: AppState[K]): void;
  setView(patch: Partial<ViewOptions>): void;
  restart(): void;
  reroll(): void;

  // SHIFT Changeover actions
  setWorkflowStep(step: WorkflowStep): void;
  selectPreset(presetId: string): void;
  activatePresetWithPreload(presetId: string): void;
  setDraftPrompt(prompt: string): void;
  parseDraftPromptLocally(): void;
  updateStructuredRequest(updater: (req: StructuredChangeRequest) => StructuredChangeRequest): void;
  setSessionResult(result: ChangeoverSessionResult | null): void;
  applyRecommendedConfig(): boolean;
  undoAppliedConfig(): boolean;
  toggleReplayComparison(): void;
  previewUnadjustedChangeOnLine(): void;
  openDiagnostics(tab?: DiagnosticsTab): void;
  resetLineToDefault(): void;
}

const initial = readUrlState();
const defaultPreset = CHANGEOVER_PRESETS[0]!;

export const useApp = create<AppState>()((set, get) => ({
  // Always open on the active Pick & Place packing line
  mode: 'pickPlace',
  pickPlace: { ...INITIAL_LINE_CONFIG, ...initial.pickPlace },
  weeding: { ...DEFAULT_WEEDING, ...initial.weeding },
  manualPreset: 'picker',
  playing: true,
  timeScale: 1,
  camera: 'follow',
  view: { workspace: false, path: true, vision: true, markers: true },
  chart: 'theta',
  panelOpen: true,
  quality: 'high',
  benchmarkOpen: false,
  epoch: 0,

  workflowStep: 1,
  photoCalibrated: true,
  rightDockTab: 'changeover',
  diagnosticsOpen: false,
  diagnosticsTab: 'candidates',
  storyGuideOpen: false,
  selectedPresetId: defaultPreset.id,
  draftPrompt: defaultPreset.prompt,
  structuredRequest: structuredClone(defaultPreset.structuredRequest),
  agentBackendStatus: {
    liveAvailable: false,
    modelId: 'gemini-3.8-flash',
    mode: 'replay',
  },
  isEvaluating: false,
  streamingActivities: [],
  streamingCandidates: [],
  activeSession: null,
  appliedConfigHistory: [],
  hasAppliedActiveRecommendation: false,
  comparisonReplayView: 'none',

  setMode: (mode) => set({ mode, epoch: get().epoch + 1, camera: 'follow', playing: true }),
  setPickPlace: (patch, rebuild = false) =>
    set((s) => ({ pickPlace: { ...s.pickPlace, ...patch }, epoch: rebuild ? s.epoch + 1 : s.epoch })),
  setWeeding: (patch, rebuild = false) =>
    set((s) => ({ weeding: { ...s.weeding, ...patch }, epoch: rebuild ? s.epoch + 1 : s.epoch })),
  set: (key, value) => set({ [key]: value } as Partial<AppState>),
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  restart: () => set((s) => ({ epoch: s.epoch + 1, playing: true })),
  reroll: () => {
    const seed = Math.floor(Math.random() * 1e6);
    set((s) => ({
      pickPlace: { ...s.pickPlace, seed },
      weeding: { ...s.weeding, seed },
      epoch: s.epoch + 1,
      playing: true,
    }));
  },

  setWorkflowStep: (step) => set({ workflowStep: step }),

  selectPreset: (presetId) => {
    const preset = getPresetById(presetId);
    if (!preset) return;
    set({
      selectedPresetId: preset.id,
      draftPrompt: preset.prompt,
      structuredRequest: structuredClone(preset.structuredRequest),
    });
  },

  activatePresetWithPreload: (presetId) => {
    const preset = getPresetById(presetId);
    if (!preset) return;
    const preloadedSession = getPreloadedSessionForPreset(preset.id);
    const unadjustedWorkloadConfig = applyRequirementsToBaseline(
      preset.baselineLineConfig,
      preset.structuredRequest,
    );
    const s = get();
    set({
      mode: 'pickPlace',
      selectedPresetId: preset.id,
      draftPrompt: preset.prompt,
      structuredRequest: structuredClone(preset.structuredRequest),
      activeSession: preloadedSession,
      streamingActivities: [],
      streamingCandidates: [],
      isEvaluating: false,
      hasAppliedActiveRecommendation: false,
      comparisonReplayView: 'before',
      appliedConfigHistory: [...s.appliedConfigHistory, structuredClone(s.pickPlace)],
      pickPlace: structuredClone(unadjustedWorkloadConfig),
      playing: true,
      epoch: s.epoch + 1,
    });
  },

  setDraftPrompt: (prompt) => set({ draftPrompt: prompt }),

  parseDraftPromptLocally: () => {
    const s = get();
    const parsed = interpretNaturalLanguageRequest(s.draftPrompt, s.pickPlace);
    set({
      selectedPresetId: parsed.presetId ?? 'custom',
      structuredRequest: parsed,
    });
  },

  updateStructuredRequest: (updater) =>
    set((s) => ({
      structuredRequest: updater(structuredClone(s.structuredRequest)),
    })),

  setSessionResult: (result) =>
    set({
      activeSession: result,
      isEvaluating: false,
      hasAppliedActiveRecommendation: false,
      comparisonReplayView: 'none',
    }),

  applyRecommendedConfig: () => {
    const s = get();
    const rec = s.activeSession?.recommendedConfig;
    if (!rec) return false;
    const prevSnapshot = structuredClone(s.pickPlace);
    set({
      appliedConfigHistory: [...s.appliedConfigHistory, prevSnapshot],
      pickPlace: structuredClone(rec),
      hasAppliedActiveRecommendation: true,
      comparisonReplayView: 'after',
      mode: 'pickPlace',
      playing: true,
      epoch: s.epoch + 1,
    });
    return true;
  },

  undoAppliedConfig: () => {
    const s = get();
    if (s.appliedConfigHistory.length === 0) return false;
    const previous = s.appliedConfigHistory[s.appliedConfigHistory.length - 1]!;
    set({
      pickPlace: structuredClone(previous),
      appliedConfigHistory: s.appliedConfigHistory.slice(0, -1),
      hasAppliedActiveRecommendation: false,
      comparisonReplayView: 'none',
      playing: true,
      epoch: s.epoch + 1,
    });
    return true;
  },

  toggleReplayComparison: () => {
    const s = get();
    if (!s.activeSession) return;
    const beforeCfg = s.activeSession.baselineUnderNewRequirementsConfig;
    const afterCfg = s.activeSession.recommendedConfig ?? beforeCfg;
    const nextView: ComparisonReplayView =
      s.comparisonReplayView === 'before' ? 'after' : 'before';
    const nextConfig = nextView === 'before' ? beforeCfg : afterCfg;
    set({
      comparisonReplayView: nextView,
      pickPlace: structuredClone(nextConfig),
      mode: 'pickPlace',
      playing: true,
      epoch: s.epoch + 1,
    });
  },

  previewUnadjustedChangeOnLine: () => {
    const s = get();
    const preset = getPresetById(s.selectedPresetId);
    const baseCfg = preset ? preset.baselineLineConfig : INITIAL_LINE_CONFIG;
    const unadjusted = applyRequirementsToBaseline(baseCfg, s.structuredRequest);
    set({
      appliedConfigHistory: [...s.appliedConfigHistory, structuredClone(s.pickPlace)],
      pickPlace: structuredClone(unadjusted),
      comparisonReplayView: 'before',
      hasAppliedActiveRecommendation: false,
      mode: 'pickPlace',
      playing: true,
      epoch: s.epoch + 1,
    });
  },

  openDiagnostics: (tab = 'candidates') => {
    set({
      diagnosticsOpen: true,
      diagnosticsTab: tab,
    });
  },

  resetLineToDefault: () => {
    const presetA = CHANGEOVER_PRESETS[0]!;
    set((s) => ({
      mode: 'pickPlace',
      workflowStep: 1,
      pickPlace: structuredClone(INITIAL_LINE_CONFIG),
      selectedPresetId: presetA.id,
      draftPrompt: presetA.prompt,
      structuredRequest: structuredClone(presetA.structuredRequest),
      isEvaluating: false,
      streamingActivities: [],
      streamingCandidates: [],
      activeSession: null,
      appliedConfigHistory: [],
      hasAppliedActiveRecommendation: false,
      comparisonReplayView: 'none',
      diagnosticsOpen: false,
      playing: true,
      epoch: s.epoch + 1,
    }));
  },
}));
