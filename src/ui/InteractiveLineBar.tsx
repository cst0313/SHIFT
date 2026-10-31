import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  Boxes,
  Crosshair,
  PlusCircle,
  Sparkles,
  Sprout,
  Trash2,
  Zap,
} from 'lucide-react';
import { PickPlaceScenario } from '@/core/scenarios/pickPlace/pickPlace';
import { sim } from '@/state/simHandle';
import { useApp } from '@/state/store';
import { cn, fmt } from '@/lib/utils';
import { usePoll } from './usePoll';
import { playElevenLabsEvent } from './sfxPlayer';

const STRATEGY_BADGE: Record<string, string> = {
  edf: 'EDF (Front-First)',
  fifo: 'FIFO (Oldest)',
  nearest: 'NEAREST (Middle)',
  spt: 'SPT (Fastest)',
};

export function InteractiveLineBar() {
  usePoll(8);
  const mode = useApp((s) => s.mode);
  const pickPlace = useApp((s) => s.pickPlace);
  const weeding = useApp((s) => s.weeding);
  const setPickPlace = useApp((s) => s.setPickPlace);

  const [autoAdapt, setAutoAdapt] = useState(true);
  const [surgeInterceptUntil, setSurgeInterceptUntil] = useState<number>(0);
  const [liveNotice, setLiveNotice] = useState<string>(
    'Drop 6 items or flip the tray belt below — Gemini Auto-Adapt triggers 10g surge sprint & belt braking.',
  );
  const surgeTimerRef = useRef<number | null>(null);

  const s = sim.scenario;
  const pickScenario = s instanceof PickPlaceScenario ? s : null;
  const onBeltCount = pickScenario
    ? pickScenario.products.filter((p) => p.state === 'belt' || p.state === 'reserved').length
    : 0;
  const isSurgeBoostActive = Boolean(pickScenario?.surgeBoostActive);

  // Closed-loop recovery: once the dropped wave of items is cleared down to <= 2 items (and min 3.5s elapsed),
  // automatically restore nominal 6g cruise and 0.29 m/s belt speed.
  useEffect(() => {
    if (!pickScenario || !isSurgeBoostActive) return;
    const now = performance.now();
    if (now > surgeInterceptUntil && onBeltCount <= 2) {
      pickScenario.setSurgeBoost(false);
      setPickPlace({ conveyorSpeed: 0.29, strategy: 'edf', traySync: true }, false);
      setLiveNotice(
        '✅ Surge wave cleared with 0 misses — Gemini restored nominal 6g cruise & 0.29 m/s belt speed.',
      );
    }
  }, [pickScenario, isSurgeBoostActive, onBeltCount, surgeInterceptUntil, setPickPlace]);

  useEffect(() => {
    return () => {
      if (surgeTimerRef.current) window.clearTimeout(surgeTimerRef.current);
    };
  }, []);

  if (!s || mode === 'manual') return null;

  const metrics = s.metrics();
  const primaryMetrics = metrics.slice(0, 4);
  const missedCount = metrics.find((m) => m.label === 'Missed')?.value ?? 0;

  if (mode === 'weeding') {
    return (
      <div
        data-testid="stats-hud"
        className="pointer-events-auto glass flex items-center gap-3 rounded-2xl border border-white/12 px-3.5 py-2 shadow-xl"
      >
        <div className="flex items-center gap-2 border-r border-white/10 pr-3">
          <Sprout size={14} className="text-emerald-400" />
          <div>
            <div className="font-mono text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
              AGRI WEEDING RIG · {weeding.field.toUpperCase()}
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              {STRATEGY_BADGE[weeding.strategy] ?? weeding.strategy} · {weeding.speed.toFixed(2)} m/s
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {primaryMetrics.map((m) => (
            <div key={m.label} className="flex flex-col">
              <span className="text-[9.5px] tracking-wider text-slate-400 uppercase">{m.label}</span>
              <span className="tabular font-mono text-xs font-bold text-white">
                {fmt(m.value, m.digits ?? 0)}
                {m.unit ? <span className="ml-0.5 text-[10px] text-slate-400">{m.unit}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleInjectBurst = () => {
    playElevenLabsEvent('surge');
    const scenario = sim.scenario instanceof PickPlaceScenario ? sim.scenario : null;
    const burst = scenario ? scenario.spawnBurst(6) : { spawned: 6, onBelt: 8 };
    const prevSpeed = pickPlace.conveyorSpeed;

    if (autoAdapt) {
      // Activate Closed-Loop Gemini 10g Surge Intercept:
      // 1) Boost robot to 10g high-agility sprint (vMax 8.5 m/s, aMax 115 m/s², grasp 40ms)
      // 2) Brake infeed conveyor to 0.15 m/s so the 6-item cluster stays inside the pick window
      // 3) Lock EDF Front-First pick order and sync outfeed tray conveyor
      scenario?.setSurgeBoost(true);
      setSurgeInterceptUntil(performance.now() + 4500);
      const brakedSpeed = 0.15;
      setPickPlace(
        {
          conveyorSpeed: brakedSpeed,
          strategy: 'edf',
          traySync: true,
        },
        false,
      );
      setLiveNotice(
        `⚡ GEMINI 10g SURGE INTERCEPT (+${burst.spawned} items, ${burst.onBelt} on belt): Robot boosted 6g → 10g Sprint (8.5 m/s) · Belt braked ${prevSpeed.toFixed(2)} → ${brakedSpeed.toFixed(2)} m/s · EDF locked!`,
      );
    } else {
      scenario?.setSurgeBoost(false);
      // With Auto-Adapt OFF, unbraked fast belt + nearest middle-pick lets burst items escape
      setPickPlace({ conveyorSpeed: Math.max(prevSpeed, 0.42), strategy: 'nearest' }, false);
      setLiveNotice(
        `⚠️ Dropped +${burst.spawned} items (${burst.onBelt} on belt) with Gemini Auto-Adapt OFF — unbraked belt (0.42 m/s) & Nearest middle-pick risk misses!`,
      );
    }
  };

  const handleSwapTrayAndClearBelt = () => {
    playElevenLabsEvent('flip');
    const scenario = sim.scenario instanceof PickPlaceScenario ? sim.scenario : null;
    const cleared = scenario ? scenario.clearBeltItems(true) : 0;
    scenario?.setSurgeBoost(false);

    const nextFlow = pickPlace.trayFlow === 'counter' ? 'co' : 'counter';
    if (autoAdapt) {
      const adaptedSpeed = nextFlow === 'co' ? 0.27 : 0.29;
      const adaptedTraySpeed = nextFlow === 'co' ? 0.14 : 0.16;
      setPickPlace(
        {
          trayFlow: nextFlow,
          placeMode: 'trayConveyor',
          conveyorSpeed: adaptedSpeed,
          traySpeed: adaptedTraySpeed,
          traySync: true,
          strategy: 'edf',
        },
        false,
      );
      setLiveNotice(
        `⇄ Flipped Tray Belt → ${nextFlow.toUpperCase()}-FLOW & Cleared ${cleared} Belt Items: Gemini synced tray velocity (${adaptedTraySpeed.toFixed(2)} m/s) & belt (${adaptedSpeed.toFixed(2)} m/s).`,
      );
    } else {
      setPickPlace({ trayFlow: nextFlow, placeMode: 'trayConveyor' }, false);
      setLiveNotice(
        `⇄ Flipped Tray Belt to ${nextFlow.toUpperCase()}-FLOW & cleared ${cleared} belt items (Auto-Adapt OFF).`,
      );
    }
  };

  const handleClearBeltOnly = () => {
    const scenario = sim.scenario instanceof PickPlaceScenario ? sim.scenario : null;
    const cleared = scenario ? scenario.clearBeltItems(false) : 0;
    scenario?.setSurgeBoost(false);
    setLiveNotice(`🧹 Cleared ${cleared} items from the approach conveyor belt.`);
  };

  const handleToggleSkuMix = () => {
    const nextMix = pickPlace.mix === 'boxes' ? 'mixed' : 'boxes';
    const prevSpeed = pickPlace.conveyorSpeed;

    if (autoAdapt) {
      const adaptedSpeed = nextMix === 'mixed' ? 0.26 : 0.30;
      setPickPlace(
        {
          mix: nextMix,
          conveyorSpeed: adaptedSpeed,
          strategy: 'edf',
          traySync: true,
        },
        false,
      );
      setLiveNotice(
        nextMix === 'mixed'
          ? `⚡ Switched to MIXED SKUs: Gemini trimmed belt ${prevSpeed.toFixed(2)} → ${adaptedSpeed.toFixed(2)} m/s for cylinder 4th-axis yaw alignment.`
          : `⚡ Switched to UNIFORM BOXES: Gemini raised belt ${prevSpeed.toFixed(2)} → ${adaptedSpeed.toFixed(2)} m/s.`,
      );
    } else {
      setPickPlace({ mix: nextMix }, false);
      setLiveNotice(`📦 Switched belt SKUs to ${nextMix.toUpperCase()} (Auto-Adapt OFF).`);
    }
  };

  const handleTogglePickOrder = () => {
    const nextStrategy = pickPlace.strategy === 'edf' ? 'nearest' : 'edf';
    setPickPlace({ strategy: nextStrategy }, false);
    setLiveNotice(
      nextStrategy === 'edf'
        ? '🎯 Pick Order → EDF (Front-First): Robot always intercepts the block closest to the +0.65m exit limit.'
        : '⚠️ Pick Order → NEAREST (Middle-Pick): Robot grabs blocks near x=0m while front blocks slip past!',
    );
  };

  return (
    <div
      data-testid="interactive-line-bar"
      className={cn(
        'pointer-events-auto glass flex max-w-[820px] flex-col gap-1.5 rounded-2xl border px-3 py-2 shadow-xl transition-colors',
        isSurgeBoostActive
          ? 'border-emerald-400/60 bg-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
          : 'border-white/12',
      )}
    >
      {/* Row 1: Unified Live Line Telemetry + Robot Kinematics Mode + Gemini Auto-Adapt Toggle */}
      <div
        data-testid="stats-hud"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1.5"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Robot State Badge */}
          <div
            data-testid="robot-kinematic-badge"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
              isSurgeBoostActive
                ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                : missedCount > 0
                  ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                  : 'border-white/15 bg-white/8 text-emerald-300',
            )}
          >
            {isSurgeBoostActive ? (
              <>
                <Zap size={11} className="text-amber-300" />
                <span>⚡ 10g SURGE SPRINT (8.5 m/s)</span>
              </>
            ) : missedCount > 0 ? (
              <>
                <AlertTriangle size={11} className="text-rose-400" />
                <span>OVERFLOW ({missedCount} MISSED)</span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span>6g NOMINAL CRUISE</span>
              </>
            )}
          </div>

          {/* Primary KPI Strip */}
          <div className="flex items-center gap-2.5 font-mono text-[11px]">
            {primaryMetrics.map((m) => {
              const isMissed = m.label === 'Missed';
              const hasMissError = isMissed && m.value > 0;
              return (
                <div key={m.label} className="flex items-baseline gap-1">
                  <span className="text-[9.5px] text-slate-400 uppercase">{m.label}:</span>
                  <span
                    className={cn(
                      'tabular font-bold',
                      hasMissError ? 'text-rose-400' : 'text-white',
                    )}
                  >
                    {fmt(m.value, m.digits ?? 0)}
                    {m.unit ? (
                      <span className="ml-0.5 text-[9.5px] font-normal text-slate-400">
                        {m.unit}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
            <div className="hidden items-baseline gap-1 sm:flex">
              <span className="text-[9.5px] text-slate-400 uppercase">Belt:</span>
              <span
                className={cn(
                  'tabular font-bold',
                  isSurgeBoostActive ? 'text-amber-300' : 'text-sky-300',
                )}
              >
                {pickPlace.conveyorSpeed.toFixed(2)} m/s
              </span>
            </div>
            <div className="hidden items-baseline gap-1 md:flex">
              <span className="text-[9.5px] text-slate-400 uppercase">Queue:</span>
              <span className="tabular font-bold text-slate-200">{onBeltCount}</span>
            </div>
          </div>
        </div>

        {/* Gemini Auto-Adapt Switch */}
        <button
          type="button"
          data-testid="gemini-auto-adapt-toggle"
          onClick={() => {
            const next = !autoAdapt;
            setAutoAdapt(next);
            if (!next && pickScenario?.surgeBoostActive) {
              pickScenario.setSurgeBoost(false);
            }
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 font-mono text-[10px] font-bold uppercase transition-all',
            autoAdapt
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'border-white/15 bg-white/5 text-slate-400 hover:text-white',
          )}
        >
          <Bot size={12} className={autoAdapt ? 'text-emerald-300' : 'text-slate-400'} />
          <span>Gemini Auto-Adapt: {autoAdapt ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Row 2: Interactive Floor Perturbation Controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="inject-burst-btn"
          onClick={handleInjectBurst}
          className="inline-flex items-center gap-1 rounded-xl border border-amber-400/45 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition-all hover:bg-amber-500/30 active:scale-[0.98]"
          title="Drop 6 items onto the belt — Gemini triggers 10g Robot Sprint + 0.15 m/s Belt Braking"
        >
          <PlusCircle size={12} className="text-amber-300" />
          <span>+ Drop 6 Items on Belt</span>
          {autoAdapt && <Zap size={11} className="text-emerald-300" />}
        </button>

        <button
          type="button"
          data-testid="swap-tray-flow-btn"
          onClick={handleSwapTrayAndClearBelt}
          className="inline-flex items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-200 transition-all hover:bg-sky-500/25 active:scale-[0.98]"
          title="Reverse the tray conveyor direction and clear current items on the belt"
        >
          <ArrowLeftRight size={12} className="text-sky-300" />
          <span>
            ⇄ Flip Tray &amp; Clear ({pickPlace.trayFlow === 'counter' ? 'Counter→Co' : 'Co→Counter'})
          </span>
        </button>

        <button
          type="button"
          data-testid="clear-belt-btn"
          onClick={handleClearBeltOnly}
          className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/8 px-2 py-1 text-[11px] font-semibold text-slate-200 transition-all hover:bg-white/15 active:scale-[0.98]"
          title="Immediately clear all current items on the approach belt"
        >
          <Trash2 size={12} className="text-slate-300" />
          <span>Clear Belt</span>
        </button>

        <button
          type="button"
          data-testid="toggle-sku-mix-btn"
          onClick={handleToggleSkuMix}
          className="inline-flex items-center gap-1 rounded-xl border border-violet-400/35 bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200 transition-all hover:bg-violet-500/25 active:scale-[0.98]"
        >
          <Boxes size={12} className="text-violet-300" />
          <span>SKUs: {pickPlace.mix === 'boxes' ? 'Boxes' : 'Mixed'}</span>
        </button>

        <button
          type="button"
          data-testid="toggle-pick-order-btn"
          onClick={handleTogglePickOrder}
          className={cn(
            'inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-semibold transition-all active:scale-[0.98]',
            pickPlace.strategy === 'edf'
              ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
              : 'border-rose-400/35 bg-rose-500/15 text-rose-200',
          )}
        >
          <Crosshair size={12} />
          <span>{pickPlace.strategy === 'edf' ? 'EDF (Front)' : 'Nearest (Mid)'}</span>
        </button>
      </div>

      {/* Row 3: Compact 1-Line Live Gemini Auto-Adapt Action Feed */}
      <div
        data-testid="gemini-auto-adapt-notice"
        className="flex items-center gap-1.5 text-[10.5px] text-slate-200"
      >
        <Sparkles size={11} className="shrink-0 text-amber-300" />
        <span className="truncate">{liveNotice}</span>
      </div>
    </div>
  );
}
