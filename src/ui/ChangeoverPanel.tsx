import { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Edit3,
  History,
  Layers,
  Loader2,
  Lock,
  MoveHorizontal,
  Play,
  Repeat,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import { getPreloadedSessionForPreset, useApp, type WorkflowStep } from '@/state/store';
import { playElevenLabsEvent } from './sfxPlayer';
import { CHANGEOVER_PRESETS, INITIAL_LINE_CONFIG, getPresetById } from '@/core/changeover/presets';
import { runRecordedReplaySession } from '@/core/changeover/sessionRunner';
import type {
  AgentToolActivity,
  CandidateRunRecord,
  ChangeoverSessionResult,
  EditableParam,
} from '@/core/changeover/types';
import { cn } from '@/lib/utils';

const ALL_EDITABLE_PARAMS: { id: EditableParam; label: string }[] = [
  { id: 'strategy', label: 'strategy' },
  { id: 'conveyorSpeed', label: 'conveyorSpeed' },
  { id: 'placeMode', label: 'placeMode' },
  { id: 'trayFlow', label: 'trayFlow' },
  { id: 'traySync', label: 'traySync' },
  { id: 'traySpeed', label: 'traySpeed' },
];

const WORKFLOW_STEPS: { step: WorkflowStep; shortTitle: string; subtitle: string }[] = [
  {
    step: 1,
    shortTitle: '1. Photo → Twin',
    subtitle: 'Slide Photo ↔ 3D Sim',
  },
  {
    step: 2,
    shortTitle: '2. 3D Line Diff',
    subtitle: 'What Scenario Changes',
  },
  {
    step: 3,
    shortTitle: '3. Param Testing',
    subtitle: 'Gemini Agent & Apply',
  },
];

interface PhotoVisionSummary {
  mode: 'live_gemini' | 'replay';
  modelId: string;
  robotType: string;
  detectedSkus: string[];
  conveyorLayout: string;
  safetyEnclosure: string;
  summary: string;
}

const DEFAULT_VISION_SUMMARY: PhotoVisionSummary = {
  mode: 'replay',
  modelId: 'vision-calibrated',
  robotType: '3-Axis Parallel Delta Picker + 4th-Axis Yaw Gripper (6g Limit)',
  detectedSkus: ['Cardboard Cartons (120×90×50 mm)', 'Blue & Green Canisters (Ø80×60 mm)'],
  conveyorLayout: 'Dual Parallel Belts: Left-to-Right Infeed + 4-Slot Outfeed Trays',
  safetyEnclosure: 'Interlocked Steel Frame + PLC Cabinet #04 (E-Stop Armed)',
  summary:
    'Camera photo calibrated to live 3D Digital Twin: drag the slider above to compare the physical cell photo with the live moving 3D robot simulation.',
};

/**
 * Live 30fps mirror of the main Three.js WebGL canvas so that when the user drags
 * the Photo ↔ 3D Sim slider in Step 1, the right side renders the live moving 3D robot!
 */
function Live3DSimMirrorCanvas() {
  const mirrorRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    let lastDraw = 0;

    const renderLoop = (now: number) => {
      rafId = requestAnimationFrame(renderLoop);
      if (now - lastDraw < 33) return; // ~30 fps
      lastDraw = now;

      const dst = mirrorRef.current;
      if (!dst) return;
      const src = document.querySelector('canvas:not([data-mirror="true"])') as HTMLCanvasElement | null;
      if (!src || src.width === 0 || src.height === 0) return;

      const ctx = dst.getContext('2d');
      if (!ctx) return;

      // Crop the central workcell area of the main 3D canvas where the Delta robot & belts live
      const cropW = src.width * 0.62;
      const cropH = src.height * 0.62;
      const sx = Math.max(0, (src.width - cropW) * 0.36);
      const sy = Math.max(0, (src.height - cropH) * 0.42);

      ctx.drawImage(src, sx, sy, cropW, cropH, 0, 0, dst.width, dst.height);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={mirrorRef}
      data-mirror="true"
      data-testid="live-sim-mirror-canvas"
      width={480}
      height={270}
      className="h-full w-full object-cover"
    />
  );
}

export function ChangeoverPanel() {
  const {
    set,
    pickPlace,
    workflowStep,
    setWorkflowStep,
    selectedPresetId,
    activatePresetWithPreload,
    draftPrompt,
    setDraftPrompt,
    parseDraftPromptLocally,
    structuredRequest,
    updateStructuredRequest,
    agentBackendStatus,
    isEvaluating,
    streamingActivities,
    streamingCandidates,
    activeSession,
    setSessionResult,
    appliedConfigHistory,
    hasAppliedActiveRecommendation,
    comparisonReplayView,
    applyRecommendedConfig,
    undoAppliedConfig,
    toggleReplayComparison,
    previewUnadjustedChangeOnLine,
    openDiagnostics,
    mode,
    setMode,
  } = useApp();

  const [isParsing, setIsParsing] = useState(false);
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [specExpanded, setSpecExpanded] = useState(false);
  const [isScanningPhoto, setIsScanningPhoto] = useState(false);
  const [photoScanned, setPhotoScanned] = useState(false);
  const [photoPreviewKind, setPhotoPreviewKind] = useState<'packing' | 'weeder'>('packing');
  const [visionSummary, setVisionSummary] = useState<PhotoVisionSummary>(DEFAULT_VISION_SUMMARY);
  const [splitPct, setSplitPct] = useState(100);

  // Preload initial scenario session on mount so Before/After UI & What Changes are immediately ready
  useEffect(() => {
    const state = useApp.getState();
    if (!state.activeSession && !state.isEvaluating) {
      const preloaded = getPreloadedSessionForPreset(state.selectedPresetId);
      if (preloaded) {
        state.setSessionResult(preloaded);
      }
    }
  }, []);

  // Check backend Gemini availability on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.liveAvailable === 'boolean') {
          set('agentBackendStatus', {
            liveAvailable: data.liveAvailable,
            modelId: data.modelId || 'gemini-3.8-flash',
            mode: data.liveAvailable ? 'live_gemini' : 'replay',
          });
        }
      })
      .catch(() => {
        // Offline / static mode falls back cleanly to replay
      });
    return () => {
      cancelled = true;
    };
  }, [set]);

  const handleScanFactoryPhoto = async () => {
    setIsScanningPhoto(true);
    playElevenLabsEvent('scan');
    await new Promise((r) => setTimeout(r, 450));
    setIsScanningPhoto(false);
    setPhotoScanned(true);
    setSplitPct(50);

    try {
      const res = await fetch('/api/agent/analyze-photo', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as PhotoVisionSummary;
        if (data?.robotType) {
          setVisionSummary(data);
        }
      }
    } catch {
      // Keep default calibrated vision summary
    }
  };

  const handleInterpretPrompt = async () => {
    setIsParsing(true);
    try {
      const res = await fetch('/api/agent/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPrompt: draftPrompt, currentConfig: pickPlace }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.request) {
          set('structuredRequest', data.request);
          set('selectedPresetId', data.request.presetId ?? 'custom');
          setIsParsing(false);
          return;
        }
      }
    } catch {
      // Fall back to deterministic local parser
    }
    parseDraftPromptLocally();
    setIsParsing(false);
  };

  const runChangeoverEvaluation = async (forceReplay = false) => {
    setWorkflowStep(3);
    const preset = getPresetById(selectedPresetId);
    const baselineConfig = preset ? structuredClone(preset.baselineLineConfig) : structuredClone(pickPlace);

    set('isEvaluating', true);
    set('streamingActivities', []);
    set('streamingCandidates', []);
    set('activeSession', null);
    set('hasAppliedActiveRecommendation', false);
    set('comparisonReplayView', 'none');

    if (forceReplay || !agentBackendStatus.liveAvailable) {
      const activities: AgentToolActivity[] = [];
      const candidates: CandidateRunRecord[] = [];
      const replayResult = runRecordedReplaySession(baselineConfig, structuredRequest, {
        onActivity: (a) => {
          activities.push(a);
          set('streamingActivities', [...activities]);
        },
        onCandidateRun: (c) => {
          candidates.push(c);
          set('streamingCandidates', [...candidates]);
        },
      });
      setSessionResult(replayResult);
      return;
    }

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialConfig: baselineConfig,
          request: structuredRequest,
          forceReplay: false,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const activities: AgentToolActivity[] = [];
      const candidates: CandidateRunRecord[] = [];
      let finalResult: ChangeoverSessionResult | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line) as {
              type: 'activity' | 'candidate' | 'result';
              activity?: AgentToolActivity;
              run?: CandidateRunRecord;
              result?: ChangeoverSessionResult;
            };
            if (evt.type === 'activity' && evt.activity) {
              activities.push(evt.activity);
              set('streamingActivities', [...activities]);
            } else if (evt.type === 'candidate' && evt.run) {
              candidates.push(evt.run);
              set('streamingCandidates', [...candidates]);
            } else if (evt.type === 'result' && evt.result) {
              finalResult = evt.result;
            }
          } catch {
            // Ignore malformed line
          }
        }
      }

      if (finalResult) {
        setSessionResult(finalResult);
      } else {
        throw new Error('Stream ended without final session result');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const fallbackResult = runRecordedReplaySession(baselineConfig, structuredRequest);
      fallbackResult.apiError = `Live API unreachable (${errMsg}); showing verified deterministic simulation replay.`;
      setSessionResult(fallbackResult);
    }
  };

  const toggleEditableParam = (param: EditableParam) => {
    updateStructuredRequest((req) => {
      const exists = req.editableParameters.includes(param);
      const next = exists
        ? req.editableParameters.filter((p) => p !== param)
        : [...req.editableParameters, param];
      return {
        ...req,
        editableParameters: next.length > 0 ? next : [param],
      };
    });
  };

  const activePreset = getPresetById(selectedPresetId) ?? CHANGEOVER_PRESETS[0]!;
  const activities = activeSession ? activeSession.activities : streamingActivities;
  const candidates = activeSession ? activeSession.candidateRuns : streamingCandidates;
  const baselineRun = activeSession?.baselineRun ?? null;

  const isRecommended =
    activeSession?.status === 'recommended' && !!activeSession?.recommendedConfig;
  const isRejected = activeSession?.status === 'rejected_infeasible';

  const baseMetrics = baselineRun?.metrics ?? null;
  const recRun = activeSession
    ? activeSession.recommendedRunId
      ? activeSession.candidateRuns.find((r) => r.runId === activeSession.recommendedRunId) ?? null
      : [...activeSession.candidateRuns]
          .filter((r) => r.validation.valid && r.metrics)
          .sort((a, b) => (b.metrics?.placed ?? 0) - (a.metrics?.placed ?? 0))[0] ?? null
    : null;
  const recMetrics = recRun?.metrics ?? null;
  const heldOut = activeSession?.heldOutEvaluation ?? null;

  const exportEvidenceJson = () => {
    if (!activeSession) return;
    const blob = new Blob([JSON.stringify(activeSession, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.sessionId}-${activeSession.request.presetId || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      data-testid="changeover-dock"
      className="pointer-events-auto glass flex max-h-full w-[410px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-white/12 shadow-2xl"
    >
      <div className="space-y-2.5 overflow-y-auto overscroll-contain p-3">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-emerald-400" />
            <span className="font-mono text-[11px] font-bold tracking-[0.07em] text-emerald-300 uppercase">
              SHIFT · Changeover Copilot
            </span>
          </div>
          <button
            type="button"
            data-testid="manual-controls-tab"
            onClick={() => openDiagnostics('controls')}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10 hover:text-white"
            title="Open Manual PLC Controls & Strategy Benchmark"
          >
            <SlidersHorizontal size={11} />
            <span>PLC &amp; Benchmark ↗</span>
          </button>
        </div>

        {/* 3-Step Story Pipeline Stepper: 1. Photo -> Twin | 2. 3D Line Diff | 3. Param Testing */}
        <div
          data-testid="workflow-stepper"
          className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/45 p-1"
        >
          {WORKFLOW_STEPS.map((item) => {
            const active = workflowStep === item.step;
            const completed = workflowStep > item.step;
            return (
              <button
                key={item.step}
                type="button"
                data-testid={`workflow-step-${item.step}`}
                onClick={() => setWorkflowStep(item.step)}
                className={cn(
                  'flex flex-col items-start rounded-lg px-2 py-1.5 text-left transition-all',
                  active
                    ? 'border border-emerald-400/50 bg-emerald-500/20 text-white shadow-sm'
                    : completed
                      ? 'bg-emerald-500/5 text-emerald-300 hover:bg-white/5'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-[10px] font-bold',
                    active ? 'text-emerald-300' : completed ? 'text-emerald-400' : 'text-slate-300',
                  )}
                >
                  {item.shortTitle}
                </span>
                <span className="text-[9px] text-slate-400">{item.subtitle}</span>
              </button>
            );
          })}
        </div>

        {/* Compact 1-Row Scenario Selector Pill Bar (A, B, C, D) */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/35 p-1">
          {CHANGEOVER_PRESETS.map((p) => {
            const selected = selectedPresetId === p.id;
            const shortTitle =
              p.code === 'A'
                ? 'A. Surge'
                : p.code === 'B'
                  ? 'B. Mixed'
                  : p.code === 'C'
                    ? 'C. Tray'
                    : 'D. Overload';
            return (
              <button
                key={p.id}
                type="button"
                data-testid={`preset-${p.id}`}
                onClick={() => activatePresetWithPreload(p.id)}
                className={cn(
                  'flex-1 rounded-lg px-2 py-1.5 text-center font-mono text-[10px] font-bold transition-all',
                  selected
                    ? 'border border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-xs'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
                title={`${p.code}. ${p.title} — ${p.sceneBadge}`}
              >
                {shortTitle}
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            STEP 1: PHOTO OF INDUSTRIAL LINE <-> LIVE 3D DIGITAL TWIN SPLIT
           ===================================================================== */}
        {workflowStep === 1 && (
          <div data-testid="step-1-photo-panel" className="space-y-2.5">
            {/* Interactive Photo <-> Live 3D Sim Split Viewport */}
            <div className="overflow-hidden rounded-xl border border-white/12 bg-black/50">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Camera size={12} className="text-sky-400" />
                  <span className="font-mono text-[9.5px] font-bold tracking-wider text-sky-200 uppercase">
                    Photo ↔ 3D Split ({splitPct}%)
                  </span>
                  <div className="ml-1 inline-flex rounded border border-white/15 bg-black/40 p-0.5 font-mono text-[8.5px]">
                    <button
                      type="button"
                      data-testid="photo-toggle-packing"
                      onClick={() => setPhotoPreviewKind('packing')}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-bold transition-colors',
                        photoPreviewKind !== 'weeder'
                          ? 'bg-sky-500/30 text-sky-200'
                          : 'text-slate-400 hover:text-white',
                      )}
                    >
                      📦 Packing
                    </button>
                    <button
                      type="button"
                      data-testid="photo-toggle-weeder"
                      onClick={() => setPhotoPreviewKind('weeder')}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-bold transition-colors',
                        photoPreviewKind === 'weeder'
                          ? 'bg-emerald-500/30 text-emerald-200'
                          : 'text-slate-400 hover:text-white',
                      )}
                    >
                      🌿 Weeder
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="scan-photo-btn"
                  onClick={handleScanFactoryPhoto}
                  disabled={isScanningPhoto}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  {isScanningPhoto ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <ScanLine size={10} />
                  )}
                  <span>{isScanningPhoto ? 'Scanning...' : 'Gemini Vision Scan'}</span>
                </button>
              </div>

              {/* Split Comparison Stage: Right = Live 30fps 3D Robot Canvas Mirror | Left = Factory Photo */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950 select-none">
                {/* Base Layer (Revealed as you slide left): LIVE 3D Robot Simulation Mirror */}
                <div className="absolute inset-0">
                  <Live3DSimMirrorCanvas />
                  <span className="pointer-events-none absolute top-2 right-2 rounded bg-emerald-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 border border-emerald-400/40">
                    LIVE 3D SIM ({pickPlace.strategy.toUpperCase()} · {pickPlace.conveyorSpeed.toFixed(2)} m/s)
                  </span>
                </div>

                {/* Top Clipped Layer (Left 0..splitPct%): Physical Factory Line Photo */}
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                >
                  <img
                    src={
                      photoPreviewKind === 'weeder'
                        ? '/weeding-line-photo.png'
                        : '/factory-line-photo.png'
                    }
                    alt={
                      photoPreviewKind === 'weeder'
                        ? 'Physical agricultural autonomous weeding robot field photo'
                        : 'Physical factory delta robot packing cell #04'
                    }
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-slate-950/20" />

                  <span className="absolute top-2 left-2 rounded border border-amber-400/40 bg-amber-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">
                    {photoScanned
                      ? photoPreviewKind === 'weeder'
                        ? 'SCANNED WEEDER RIG PHOTO'
                        : 'SCANNED CELL #04 PHOTO'
                      : photoPreviewKind === 'weeder'
                        ? 'RAW WEEDER RIG PHOTO (UNSCANNED)'
                        : 'RAW CELL #04 PHOTO (UNSCANNED)'}
                  </span>

                  {/* Laser scanning indicator while Gemini Vision is scanning */}
                  {isScanningPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-sky-950/40 backdrop-blur-[1px]">
                      <div className="rounded-lg border border-sky-400/60 bg-slate-950/90 px-3 py-1.5 font-mono text-[10px] font-bold text-sky-200 shadow-lg">
                        🔍 Gemini Vision detecting robot &amp; geometry...
                      </div>
                    </div>
                  )}

                  {/* CV Bounding Boxes ONLY appear AFTER clicking Gemini Vision Scan */}
                  {photoScanned && (
                    <>
                      {/* CV Box 1: Delta Robot Kinematic Frame */}
                      <div
                        data-testid="cv-detected-robot-box"
                        className="absolute top-[12%] left-[12%] h-[68%] w-[36%] rounded border-2 border-emerald-400/90 bg-emerald-500/10 shadow-[0_0_12px_rgba(52,211,153,0.35)]"
                      >
                        <span className="absolute -top-2 left-1.5 rounded bg-emerald-400 px-1 py-0.2 font-mono text-[8px] font-bold text-slate-950">
                          {photoPreviewKind === 'weeder'
                            ? '✓ LASER WEEDER · 10g'
                            : '✓ DELTA PICKER · 6g'}
                        </span>
                      </div>

                      {/* CV Box 2: Secondary Unit / Vision Head */}
                      <div className="absolute top-[16%] left-[52%] h-[52%] w-[28%] rounded border-2 border-sky-400/90 bg-sky-500/10">
                        <span className="absolute -top-2 left-1 rounded bg-sky-400 px-1 py-0.2 font-mono text-[8px] font-bold text-slate-950">
                          {photoPreviewKind === 'weeder'
                            ? '✓ CROP VISION ARRAY'
                            : '✓ TRAY PLACER #02'}
                        </span>
                      </div>

                      {/* CV Box 3: Infeed Belt & Trays */}
                      <div className="absolute right-[8%] bottom-[6%] left-[8%] flex items-center justify-between rounded border border-amber-400/80 bg-black/75 px-2 py-0.5">
                        <span className="font-mono text-[8.5px] font-bold text-amber-300">
                          {photoPreviewKind === 'weeder'
                            ? '✓ LETTUCE CROP ROWS → WEED TARGETING'
                            : '✓ INFEED BELT → MULTI-SLOT TRAYS'}
                        </span>
                        <span className="font-mono text-[8px] font-bold text-emerald-300">
                          3D TWIN MAPPED
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Vertical Split Divider Handle */}
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                  style={{ left: `${splitPct}%` }}
                >
                  <div className="absolute top-1/2 -left-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-slate-900/90 text-white shadow-md">
                    <MoveHorizontal size={11} />
                  </div>
                </div>
              </div>

              {/* Interactive Split Slider + Quick View Presets */}
              <div className="space-y-1.5 border-t border-white/10 bg-black/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9.5px] font-semibold text-amber-300">Photo</span>
                  <input
                    type="range"
                    data-testid="photo-twin-slider"
                    min={0}
                    max={100}
                    value={splitPct}
                    onChange={(e) => setSplitPct(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-ew-resize accent-emerald-400"
                    aria-label="Slide between factory photo and live 3D simulation"
                  />
                  <span className="font-mono text-[9.5px] font-semibold text-emerald-300">
                    Live 3D Sim
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="split-photo-only-btn"
                      onClick={() => setSplitPct(100)}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold transition-colors',
                        splitPct >= 95
                          ? 'bg-amber-500/25 text-amber-200'
                          : 'bg-white/5 text-slate-400 hover:text-white',
                      )}
                    >
                      100% Photo
                    </button>
                    <button
                      type="button"
                      data-testid="split-50-btn"
                      onClick={() => setSplitPct(50)}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold transition-colors',
                        splitPct > 10 && splitPct < 90
                          ? 'bg-sky-500/25 text-sky-200'
                          : 'bg-white/5 text-slate-400 hover:text-white',
                      )}
                    >
                      50/50 Split
                    </button>
                    <button
                      type="button"
                      data-testid="split-sim-only-btn"
                      onClick={() => setSplitPct(0)}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold transition-colors',
                        splitPct <= 5
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'bg-white/5 text-slate-400 hover:text-white',
                      )}
                    >
                      100% Live 3D Sim
                    </button>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[9px] font-semibold',
                      photoScanned ? 'text-emerald-300' : 'text-amber-300',
                    )}
                    title={visionSummary.robotType}
                  >
                    {photoScanned ? '✓ Vision Calibrated' : 'Click Scan ↑'}
                  </span>
                </div>
              </div>
            </div>

            {/* Full, Unclipped Change Order Card */}
            <div className="rounded-xl border border-white/12 bg-black/40 p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
                  Change Order · Scenario {activePreset.code} ({activePreset.title})
                </span>
                <button
                  type="button"
                  onClick={() => setCustomPromptOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <Edit3 size={9} />
                  <span>{customPromptOpen ? 'Hide' : 'Edit'}</span>
                </button>
              </div>

              <p
                data-testid="full-change-order-text"
                className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-[11px] leading-relaxed text-slate-100"
              >
                “{draftPrompt}”
              </p>

              {customPromptOpen && (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    data-testid="changeover-prompt-input"
                    rows={3}
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    placeholder="Describe the production change..."
                    className="w-full rounded-lg border border-white/15 bg-black/60 p-2 text-[11px] leading-relaxed text-white placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      data-testid="parse-prompt-btn"
                      onClick={handleInterpretPrompt}
                      disabled={isParsing}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
                    >
                      {isParsing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Wand2 size={11} />
                      )}
                      <span>Parse Custom Change Order</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 1 -> Step 2 CTA */}
            <button
              type="button"
              data-testid="next-to-step-2"
              onClick={() => {
                previewUnadjustedChangeOnLine();
                setWorkflowStep(2);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400"
            >
              <span>Step 2: Inspect 3D Line Changes</span>
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* =====================================================================
            STEP 2: 3D DIGITAL TWIN SIMULATION (WATCH WHAT CHANGES)
           ===================================================================== */}
        {workflowStep === 2 && (
          <div data-testid="step-2-sim-panel" className="space-y-2.5">
            {/* Spacious, Zero-Truncation "What Scenario X Changes on the Line" Card */}
            <div
              data-testid="scenario-changes-card"
              className="rounded-xl border border-sky-400/35 bg-sky-500/[0.08] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Layers size={13} className="text-sky-300" />
                  <span className="font-mono text-[10.5px] font-bold tracking-wider text-sky-200 uppercase">
                    What Scenario {activePreset.code} Changes on the 3D Line
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {activePreset.scenarioChanges.map((item) => (
                  <div
                    key={item.param}
                    className="rounded-lg border border-white/8 bg-black/40 px-2.5 py-1.5"
                  >
                    <div className="mb-0.5 flex items-center justify-between font-mono text-[10px]">
                      <span className="font-semibold text-slate-300">{item.param}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.2 text-[8.5px] font-bold uppercase',
                          item.impact === 'changed'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : item.impact === 'warning'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-sky-500/15 text-sky-300',
                        )}
                      >
                        {item.impact === 'changed'
                          ? 'Changed Workload'
                          : item.impact === 'warning'
                            ? 'Bottleneck Risk'
                            : 'Locked Constraint'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-slate-400 line-through">{item.before}</span>
                      <ArrowRight size={11} className="shrink-0 text-slate-500" />
                      <span
                        className={cn(
                          'font-bold',
                          item.impact === 'changed'
                            ? 'text-emerald-300'
                            : item.impact === 'warning'
                              ? 'text-amber-300'
                              : 'text-sky-200',
                        )}
                      >
                        {item.after}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive 3D Simulation State Toggle */}
            <div className="rounded-xl border border-white/12 bg-black/40 p-2.5 space-y-2">
              <div className="font-mono text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                Compare Unadjusted vs. SHIFT Recipe on 3D Belt
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="preview-unadjusted-3d-btn"
                  onClick={previewUnadjustedChangeOnLine}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-2 text-left transition-all',
                    comparisonReplayView === 'before'
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                  )}
                >
                  <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-300">
                    <AlertTriangle size={11} />
                    <span>Unadjusted Line</span>
                  </div>
                  <span className="mt-0.5 text-[9.5px] leading-tight text-slate-300">
                    {activePreset.baselineLineConfig.strategy.toUpperCase()} pick ·{' '}
                    {baseMetrics ? `${baseMetrics.missed} items missed` : 'Drops items'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="preview-nominal-3d-btn"
                  onClick={() => {
                    if (isRecommended) {
                      applyRecommendedConfig();
                    } else {
                      set('pickPlace', structuredClone(INITIAL_LINE_CONFIG));
                      set('comparisonReplayView', 'none');
                      set('epoch', useApp.getState().epoch + 1);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-2 text-left transition-all',
                    comparisonReplayView === 'after' || hasAppliedActiveRecommendation
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                  )}
                >
                  <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-300">
                    <CheckCircle2 size={11} />
                    <span>{isRecommended ? 'SHIFT Fixed Recipe' : 'Nominal EDF Line'}</span>
                  </div>
                  <span className="mt-0.5 text-[9.5px] leading-tight text-slate-300">
                    EDF Front-First · {recMetrics ? `${recMetrics.missed} missed` : '0 missed'}
                  </span>
                </button>
              </div>
            </div>

            {/* Step 2 Navigation Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWorkflowStep(1)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={13} />
                <span>Step 1</span>
              </button>
              <button
                type="button"
                data-testid="next-to-step-3"
                onClick={() => setWorkflowStep(3)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400"
              >
                <span>Step 3: Parameter Testing &amp; Apply</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            STEP 3: AUTONOMOUS PARAMETER TESTING & VERIFICATION LOOP
           ===================================================================== */}
        {workflowStep === 3 && (
          <div data-testid="step-3-testing-panel" className="space-y-2">
            {/* Run Live Gemini / Instant Replay Action Row */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="test-alternatives-btn"
                onClick={() => runChangeoverEvaluation(false)}
                disabled={isEvaluating}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-bold transition-all',
                  isEvaluating
                    ? 'cursor-wait bg-emerald-500/30 text-emerald-200'
                    : 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-400',
                )}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Gemini Testing Candidates...</span>
                  </>
                ) : (
                  <>
                    <Play size={13} fill="currentColor" />
                    <span>
                      {agentBackendStatus.liveAvailable
                        ? 'Run Live Gemini Agent'
                        : 'Run Parameter Testing'}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="run-replay-btn"
                onClick={() => runChangeoverEvaluation(true)}
                disabled={isEvaluating}
                className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-white/5 px-2.5 py-2 font-mono text-[10px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                title="Run instant deterministic simulation verification"
              >
                <History size={12} />
                <span>Instant Sim</span>
              </button>

              <button
                type="button"
                onClick={() => setSpecExpanded((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-white/5 px-2 py-2 font-mono text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"
                title="Edit allowed parameter bounds & success criteria"
              >
                <span>Bounds</span>
                {specExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            </div>

            {/* Optional Expandable Bounds Editor */}
            {specExpanded && (
              <div
                data-testid="structured-spec-card"
                className="space-y-1.5 rounded-xl border border-white/10 bg-black/50 p-2.5 text-[10px]"
              >
                <div className="flex items-center justify-between font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-amber-300/90">
                    <Lock size={9} /> Fixed: 6g Robot Limits · Yaw Align ON
                  </span>
                  <span>
                    Target: ≥{structuredRequest.successCriteria.minCompletionRatePct}% · ≤
                    {structuredRequest.successCriteria.maxMissedItems} missed
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ALL_EDITABLE_PARAMS.map((param) => {
                    const active = structuredRequest.editableParameters.includes(param.id);
                    return (
                      <button
                        key={param.id}
                        type="button"
                        onClick={() => toggleEditableParam(param.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px]',
                          active
                            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                            : 'border-white/8 bg-white/[0.02] text-slate-500',
                        )}
                      >
                        {active && <Check size={8} />}
                        {param.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Agent Reasoning & Candidate Matrix Strip */}
            {(isEvaluating || activities.length > 0 || candidates.length > 0) && (
              <div
                data-testid="agent-activity-log"
                className="rounded-xl border border-white/10 bg-black/40 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between font-mono text-[9.5px] text-slate-400">
                  <span className="font-bold text-slate-200 uppercase">
                    6-Tool Candidate Simulation Loop
                  </span>
                  <span>{candidates.length} Candidates Tested</span>
                </div>

                {/* Candidate Comparison Pills */}
                <div className="grid grid-cols-5 gap-1 pt-0.5">
                  {baselineRun?.metrics && (
                    <div className="flex flex-col rounded-lg border border-amber-400/30 bg-amber-500/10 px-1.5 py-1 font-mono text-[9px]">
                      <span className="text-[8px] text-amber-200 uppercase">Baseline</span>
                      <span className="font-bold text-amber-300">
                        {baselineRun.metrics.completionRatePct}%
                      </span>
                      <span className="text-[8px] text-slate-400">
                        {baselineRun.metrics.missed} miss
                      </span>
                    </div>
                  )}
                  {candidates.map((cand, idx) => {
                    const isWinner = activeSession?.recommendedRunId === cand.runId;
                    const m = cand.metrics;
                    return (
                      <div
                        key={cand.runId}
                        data-testid={`candidate-card-${cand.runId}`}
                        className={cn(
                          'flex flex-col rounded-lg border px-1.5 py-1 font-mono text-[9px]',
                          !cand.validation.valid
                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                            : isWinner
                              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                              : cand.meetsSuccessCriteria
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 bg-white/5 text-slate-300',
                        )}
                      >
                        <span className="text-[8px] uppercase">
                          C{idx + 1} {isWinner ? '★' : ''}
                        </span>
                        <span className="font-bold">
                          {cand.validation.valid && m ? `${m.completionRatePct}%` : 'REJ'}
                        </span>
                        <span className="text-[8px] opacity-80">
                          {cand.validation.valid && m ? `${m.missed} miss` : 'Bounds'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Verified Recommendation / Rejection Card */}
            {activeSession && (
              <div
                data-testid="comparison-dock"
                className={cn(
                  'rounded-xl border p-2.5 space-y-2',
                  isRecommended
                    ? 'border-emerald-400/40 bg-emerald-950/25'
                    : 'border-rose-400/40 bg-rose-950/25',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    {isRecommended ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 uppercase">
                        <CheckCircle2 size={11} />
                        Recommended: {activeSession.recommendedRunId?.toUpperCase()}
                      </span>
                    ) : (
                      <span
                        data-testid="infeasible-banner"
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-300 uppercase"
                      >
                        <AlertOctagon size={11} />
                        Rejected — Infeasible Workload
                      </span>
                    )}
                  </div>

                  <span
                    data-testid="session-mode-badge"
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold',
                      activeSession.mode === 'live_gemini'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300',
                    )}
                  >
                    {activeSession.mode === 'live_gemini' ? (
                      <>
                        <Cpu size={9} /> Live Gemini
                      </>
                    ) : (
                      <>
                        <History size={9} /> Verified Sim
                      </>
                    )}
                  </span>
                </div>

                {/* Held-out Verification Proof */}
                {heldOut && (
                  <div className="flex items-center justify-between rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1 font-mono text-[9.5px] text-sky-200">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <ShieldCheck size={11} className="text-sky-400" />
                      Held-Out ({heldOut.sampleCount} seeds):
                    </span>
                    <span className="font-bold">
                      {heldOut.baseline.completionRatePct.mean}% → {heldOut.finalist.completionRatePct.mean}% [
                      {heldOut.finalist.completionRatePct.min}–{heldOut.finalist.completionRatePct.max}%]
                    </span>
                  </div>
                )}

                {/* Before vs After KPIs */}
                {baseMetrics && recMetrics && (
                  <div className="grid grid-cols-4 gap-1 text-center font-mono">
                    <div className="rounded-lg border border-white/8 bg-black/45 px-1.5 py-1">
                      <div className="text-[8.5px] text-slate-400">Completion</div>
                      <div className="text-[10.5px] font-bold">
                        <span className="text-amber-300">{baseMetrics.completionRatePct}%</span>
                        <span className="mx-0.5 text-slate-500">→</span>
                        <span
                          className={isRecommended ? 'text-emerald-300' : 'text-rose-300'}
                        >
                          {recMetrics.completionRatePct}%
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-black/45 px-1.5 py-1">
                      <div className="text-[8.5px] text-slate-400">Missed</div>
                      <div className="text-[10.5px] font-bold">
                        <span className="text-rose-300">{baseMetrics.missed}</span>
                        <span className="mx-0.5 text-slate-500">→</span>
                        <span
                          className={
                            recMetrics.missed <= structuredRequest.successCriteria.maxMissedItems
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }
                        >
                          {recMetrics.missed}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-black/45 px-1.5 py-1">
                      <div className="text-[8.5px] text-slate-400">Placed</div>
                      <div className="text-[10.5px] font-bold">
                        <span className="text-slate-300">{baseMetrics.placed}</span>
                        <span className="mx-0.5 text-slate-500">→</span>
                        <span className="text-white">
                          {recMetrics.placed}/{recMetrics.offered}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-black/45 px-1.5 py-1">
                      <div className="text-[8.5px] text-slate-400">Picks/m</div>
                      <div className="text-[10.5px] font-bold">
                        <span className="text-slate-300">{baseMetrics.throughputPpm}</span>
                        <span className="mx-0.5 text-slate-500">→</span>
                        <span className="text-emerald-300">{recMetrics.throughputPpm}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Parameter Diff Pills */}
                {activeSession.configDiff.length > 0 && (
                  <div data-testid="config-diff-list" className="flex flex-wrap gap-1">
                    {activeSession.configDiff.map((d) => (
                      <span
                        key={d.parameter}
                        className="inline-flex items-center gap-1 rounded border border-emerald-400/25 bg-black/45 px-1.5 py-0.5 font-mono text-[9.5px]"
                      >
                        <span className="text-slate-400">{d.label}:</span>
                        <span className="text-rose-300/90 line-through">{String(d.before)}</span>
                        <ArrowRight size={8} className="text-slate-500" />
                        <span className="font-bold text-emerald-300">{String(d.after)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Full, Unclipped Agent Recommendation Text */}
                <p className="text-[10.5px] leading-snug text-slate-200">
                  {isRejected && activeSession.failureAnalysis
                    ? activeSession.failureAnalysis
                    : activeSession.agentExplanation}
                </p>

                {/* Primary Commit Actions: Apply, Undo, Replay 3D */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  {isRecommended && (
                    <button
                      type="button"
                      data-testid="apply-config-button"
                      onClick={() => {
                        playElevenLabsEvent('apply');
                        applyRecommendedConfig();
                      }}
                      disabled={hasAppliedActiveRecommendation}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all',
                        hasAppliedActiveRecommendation
                          ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                          : 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-300',
                      )}
                    >
                      <Check size={13} />
                      <span>
                        {hasAppliedActiveRecommendation
                          ? 'Applied to Live 3D Line'
                          : 'Apply Configuration'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="undo-config-button"
                    onClick={undoAppliedConfig}
                    disabled={appliedConfigHistory.length === 0}
                    className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-white/5 px-2.5 py-2 font-mono text-[10px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-35"
                  >
                    <Undo2 size={11} />
                    <span>Undo</span>
                  </button>

                  <button
                    type="button"
                    data-testid="replay-comparison-button"
                    onClick={toggleReplayComparison}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 font-mono text-[10px] font-semibold transition-colors',
                      comparisonReplayView !== 'none'
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10',
                    )}
                  >
                    <Repeat size={11} />
                    <span>
                      {comparisonReplayView === 'before'
                        ? 'Before View'
                        : comparisonReplayView === 'after'
                          ? 'After View'
                          : 'Replay 3D'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="export-session-json"
                    onClick={exportEvidenceJson}
                    className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                    title="Export full changeover evidence JSON"
                  >
                    <Download size={11} />
                  </button>
                </div>

                {/* Deep-dive Modal Trigger */}
                <button
                  type="button"
                  data-testid="open-full-evidence-btn"
                  onClick={() => openDiagnostics('candidates')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 font-mono text-[10px] font-medium text-sky-300 hover:bg-white/[0.08]"
                >
                  <BarChart3 size={11} />
                  <span>Open Full Candidate Matrix &amp; Benchmark Center ↗</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
