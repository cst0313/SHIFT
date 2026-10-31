import {
  Activity,
  Compass,
  Cpu,
  History,
  Layers,
  Package,
  Pause,
  Play,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { useApp, type Mode } from '@/state/store';
import { cn } from '@/lib/utils';
import { IconButton, Tip } from './components/controls';

const WORKCELL_MODES: { id: Mode; label: string; shortLabel: string; icon: typeof Package; hint: string }[] = [
  {
    id: 'pickPlace',
    label: 'Packing Line (SHIFT AI)',
    shortLabel: 'Packing Line',
    icon: Package,
    hint: 'High-speed Pick & Place packaging line with Gemini AI Changeover Copilot (Presets A–D)',
  },
  {
    id: 'weeding',
    label: 'Agri Weeding',
    shortLabel: 'Weeding',
    icon: Sprout,
    hint: 'Autonomous agricultural delta weeder over carrot, lettuce, and strawberry crop beds',
  },
  {
    id: 'manual',
    label: 'Kinematics Lab',
    shortLabel: 'Kinematics',
    icon: Compass,
    hint: 'Interactive 3D Forward/Inverse Kinematics (FK/IK) and Jacobian conditioning explorer',
  },
];

export function TopBar() {
  const {
    mode,
    setMode,
    playing,
    set,
    panelOpen,
    storyGuideOpen,
    diagnosticsOpen,
    openDiagnostics,
    agentBackendStatus,
    activeSession,
    resetLineToDefault,
  } = useApp();

  const effectiveMode =
    activeSession?.mode === 'live_gemini' || agentBackendStatus.liveAvailable
      ? 'live_gemini'
      : 'replay';
  const effectiveModel =
    activeSession?.mode === 'live_gemini'
      ? activeSession.modelId
      : agentBackendStatus.modelId;

  return (
    <header className="pointer-events-auto glass flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2">
      {/* Brand + 3D Workcell Scenario Switcher + Live/Replay Status */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Logo />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[15px] font-bold tracking-wider text-white">SHIFT</span>
              <span className="hidden shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-emerald-300 uppercase sm:inline">
                {mode === 'pickPlace'
                  ? 'Packing Cell #04'
                  : mode === 'weeding'
                    ? 'Agri Field Rig'
                    : 'IK / FK Lab'}
              </span>
            </div>
            <p className="hidden truncate text-[10.5px] text-slate-300 xl:block">
              Describe the production change. Watch the agent test the alternatives.
            </p>
          </div>
        </div>

        {/* 3D Workcell / Scenario Switcher (Pick & Place · Agri Weeding · Kinematics Lab) */}
        <div
          data-testid="workcell-mode-switcher"
          className="flex items-center rounded-xl border border-white/10 bg-black/40 p-0.5"
        >
          {WORKCELL_MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <Tip key={m.id} content={m.hint}>
                <button
                  type="button"
                  data-testid={`mode-${m.id}`}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all',
                    active
                      ? 'bg-emerald-500/20 text-emerald-300 shadow-xs'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon size={12} />
                  <span className="hidden 2xl:inline">{m.label}</span>
                  <span className="2xl:hidden">{m.shortLabel}</span>
                </button>
              </Tip>
            );
          })}
        </div>

        {/* Live vs Replay Status Badge */}
        {mode === 'pickPlace' && (
          <div
            data-testid="agent-mode-badge"
            className={cn(
              'hidden shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] font-medium lg:inline-flex',
              effectiveMode === 'live_gemini'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            )}
          >
            {effectiveMode === 'live_gemini' ? <Cpu size={12} /> : <History size={12} />}
            <span>{effectiveMode === 'live_gemini' ? `LIVE · ${effectiveModel}` : 'REPLAY MODE'}</span>
          </div>
        )}
      </div>

      {/* Primary View & Simulation Controls */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* System Architecture & Value Slide Modal Button */}
        <button
          type="button"
          data-testid="open-architecture-slide-btn"
          onClick={() => set('storyGuideOpen', !storyGuideOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
            storyGuideOpen
              ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
              : 'border-sky-400/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 hover:text-white',
          )}
        >
          <Layers size={13} className="text-sky-300" />
          <span>Architecture &amp; Value</span>
        </button>

        {/* Statistics / Detailed Control / Replay Center Trigger */}
        <button
          type="button"
          data-testid="open-diagnostics-btn"
          onClick={() =>
            diagnosticsOpen ? set('diagnosticsOpen', false) : openDiagnostics('candidates')
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
            diagnosticsOpen
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white',
          )}
        >
          <Activity size={13} />
          <span>Stats &amp; Controls</span>
        </button>

        {/* Change Production Copilot Toggle */}
        <button
          type="button"
          data-testid="change-production-btn"
          onClick={() => set('panelOpen', !panelOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11.5px] font-semibold transition-all',
            panelOpen
              ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
              : 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25',
          )}
        >
          <Sparkles size={13} />
          <span>{mode === 'pickPlace' ? 'Change Production' : 'Controls'}</span>
        </button>

        {/* Play/Pause & Reset */}
        <div className="flex items-center gap-1">
          {mode !== 'manual' && (
            <IconButton
              label={playing ? 'Pause (space)' : 'Play (space)'}
              onClick={() => set('playing', !playing)}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </IconButton>
          )}

          <Tip content="Reset production line to initial baseline">
            <button
              type="button"
              data-testid="reset-line-btn"
              onClick={resetLineToDefault}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 font-mono text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>
          </Tip>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#10171e" stroke="rgba(52,211,153,0.35)" />
      <g stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M7 8h18" />
        <path d="M9 8l-2 7 7 9" />
        <path d="M23 8l2 7-7 9" />
        <path d="M16 8v16" />
      </g>
      <circle cx="16" cy="24" r="2.6" fill="#34d399" />
    </svg>
  );
}
