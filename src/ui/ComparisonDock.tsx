import {
  AlertOctagon,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  History,
  Repeat,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';

export function ComparisonDock() {
  const {
    activeSession,
    appliedConfigHistory,
    hasAppliedActiveRecommendation,
    comparisonReplayView,
    applyRecommendedConfig,
    undoAppliedConfig,
    toggleReplayComparison,
  } = useApp();

  if (!activeSession) return null;

  const isRecommended = activeSession.status === 'recommended' && !!activeSession.recommendedConfig;
  const baseMetrics = activeSession.baselineRun.metrics;
  const recRun = activeSession.recommendedRunId
    ? activeSession.candidateRuns.find((r) => r.runId === activeSession.recommendedRunId) ?? null
    : // For infeasible runs, show the best valid candidate attempt in comparison
      [...activeSession.candidateRuns]
        .filter((r) => r.validation.valid && r.metrics)
        .sort((a, b) => (b.metrics?.placed ?? 0) - (a.metrics?.placed ?? 0))[0] ?? null;
  const recMetrics = recRun?.metrics ?? null;
  const heldOut = activeSession.heldOutEvaluation;

  const exportEvidenceJson = () => {
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
    <section
      data-testid="comparison-dock"
      className="pointer-events-auto glass flex flex-1 flex-col gap-2 rounded-2xl p-3"
    >
      {/* Top Status & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="session-status-badge"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold uppercase',
              isRecommended
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/20 text-rose-300',
            )}
          >
            {isRecommended ? (
              <>
                <CheckCircle2 size={13} />
                <span>Recommended: {recRun?.label || activeSession.recommendedRunId}</span>
              </>
            ) : (
              <>
                <AlertOctagon size={13} />
                <span>Changeover Rejected — Infeasible Workload</span>
              </>
            )}
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px]',
              activeSession.mode === 'live_gemini'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            )}
          >
            {activeSession.mode === 'live_gemini' ? <Cpu size={11} /> : <History size={11} />}
            <span>
              {activeSession.mode === 'live_gemini'
                ? `LIVE GEMINI (${activeSession.modelId})`
                : 'RECORDED SIMULATION REPLAY'}
            </span>
          </span>

          {heldOut && (
            <span
              data-testid="heldout-summary-badge"
              className="inline-flex items-center gap-1 rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-200"
            >
              <ShieldCheck size={11} />
              <span className="tabular">
                Held-out ({heldOut.sampleCount} seeds): {heldOut.baseline.completionRatePct.mean}% →{' '}
                {heldOut.finalist.completionRatePct.mean}% [{heldOut.finalist.completionRatePct.min}–
                {heldOut.finalist.completionRatePct.max}%]
              </span>
            </span>
          )}
        </div>

        {/* Engineer Approval & Comparison Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isRecommended && (
            <button
              type="button"
              data-testid="apply-config-btn"
              disabled={hasAppliedActiveRecommendation}
              onClick={applyRecommendedConfig}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition-all',
                hasAppliedActiveRecommendation
                  ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                  : 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-400',
              )}
            >
              <Check size={14} />
              <span>{hasAppliedActiveRecommendation ? 'Applied to Live Line' : 'Apply Configuration'}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="undo-config-btn"
            disabled={appliedConfigHistory.length === 0}
            onClick={undoAppliedConfig}
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            <Undo2 size={13} />
            <span>Undo</span>
          </button>

          <button
            type="button"
            data-testid="replay-comparison-btn"
            onClick={toggleReplayComparison}
            className={cn(
              'inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              comparisonReplayView === 'before'
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10',
            )}
          >
            <Repeat size={13} />
            <span>
              {comparisonReplayView === 'before'
                ? 'Viewing Before (Click for After)'
                : 'Replay Comparison'}
            </span>
          </button>

          <button
            type="button"
            data-testid="export-evidence-btn"
            onClick={exportEvidenceJson}
            title="Download full simulation evidence JSON"
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
          >
            <Download size={13} />
            <span className="hidden sm:inline">JSON</span>
          </button>
        </div>
      </div>

      {/* Metrics Comparison Table + Configuration Diff */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        {/* Before vs After Measured Metrics */}
        {baseMetrics && recMetrics && (
          <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-6 lg:col-span-7">
            <MetricDeltaCell
              label="Completion"
              before={`${baseMetrics.completionRatePct}%`}
              after={`${recMetrics.completionRatePct}%`}
              positive={recMetrics.completionRatePct >= baseMetrics.completionRatePct}
            />
            <MetricDeltaCell
              label="Placed / Offered"
              before={`${baseMetrics.placed}/${baseMetrics.offered}`}
              after={`${recMetrics.placed}/${recMetrics.offered}`}
              positive={recMetrics.placed >= baseMetrics.placed}
            />
            <MetricDeltaCell
              label="Missed Items"
              before={String(baseMetrics.missed)}
              after={String(recMetrics.missed)}
              positive={recMetrics.missed <= baseMetrics.missed}
            />
            <MetricDeltaCell
              label="Throughput"
              before={`${baseMetrics.throughputPpm}`}
              after={`${recMetrics.throughputPpm} /m`}
              positive={recMetrics.throughputPpm >= baseMetrics.throughputPpm}
            />
            <MetricDeltaCell
              label="Full Trays"
              before={String(baseMetrics.traysFilled)}
              after={String(recMetrics.traysFilled)}
              positive={recMetrics.traysFilled >= baseMetrics.traysFilled}
            />
            <MetricDeltaCell
              label="Unfinished"
              before={String(baseMetrics.unfinished)}
              after={String(recMetrics.unfinished)}
              positive={recMetrics.unfinished <= baseMetrics.unfinished}
            />
          </div>
        )}

        {/* Configuration Diff + Agent Rationale */}
        <div className="flex flex-col justify-between gap-1.5 rounded-xl border border-white/8 bg-black/30 px-2.5 py-2 lg:col-span-5">
          {activeSession.configDiff.length > 0 ? (
            <div data-testid="config-diff-list" className="flex flex-wrap items-center gap-1">
              <span className="mr-1 font-mono text-[10px] font-semibold text-slate-400 uppercase">
                Diff:
              </span>
              {activeSession.configDiff.map((d) => (
                <span
                  key={d.parameter}
                  className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200"
                >
                  <span className="text-slate-400">{d.label}:</span>
                  <span className="text-slate-300 line-through">{String(d.before)}</span>
                  <ArrowRight size={9} className="text-emerald-400" />
                  <span className="font-bold text-white">
                    {String(d.after)}
                    {d.unit ? ` ${d.unit}` : ''}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-amber-300">
              No configuration change applied — single-picker capacity limit reached.
            </div>
          )}

          <p
            data-testid="agent-explanation-text"
            className="line-clamp-2 text-[11px] leading-snug text-slate-300"
            title={activeSession.agentExplanation}
          >
            {activeSession.agentExplanation}
          </p>

          <div className="flex items-center justify-between text-[9.5px] text-slate-500">
            <span>
              Before = old config under new workload ({baseMetrics?.offered ?? 0} identical arrivals)
            </span>
            <span>
              IK exact · Peak torque {recMetrics?.peakTorqueNm ?? baseMetrics?.peakTorqueNm ?? 0} Nm (est.)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricDeltaCell({
  label,
  before,
  after,
  positive,
}: {
  label: string;
  before: string;
  after: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/30 px-2 py-1.5">
      <div className="truncate text-[10px] text-slate-400">{label}</div>
      <div className="tabular mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 font-mono">
        <span className="text-[11px] text-slate-400">{before}</span>
        <ArrowRight size={10} className="shrink-0 text-slate-500" />
        <span
          className={cn(
            'text-[13px] font-bold',
            positive ? 'text-emerald-300' : 'text-rose-300',
          )}
        >
          {after}
        </span>
      </div>
    </div>
  );
}
