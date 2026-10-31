import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Play,
  Sparkles,
  Sprout,
  Wrench,
  X,
} from 'lucide-react';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';

interface StoryCopy {
  tag: string;
  beforePain: string;
  withShiftMagic: string;
}

const PRESET_STORIES: Record<string, StoryCopy> = {
  demand_surge: {
    tag: 'Scenario A · Upstream Demand Surge (1.00 → 1.38 cartons/s)',
    beforePain:
      'Upstream sealer speeds up +38%. Legacy Nearest-pick greedily grabs newer cartons near the center (x≈0) instead of front cartons near the exit, dropping ~8 cartons into the chute.',
    withShiftMagic:
      'Gemini tests 4 recipes on the exact arrival schedule, switches to SPT/EDF + 0.26 m/s belt with synchronized trays, and restores 100% capture in one click.',
  },
  product_change: {
    tag: 'Scenario B · Multi-SKU Changeover (Boxes → Mixed SKUs)',
    beforePain:
      'Conveyor switches from uniform boxes to mixed boxes, tall blue cylinders, and green pouches (1.40/s) with locked 4th-axis yaw alignment. Unadjusted Nearest-pick misses 8 items.',
    withShiftMagic:
      'Gemini evaluates mixed-SKU intercept kinematics, proving SPT + 0.28 m/s belt achieves 100% completion across held-out seeds before touching the PLC.',
  },
  tray_change: {
    tag: 'Scenario C · Co-Flow Unsynced Tray Changeover',
    beforePain:
      'Downstream case packer locks trays into co-flow with auto-sync disabled (1.35/s mixed). Manual trial-and-error leaves half-empty trays and end-of-belt misses.',
    withShiftMagic:
      'Respecting the locked co-flow constraint, Gemini calibrates manual tray speed (0.14 m/s) + 0.28 m/s belt to dispatch ≥3 full trays with 0 misses.',
  },
  infeasible_overload: {
    tag: 'Scenario D · Over-Capacity Request (2.50 items/s · 150/min)',
    beforePain:
      'Management requests 2.50 items/s on a single 6g picker. Without kinematic simulation, engineers waste hours tuning VFDs on a physically impossible workload.',
    withShiftMagic:
      'SHIFT tests top recipes, proves the single 6g delta picker ceiling (~88 picks/min) is exceeded across all candidates, and safely rejects the changeover.',
  },
};

export function StoryBanner() {
  const {
    mode,
    setMode,
    storyGuideOpen,
    set,
    selectedPresetId,
    comparisonReplayView,
    hasAppliedActiveRecommendation,
    previewUnadjustedChangeOnLine,
    applyRecommendedConfig,
    activeSession,
    undoAppliedConfig,
    appliedConfigHistory,
  } = useApp();

  if (!storyGuideOpen) return null;

  if (mode !== 'pickPlace') {
    return (
      <aside
        data-testid="story-banner"
        className="pointer-events-auto glass w-[340px] max-w-[90vw] rounded-2xl border border-white/10 p-3 shadow-xl"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {mode === 'weeding' ? (
              <Sprout size={13} className="text-emerald-400" />
            ) : (
              <Compass size={13} className="text-sky-400" />
            )}
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-emerald-200 uppercase">
              {mode === 'weeding'
                ? 'Scenario 2 · Autonomous Agri Weeding'
                : 'Scenario 3 · 3D Delta Kinematics Lab'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => set('storyGuideOpen', false)}
            className="rounded-lg p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
        <p className="mb-2.5 text-[11px] leading-snug text-slate-300">
          {mode === 'weeding'
            ? 'Delta robot mounted on a moving tractor chassis pulling weeds between Carrot, Lettuce, or Strawberry crop rows while respecting canopy clearance.'
            : 'Interactive Forward & Inverse Kinematics (FK/IK) explorer. Drag the 3D end-effector gizmo or adjust motor angles θ₁–θ₃ to inspect Jacobian conditioning and singularities.'}
        </p>
        <button
          type="button"
          onClick={() => setMode('pickPlace')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
        >
          <span>Return to Packing Line (SHIFT AI)</span>
          <ArrowRight size={12} />
        </button>
      </aside>
    );
  }

  const story = PRESET_STORIES[selectedPresetId] ?? PRESET_STORIES['demand_surge']!;
  const isRecommended =
    activeSession?.status === 'recommended' && !!activeSession?.recommendedConfig;

  return (
    <aside
      data-testid="story-banner"
      className="pointer-events-auto glass w-[345px] max-w-[90vw] rounded-2xl border border-white/10 p-2.5 shadow-xl"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-amber-300" />
          <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-amber-200 uppercase">
            Engineer&apos;s Life: Before vs. With SHIFT
          </span>
        </div>
        <button
          type="button"
          onClick={() => set('storyGuideOpen', false)}
          className="rounded-lg p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
          title="Hide story guide"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mb-1.5 rounded-lg border border-white/8 bg-black/30 px-2 py-1 font-mono text-[10px] font-semibold text-slate-200">
        {story.tag}
      </div>

      <div className="space-y-1.5 text-[10.5px] leading-snug">
        {/* Before SHIFT */}
        <div
          className={cn(
            'rounded-xl border p-2 transition-colors',
            comparisonReplayView === 'before'
              ? 'border-rose-400/50 bg-rose-500/15'
              : 'border-rose-500/20 bg-rose-500/[0.06]',
          )}
        >
          <div className="mb-0.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-rose-300 uppercase">
              <Wrench size={10} />
              <span>Before SHIFT · Unadjusted PLC</span>
            </span>
            {comparisonReplayView === 'before' && (
              <span className="rounded bg-rose-500/30 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-rose-200">
                ON 3D LINE
              </span>
            )}
          </div>
          <p className="text-slate-300">{story.beforePain}</p>
        </div>

        {/* With SHIFT */}
        <div
          className={cn(
            'rounded-xl border p-2 transition-colors',
            hasAppliedActiveRecommendation
              ? 'border-emerald-400/60 bg-emerald-500/15'
              : 'border-emerald-500/25 bg-emerald-500/[0.07]',
          )}
        >
          <div className="mb-0.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-emerald-300 uppercase">
              <CheckCircle2 size={10} />
              <span>With SHIFT · AI + Kinematic Proof</span>
            </span>
            {hasAppliedActiveRecommendation && (
              <span className="rounded bg-emerald-500/30 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-emerald-200">
                APPLIED IN 3D
              </span>
            )}
          </div>
          <p className="text-slate-200">{story.withShiftMagic}</p>
        </div>
      </div>

      {/* Interactive Demo Trigger Row */}
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          data-testid="preview-problem-btn"
          onClick={previewUnadjustedChangeOnLine}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10.5px] font-semibold transition-all',
            comparisonReplayView === 'before'
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
              : 'border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
          )}
          title="Run the new production workload on the unadjusted line in 3D to see what happens before SHIFT"
        >
          <AlertTriangle size={11} />
          <span>
            {comparisonReplayView === 'before'
              ? '1. Viewing Before SHIFT'
              : '1. Watch Without SHIFT'}
          </span>
        </button>

        {isRecommended ? (
          <button
            type="button"
            onClick={applyRecommendedConfig}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/45 bg-emerald-500/20 px-2.5 py-1.5 text-[10.5px] font-bold text-emerald-200 hover:bg-emerald-500/30"
          >
            <Play size={10} fill="currentColor" />
            <span>2. Watch With SHIFT</span>
          </button>
        ) : comparisonReplayView === 'before' && appliedConfigHistory.length > 0 ? (
          <button
            type="button"
            onClick={undoAppliedConfig}
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-[10.5px] font-medium text-slate-200 hover:bg-white/15"
          >
            <span>Restore</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
