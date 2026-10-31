import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  Eye,
  History,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { sim } from '@/state/simHandle';
import { useApp, type CameraMode, type DiagnosticsTab, type ViewOptions } from '@/state/store';
import { cn, fmt } from '@/lib/utils';
import { JointChart } from './JointChart';
import { ControlPanel } from './ControlPanel';
import { BenchmarkPanel } from './Benchmark';
import { usePoll } from './usePoll';

const TABS: { id: DiagnosticsTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'candidates', label: 'Candidate Matrix & Replay Center', icon: BarChart3 },
  { id: 'telemetry', label: 'Robot Telemetry & Joint Dynamics', icon: Activity },
  { id: 'controls', label: 'Manual Line Controls & Benchmark', icon: SlidersHorizontal },
];

const CAMERAS: { id: CameraMode; label: string }[] = [
  { id: 'follow', label: 'Follow Action' },
  { id: 'robot', label: 'Robot Close-Up' },
  { id: 'top', label: 'Top Plan View' },
  { id: 'free', label: 'Free Orbit' },
];

const OVERLAYS: { key: keyof ViewOptions; label: string }[] = [
  { key: 'workspace', label: 'Reachable Workspace' },
  { key: 'path', label: 'Effector Trajectory' },
  { key: 'vision', label: 'Vision Zone Box' },
  { key: 'markers', label: 'Target Slot Markers' },
];

export function DiagnosticsCenterModal() {
  usePoll(8);
  const {
    diagnosticsOpen,
    diagnosticsTab,
    set,
    activeSession,
    streamingCandidates,
    streamingActivities,
    hasAppliedActiveRecommendation,
    appliedConfigHistory,
    comparisonReplayView,
    applyRecommendedConfig,
    undoAppliedConfig,
    toggleReplayComparison,
    previewUnadjustedChangeOnLine,
    camera,
    view,
    setView,
  } = useApp();

  if (!diagnosticsOpen) return null;

  const scenario = sim.scenario;
  const liveMetrics = scenario ? scenario.metrics() : [];
  const candidates = activeSession ? activeSession.candidateRuns : streamingCandidates;
  const activities = activeSession ? activeSession.activities : streamingActivities;
  const baselineRun = activeSession?.baselineRun ?? null;
  const heldOut = activeSession?.heldOutEvaluation ?? null;
  const isRecommended =
    activeSession?.status === 'recommended' && !!activeSession?.recommendedConfig;

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
    <div
      data-testid="diagnostics-center-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={() => set('diagnosticsOpen', false)}
    >
      <div
        className="glass flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header & Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-white uppercase">
                SHIFT · Statistics, Detailed Controls &amp; Replay Center
              </span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                PACKING CELL #04
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Deep-dive candidate simulation matrix, held-out seed statistics, 3-axis joint dynamics, and manual PLC parameters.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-black/40 p-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = diagnosticsTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`diag-tab-${t.id}`}
                    onClick={() => set('diagnosticsTab', t.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                      active
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-white',
                    )}
                  >
                    <Icon size={13} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="close-diagnostics-btn"
              onClick={() => set('diagnosticsOpen', false)}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              title="Close (Return to 3D Production Line)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {diagnosticsTab === 'candidates' && (
            <div className="space-y-4">
              {/* Replay & Action Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <div>
                  <div className="text-[12px] font-semibold text-white">
                    3D Production Line Replay &amp; Recipe Application
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Switch the live 3D workcell between the unadjusted baseline under the new workload and the SHIFT-verified recipe.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      previewUnadjustedChangeOnLine();
                      set('diagnosticsOpen', false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25"
                  >
                    <AlertTriangle size={13} />
                    <span>Watch Before SHIFT in 3D</span>
                  </button>

                  {activeSession && (
                    <>
                      {isRecommended && (
                        <button
                          type="button"
                          onClick={() => {
                            applyRecommendedConfig();
                            set('diagnosticsOpen', false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
                        >
                          <Check size={13} />
                          <span>
                            {hasAppliedActiveRecommendation
                              ? 'Applied (View in 3D)'
                              : 'Apply Recommended & View 3D'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          toggleReplayComparison();
                          set('diagnosticsOpen', false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10"
                      >
                        <Repeat size={13} />
                        <span>
                          {comparisonReplayView === 'before'
                            ? 'Switch 3D to After'
                            : 'Toggle Before/After in 3D'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={appliedConfigHistory.length === 0}
                        onClick={undoAppliedConfig}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
                      >
                        <Undo2 size={13} />
                        <span>Undo</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportEvidenceJson}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
                      >
                        <Download size={13} />
                        <span>Export Evidence JSON</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!activeSession && candidates.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
                  <History size={28} className="mx-auto mb-2 text-slate-500" />
                  <div className="text-[14px] font-semibold text-slate-200">
                    No Changeover Evaluation Run Yet
                  </div>
                  <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-400">
                    Click &ldquo;Test Alternatives&rdquo; in the right-hand SHIFT panel to run bounded candidate simulations on the pre-generated arrival schedule.
                  </p>
                </div>
              ) : (
                <>
                  {/* Full Candidate Comparison Table */}
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <div className="border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
                      <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-slate-200 uppercase">
                        Bounded Candidate Simulation Matrix (Identical Pre-Generated Arrival Schedule)
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-white/10 font-mono text-[10px] text-slate-400 uppercase">
                            <th className="px-3.5 py-2.5">Run ID / Recipe</th>
                            <th className="px-3 py-2.5">Strategy</th>
                            <th className="px-3 py-2.5">Belt (m/s)</th>
                            <th className="px-3 py-2.5">Tray Mode</th>
                            <th className="px-3 py-2.5 text-right">Placed / Offered</th>
                            <th className="px-3 py-2.5 text-right">Missed</th>
                            <th className="px-3 py-2.5 text-right">Unfinished</th>
                            <th className="px-3 py-2.5 text-right">Completion</th>
                            <th className="px-3 py-2.5 text-right">Picks/min</th>
                            <th className="px-3 py-2.5 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {baselineRun && baselineRun.metrics && (
                            <tr className="bg-white/[0.02]">
                              <td className="px-3.5 py-2.5 font-sans font-medium text-slate-200">
                                Baseline (Old Config under New Workload)
                              </td>
                              <td className="px-3 py-2.5 uppercase text-slate-300">
                                {baselineRun.config.strategy}
                              </td>
                              <td className="tabular px-3 py-2.5 text-slate-300">
                                {baselineRun.config.conveyorSpeed.toFixed(2)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-300">
                                {baselineRun.config.placeMode === 'staticTrays'
                                  ? 'static'
                                  : `${baselineRun.config.trayFlow} ${baselineRun.config.traySync ? 'sync' : `${baselineRun.config.traySpeed}m/s`}`}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right text-white">
                                {baselineRun.metrics.placed} / {baselineRun.metrics.offered}
                              </td>
                              <td
                                className={cn(
                                  'tabular px-3 py-2.5 text-right font-bold',
                                  baselineRun.metrics.missed > 2
                                    ? 'text-rose-400'
                                    : 'text-emerald-300',
                                )}
                              >
                                {baselineRun.metrics.missed}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right text-slate-400">
                                {baselineRun.metrics.unfinished}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right font-bold text-amber-300">
                                {baselineRun.metrics.completionRatePct}%
                              </td>
                              <td className="tabular px-3 py-2.5 text-right text-slate-300">
                                {baselineRun.metrics.throughputPpm}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                  BASELINE
                                </span>
                              </td>
                            </tr>
                          )}

                          {candidates.map((c) => {
                            const isRec = activeSession?.recommendedRunId === c.runId;
                            const rejected = !c.validation.valid;
                            return (
                              <tr
                                key={c.runId}
                                className={cn(
                                  isRec
                                    ? 'bg-emerald-500/10'
                                    : rejected
                                      ? 'bg-rose-500/[0.06]'
                                      : 'hover:bg-white/[0.02]',
                                )}
                              >
                                <td className="px-3.5 py-2.5 font-sans">
                                  <div className="font-semibold text-white">
                                    {c.runId}: {c.label}
                                  </div>
                                  {rejected && (
                                    <div className="text-[10px] text-rose-300">
                                      {c.validation.violations.join(' ')}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 uppercase text-slate-300">
                                  {c.config.strategy}
                                </td>
                                <td className="tabular px-3 py-2.5 text-slate-300">
                                  {c.config.conveyorSpeed.toFixed(2)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-300">
                                  {c.config.placeMode === 'staticTrays'
                                    ? 'static'
                                    : `${c.config.trayFlow} ${c.config.traySync ? 'sync' : `${c.config.traySpeed}m/s`}`}
                                </td>
                                <td className="tabular px-3 py-2.5 text-right text-white">
                                  {c.metrics ? `${c.metrics.placed} / ${c.metrics.offered}` : '—'}
                                </td>
                                <td
                                  className={cn(
                                    'tabular px-3 py-2.5 text-right font-bold',
                                    !c.metrics
                                      ? 'text-slate-500'
                                      : c.metrics.missed > 2
                                        ? 'text-rose-400'
                                        : 'text-emerald-300',
                                  )}
                                >
                                  {c.metrics ? c.metrics.missed : '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-right text-slate-400">
                                  {c.metrics ? c.metrics.unfinished : '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-right font-bold text-white">
                                  {c.metrics ? `${c.metrics.completionRatePct}%` : '—'}
                                </td>
                                <td className="tabular px-3 py-2.5 text-right text-slate-300">
                                  {c.metrics ? c.metrics.throughputPpm : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {isRec ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                                      <CheckCircle2 size={10} /> RECOMMENDED
                                    </span>
                                  ) : rejected ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                                      <XCircle size={10} /> REJECTED
                                    </span>
                                  ) : c.meetsSuccessCriteria ? (
                                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                      PASS
                                    </span>
                                  ) : (
                                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                      BELOW TARGET
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Held-Out Verification & Agent Tool Log */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {heldOut && (
                      <div className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.06] p-4">
                        <div className="mb-2 flex items-center gap-1.5">
                          <ShieldCheck size={15} className="text-sky-300" />
                          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-sky-200 uppercase">
                            Held-Out Arrival Verification ({heldOut.sampleCount} Unseen Seeds:{' '}
                            {heldOut.seeds.join(', ')})
                          </span>
                        </div>
                        <p className="mb-3 text-[11px] text-slate-300">
                          Finalist recipe verified on independent Poisson arrival streams not used during candidate selection.
                        </p>
                        <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
                          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                            <div className="text-[10px] text-slate-400">
                              Baseline Completion (Mean)
                            </div>
                            <div className="tabular mt-0.5 text-[16px] font-bold text-amber-300">
                              {heldOut.baseline.completionRatePct.mean}%
                            </div>
                            <div className="tabular text-[10px] text-slate-400">
                              Range: {heldOut.baseline.completionRatePct.min}–
                              {heldOut.baseline.completionRatePct.max}% · Missed:{' '}
                              {heldOut.baseline.missed.mean}
                            </div>
                          </div>
                          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2.5">
                            <div className="text-[10px] text-emerald-200">
                              Finalist Completion (Mean)
                            </div>
                            <div className="tabular mt-0.5 text-[16px] font-bold text-emerald-300">
                              {heldOut.finalist.completionRatePct.mean}%
                            </div>
                            <div className="tabular text-[10px] text-emerald-200/80">
                              Range: {heldOut.finalist.completionRatePct.min}–
                              {heldOut.finalist.completionRatePct.max}% · Missed:{' '}
                              {heldOut.finalist.missed.mean}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.08em] text-slate-300 uppercase">
                        Agent Tool Trace &amp; Rationale
                      </div>
                      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                        {activities.map((act) => (
                          <div key={act.id} className="flex items-start gap-2 text-[11px]">
                            <span
                              className={cn(
                                'mt-1.5 size-1.5 shrink-0 rounded-full',
                                act.tone === 'good'
                                  ? 'bg-emerald-400'
                                  : act.tone === 'bad'
                                    ? 'bg-rose-400'
                                    : act.tone === 'warn'
                                      ? 'bg-amber-400'
                                      : 'bg-sky-400',
                              )}
                            />
                            <div>
                              <span className="font-mono font-semibold text-white">
                                {act.statusLabel}
                              </span>
                              <span className="ml-1.5 text-slate-400">{act.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {diagnosticsTab === 'telemetry' && (
            <div className="space-y-4">
              {/* Full 8-Metric Live Line Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {liveMetrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-2xl border border-white/10 bg-black/35 px-3.5 py-2.5"
                  >
                    <div className="text-[11px] text-slate-400">{m.label}</div>
                    <div
                      className={cn(
                        'tabular mt-0.5 font-mono text-[20px] font-bold text-white',
                        m.tone === 'bad' && 'text-rose-400',
                        m.tone === 'good' && 'text-emerald-300',
                      )}
                    >
                      {fmt(m.value, m.digits ?? 0)}
                      {m.unit && (
                        <span className="ml-1 text-[12px] font-normal text-slate-400">
                          {m.unit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 3-Axis Joint Angle / Velocity / Torque Chart */}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-slate-200 uppercase">
                    Real-Time 3-Axis Delta Robot Joint Telemetry (Exact IK + Estimated Dynamic Torque)
                  </span>
                </div>
                <div className="flex justify-center">
                  <JointChart />
                </div>
              </div>

              {/* Camera & 3D Scene Visual Overlays */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-300 uppercase">
                    <Eye size={13} className="text-sky-400" />
                    <span>3D Workcell Camera Preset</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {CAMERAS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set('camera', c.id)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors',
                          camera === c.id
                            ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10',
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-2.5 font-mono text-[11px] font-bold text-slate-300 uppercase">
                    Engineering Overlays
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {OVERLAYS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setView({ [o.key]: !view[o.key] })}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors',
                          view[o.key]
                            ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {diagnosticsTab === 'controls' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[12px] text-slate-300">
                <div>
                  <span className="font-semibold text-white">
                    Manual PLC / VFD Override &amp; Multi-Seed Strategy Benchmark
                  </span>{' '}
                  — Adjust conveyor VFD speeds, product mix, tray synchronization, and pick-order policy on the left, or benchmark all 4 scheduling strategies across multiple random seeds on the right.
                </div>
              </div>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <ControlPanel embedded />
                </div>
                <div className="lg:col-span-7">
                  <BenchmarkPanel autoRunOnMount />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
