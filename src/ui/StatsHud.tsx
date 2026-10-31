import { Activity, AlertTriangle, BarChart3, Sprout } from 'lucide-react';
import { sim } from '@/state/simHandle';
import { useApp } from '@/state/store';
import { fmt, cn } from '@/lib/utils';
import { usePoll } from './usePoll';

const STRATEGY_BADGE: Record<string, string> = {
  edf: 'EDF (Front-First)',
  fifo: 'FIFO (Oldest-First)',
  nearest: 'NEAREST (Closest-First)',
  spt: 'SPT (Fastest-First)',
};

export function StatsHud() {
  usePoll(8);
  const mode = useApp((s) => s.mode);
  const pickPlace = useApp((s) => s.pickPlace);
  const weeding = useApp((s) => s.weeding);
  const comparisonReplayView = useApp((s) => s.comparisonReplayView);
  const hasApplied = useApp((s) => s.hasAppliedActiveRecommendation);
  const openDiagnostics = useApp((s) => s.openDiagnostics);

  const s = sim.scenario;
  if (!s) return null;
  const metrics = s.metrics();
  const primaryMetrics = metrics.slice(0, 4);
  const missedCount = metrics.find((m) => m.label === 'Missed')?.value ?? 0;

  return (
    <div
      data-testid="stats-hud"
      className="pointer-events-auto glass flex items-center gap-2.5 rounded-2xl px-3 py-1.5 shadow-xl"
    >
      {/* Line Status & Recipe Pill */}
      <div className="flex flex-col gap-0.5 border-r border-white/10 pr-3">
        {mode === 'weeding' ? (
          <>
            <div className="flex items-center gap-1.5">
              <Sprout size={12} className="text-emerald-400" />
              <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-emerald-300 uppercase">
                AGRI WEEDING FIELD RIG
              </span>
              <span className="tabular ml-1 font-mono text-[10px] text-slate-500">
                t={fmt(s.time, 1)}s
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
              <span className="rounded bg-white/10 px-1 py-0.2 font-semibold text-white uppercase">
                {weeding.field}
              </span>
              <span>{ STRATEGY_BADGE[weeding.strategy] ?? weeding.strategy.toUpperCase() }</span>
              <span className="text-slate-600">·</span>
              <span>{weeding.speed.toFixed(2)} m/s</span>
              <span className="text-slate-600">·</span>
              <span>{weeding.weedDensity}/m²</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {missedCount > 0 ? (
                <AlertTriangle size={12} className="text-rose-400" />
              ) : (
                <span
                  className={cn(
                    'size-2 rounded-full',
                    comparisonReplayView === 'before'
                      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
                  )}
                />
              )}
              <span
                className={cn(
                  'font-mono text-[10px] font-bold tracking-[0.1em] uppercase',
                  missedCount > 0
                    ? 'text-rose-300'
                    : comparisonReplayView === 'before'
                      ? 'text-amber-300'
                      : 'text-emerald-300',
                )}
              >
                {comparisonReplayView === 'before'
                  ? 'BEFORE SHIFT (UNADJUSTED)'
                  : comparisonReplayView === 'after' || hasApplied
                    ? 'WITH SHIFT (APPLIED RECIPE)'
                    : missedCount > 0
                      ? 'OVERFLOW WARNING'
                      : 'LINE NOMINAL'}
              </span>
              <span className="tabular ml-1 font-mono text-[10px] text-slate-500">
                t={fmt(s.time, 1)}s
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
              <span className="rounded bg-white/10 px-1 py-0.2 font-semibold text-white">
                {STRATEGY_BADGE[pickPlace.strategy] ?? pickPlace.strategy.toUpperCase()}
              </span>
              <span>{pickPlace.spawnRate.toFixed(2)}/s</span>
              <span className="text-slate-600">·</span>
              <span>{pickPlace.conveyorSpeed.toFixed(2)} m/s</span>
              <span className="text-slate-600">·</span>
              <span className="capitalize">{pickPlace.mix}</span>
              <span className="text-slate-600">·</span>
              <span>
                {pickPlace.placeMode === 'staticTrays'
                  ? 'static trays'
                  : `${pickPlace.trayFlow}-flow ${pickPlace.traySync ? 'sync' : `${pickPlace.traySpeed.toFixed(2)}m/s`}`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 4 Core Live KPIs */}
      <div className="flex items-center gap-2">
        {primaryMetrics.map((m) => (
          <div
            key={m.label}
            className="min-w-[68px] rounded-xl border border-white/5 bg-black/30 px-2.5 py-1"
          >
            <div className="truncate text-[9.5px] font-medium text-slate-400 uppercase">
              {m.label}
            </div>
            <div
              className={cn(
                'tabular font-mono text-[15px] font-bold text-white',
                m.tone === 'bad' && 'text-rose-400',
                m.tone === 'good' && 'text-emerald-300',
              )}
            >
              {fmt(m.value, m.digits ?? 0)}
              {m.unit && (
                <span className="ml-0.5 text-[10px] font-normal text-slate-400">{m.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* On-Demand Telemetry & Controls Trigger */}
      <button
        type="button"
        onClick={() => openDiagnostics('telemetry')}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
        title="Open joint dynamics charts, robot cycle breakdown, and manual line controls"
      >
        <Activity size={13} className="text-sky-400" />
        <span className="hidden md:inline">Telemetry &amp; Charts</span>
        <BarChart3 size={12} className="text-slate-400" />
      </button>
    </div>
  );
}
