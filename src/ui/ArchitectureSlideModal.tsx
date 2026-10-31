import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Cpu,
  Layers,
  Lock,
  Play,
  ShieldAlert,
  Sliders,
  Sparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';

const SLIDES = [
  { id: 0, label: '1. Problem' },
  { id: 1, label: '2. Today vs. SHIFT' },
  { id: 2, label: '3. How It Works' },
  { id: 3, label: '4. Agent Architecture' },
  { id: 4, label: '5. Live Demo' },
];

export function ArchitectureSlideModal() {
  const open = useApp((s) => s.storyGuideOpen);
  const set = useApp((s) => s.set);
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setSlideIdx((i) => Math.min(SLIDES.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setSlideIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="architecture-slide-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) set('storyGuideOpen', false);
      }}
    >
      <div className="glass relative flex h-[84vh] max-h-[720px] w-full max-w-5xl flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-slate-950/95 shadow-2xl">
        {/* Top Slide Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/90 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/15 text-emerald-300">
              <Layers size={16} />
            </div>
            <span className="font-mono text-sm font-bold tracking-wider text-white">
              SHIFT PITCH DECK
            </span>
          </div>

          {/* Slide Selector Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1">
            {SLIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`slide-tab-${s.id + 1}`}
                onClick={() => setSlideIdx(s.id)}
                className={cn(
                  'rounded-lg px-3 py-1 font-mono text-xs font-bold transition-all',
                  slideIdx === s.id
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="close-architecture-slide-btn"
            onClick={() => set('storyGuideOpen', false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
            <span>Close</span>
          </button>
        </div>

        {/* Center Slide Stage (10-Second Scannable Visuals) */}
        <div className="flex flex-1 flex-col justify-center overflow-y-auto px-10 py-6">
          {/* =========================================================
              SLIDE 1: THE PROBLEM
             ========================================================= */}
          {slideIdx === 0 && (
            <div data-testid="slide-content-1" className="mx-auto w-full max-w-4xl space-y-10">
              <div className="text-center space-y-3">
                <span className="rounded-full border border-rose-400/30 bg-rose-500/15 px-3.5 py-1 font-mono text-xs font-bold text-rose-300 uppercase">
                  1 · The Problem
                </span>
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  Orders Change. Robots Drop Boxes.
                </h1>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="flex flex-col items-center rounded-3xl border border-white/12 bg-white/[0.03] p-8 text-center">
                  <div className="mb-4 text-5xl">📦</div>
                  <div className="text-2xl font-extrabold text-white">1. Line Changes</div>
                  <p className="mt-2 text-base font-medium text-slate-300">
                    Faster belt · New shapes
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-3xl border border-rose-400/40 bg-rose-500/10 p-8 text-center">
                  <div className="mb-4 text-5xl">💥</div>
                  <div className="text-2xl font-extrabold text-rose-300">2. 17% Dropped</div>
                  <p className="mt-2 text-base font-medium text-rose-100/90">
                    Picks wrong box first
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-3xl border border-amber-400/35 bg-amber-500/10 p-8 text-center">
                  <div className="mb-4 text-5xl">⏳</div>
                  <div className="text-2xl font-extrabold text-amber-200">3. 60 Min Stopped</div>
                  <p className="mt-2 text-base font-medium text-amber-100/90">
                    Manual trial &amp; error
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SLIDE 2: TODAY VS. SHIFT
             ========================================================= */}
          {slideIdx === 1 && (
            <div data-testid="slide-content-2" className="mx-auto w-full max-w-4xl space-y-10">
              <div className="text-center space-y-3">
                <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-3.5 py-1 font-mono text-xs font-bold text-sky-300 uppercase">
                  2 · Old Way vs. SHIFT
                </span>
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  60 Min by Hand → 12 Seconds with AI
                </h1>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Today */}
                <div className="flex flex-col justify-between rounded-3xl border border-rose-400/35 bg-rose-950/25 p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-mono text-sm font-bold text-rose-300 uppercase">
                      <XCircle size={18} /> Today (By Hand)
                    </span>
                    <span className="rounded-xl bg-rose-500/20 px-3 py-1 font-mono text-xs font-bold text-rose-200">
                      60 MIN DOWNTIME
                    </span>
                  </div>

                  <div className="space-y-3 text-lg font-medium text-slate-200">
                    <div>✖ Stop the real conveyor belt</div>
                    <div>✖ Guess speeds by trial &amp; error</div>
                    <div>✖ 17% of boxes hit the floor</div>
                  </div>
                </div>

                {/* With SHIFT */}
                <div className="flex flex-col justify-between rounded-3xl border border-emerald-400/45 bg-emerald-950/25 p-8 space-y-6 shadow-[0_0_35px_rgba(16,185,129,0.18)]">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-mono text-sm font-bold text-emerald-300 uppercase">
                      <CheckCircle2 size={18} /> With SHIFT (Gemini + 3D)
                    </span>
                    <span className="rounded-xl bg-emerald-500/25 px-3 py-1 font-mono text-xs font-bold text-emerald-200">
                      12 SECONDS
                    </span>
                  </div>

                  <div className="space-y-3 text-lg font-medium text-white">
                    <div>✔ Snap a photo of the line</div>
                    <div>✔ Gemini tests 4 recipes in 3D</div>
                    <div className="text-emerald-300 font-bold">
                      ✔ 100% packed · 0 dropped boxes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SLIDE 3: HOW IT WORKS (1 -> 2 -> 3)
             ========================================================= */}
          {slideIdx === 2 && (
            <div data-testid="slide-content-3" className="mx-auto w-full max-w-4xl space-y-10">
              <div className="text-center space-y-3">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-1 font-mono text-xs font-bold text-emerald-300 uppercase">
                  3 · How SHIFT Works
                </span>
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  Photo → 3D Test → Live Robot
                </h1>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="flex flex-col items-center rounded-3xl border border-sky-400/35 bg-sky-500/10 p-8 text-center space-y-3">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300">
                    <Camera size={28} />
                  </div>
                  <div className="font-mono text-xs font-bold text-sky-300 uppercase">Step 1</div>
                  <div className="text-2xl font-extrabold text-white">Scan Photo</div>
                  <p className="text-base text-slate-200">Builds the live 3D twin</p>
                </div>

                <div className="flex flex-col items-center rounded-3xl border border-violet-400/35 bg-violet-500/10 p-8 text-center space-y-3">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300">
                    <Cpu size={28} />
                  </div>
                  <div className="font-mono text-xs font-bold text-violet-300 uppercase">
                    Step 2
                  </div>
                  <div className="text-2xl font-extrabold text-white">Test 4 Recipes</div>
                  <p className="text-base text-slate-200">Tests pick order &amp; speeds</p>
                </div>

                <div className="flex flex-col items-center rounded-3xl border border-emerald-400/45 bg-emerald-500/10 p-8 text-center space-y-3">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                    <Zap size={28} />
                  </div>
                  <div className="font-mono text-xs font-bold text-emerald-300 uppercase">
                    Step 3
                  </div>
                  <div className="text-2xl font-extrabold text-white">Apply &amp; Sprint</div>
                  <p className="text-base text-slate-200">Updates robot + 10g reflex</p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SLIDE 4: AGENT ARCHITECTURE (Technical Deep-Dive)
             ========================================================= */}
          {slideIdx === 3 && (
            <div data-testid="slide-content-4" className="mx-auto w-full max-w-5xl space-y-6">
              <div className="text-center space-y-2">
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3.5 py-1 font-mono text-xs font-bold text-violet-300 uppercase">
                  4 · Technical Architecture · Gemini Agent + 3D Kinematics
                </span>
                <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Vision Calibration + Guardrailed 6-Tool Sim Loop
                </h1>
              </div>

              {/* 4-Stage Visual Pipeline */}
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300 uppercase">
                    <Camera size={14} /> 1. Vision Twin
                  </div>
                  <div className="text-sm font-bold text-white">Gemini 2.5 Flash</div>
                  <div className="space-y-1 font-mono text-xs text-slate-200">
                    <div>• Detects 3-arm Delta (6g)</div>
                    <div>• Maps infeed &amp; 4-slot trays</div>
                    <div>• Box &amp; Cylinder SKUs</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-400/35 bg-sky-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-sky-300 uppercase">
                    <Lock size={14} /> 2. Safety Lock
                  </div>
                  <div className="text-sm font-bold text-white">Anti-Reward-Hacking</div>
                  <div className="space-y-1 font-mono text-xs text-slate-200">
                    <div className="text-rose-300">🔒 Locked: 6g accel, 1.38/s</div>
                    <div className="text-emerald-300">🎛️ Tunable: strategy</div>
                    <div className="text-emerald-300">🎛️ Tunable: belt speeds</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-400/40 bg-violet-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-violet-300 uppercase">
                    <Sliders size={14} /> 3. 6-Tool Loop
                  </div>
                  <div className="text-sm font-bold text-white">4 Configs × 3 Seeds</div>
                  <div className="space-y-1 font-mono text-xs text-violet-200">
                    <div>1. inspect_line()</div>
                    <div>2. validate_change()</div>
                    <div>3. simulate_candidate()</div>
                    <div>4. compare &amp; propose()</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300 uppercase">
                    <ShieldAlert size={14} /> 4. Runtime Guard
                  </div>
                  <div className="text-sm font-bold text-white">Closed-Loop Reflex</div>
                  <div className="space-y-1 font-mono text-xs text-slate-200">
                    <div className="text-emerald-300">✔ EDF + 0.29m/s → 100%</div>
                    <div className="text-amber-300">⚡ +6 Burst → 10g Sprint</div>
                    <div className="text-rose-300">🛑 Rejects 132/min overload</div>
                  </div>
                </div>
              </div>

              {/* 2 Key Technical Takeaways */}
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl border border-white/12 bg-black/50 px-5 py-3.5">
                  <div>
                    <div className="font-mono text-xs font-bold text-amber-300 uppercase">
                      Why &ldquo;Nearest&rdquo; Drops Boxes
                    </div>
                    <div className="mt-0.5 text-sm text-slate-200">
                      Grabs middle items (<code className="text-white">x=0m</code>) while front
                      boxes pass exit (<code className="text-rose-300">+0.65m</code>)
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 rounded-xl bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300">
                    Fix: EDF Front-First
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/12 bg-black/50 px-5 py-3.5">
                  <div>
                    <div className="font-mono text-xs font-bold text-rose-300 uppercase">
                      Scenario D Overload Guard
                    </div>
                    <div className="mt-0.5 text-sm text-slate-200">
                      132/min exceeds single 6g robot ceiling (max{' '}
                      <code className="text-white">86/min</code>)
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 rounded-xl bg-rose-500/20 px-3 py-1.5 font-mono text-xs font-bold text-rose-300">
                    68% Max · Blocked
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SLIDE 5: LIVE DEMO (4 Clicks)
             ========================================================= */}
          {slideIdx === 4 && (
            <div data-testid="slide-content-5" className="mx-auto w-full max-w-4xl space-y-8">
              <div className="text-center space-y-3">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-1 font-mono text-xs font-bold text-emerald-300 uppercase">
                  5 · Live Demo
                </span>
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  4 Things We Will Show Live
                </h1>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex items-center gap-4 rounded-3xl border border-sky-400/35 bg-sky-500/10 p-6">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/25 font-mono text-xl font-black text-sky-200">
                    1
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-white">Scan Factory Photo</div>
                    <div className="mt-1 text-sm text-slate-200">
                      Labels photo &amp; opens the Live 3D Sim
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-3xl border border-amber-400/35 bg-amber-500/10 p-6">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/25 font-mono text-xl font-black text-amber-200">
                    2
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-white">Drop +6 Boxes on Belt</div>
                    <div className="mt-1 text-sm text-slate-200">
                      Sprints to 10g &amp; brakes belt to 0.15 m/s
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-3xl border border-violet-400/35 bg-violet-500/10 p-6">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/25 font-mono text-xl font-black text-violet-200">
                    3
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-white">Flip Tray &amp; Clear</div>
                    <div className="mt-1 text-sm text-slate-200">
                      Clears belt &amp; reverses flow in 1 click
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-6">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/25 font-mono text-xl font-black text-emerald-200">
                    4
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-white">Run AI Changeover</div>
                    <div className="mt-1 text-sm text-slate-200">
                      Tests 4 configs → 100% packed, 0 drops
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Slide Navigation Bar */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/90 px-6 py-3.5">
          <button
            type="button"
            data-testid="prev-slide-btn"
            onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
            disabled={slideIdx === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-35"
          >
            <ArrowLeft size={14} />
            <span>Previous</span>
          </button>

          <span className="font-mono text-xs text-slate-400">
            Slide {slideIdx + 1} of {SLIDES.length} · Use ← / → arrow keys
          </span>

          {slideIdx < SLIDES.length - 1 ? (
            <button
              type="button"
              data-testid="next-slide-btn"
              onClick={() => setSlideIdx((i) => Math.min(SLIDES.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
            >
              <span>Next Slide</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              data-testid="start-live-demo-btn"
              onClick={() => set('storyGuideOpen', false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-300"
            >
              <Play size={13} fill="currentColor" />
              <span>Launch Live 3D Demo</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
