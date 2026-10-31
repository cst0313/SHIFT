import { useRef, useState } from 'react';
import { Camera, GripHorizontal, Minimize2, Maximize2 } from 'lucide-react';
import { useApp } from '@/state/store';

export function MovablePhotoTwinCard() {
  const mode = useApp((s) => s.mode);
  const pickPlace = useApp((s) => s.pickPlace);
  const workflowStep = useApp((s) => s.workflowStep);
  const setWorkflowStep = useApp((s) => s.setWorkflowStep);
  const diagnosticsOpen = useApp((s) => s.diagnosticsOpen);
  const storyGuideOpen = useApp((s) => s.storyGuideOpen);

  // Draggable position relative to top-left of the 3D viewport
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 66 });
  const [minimized, setMinimized] = useState(false);
  // Split slider: 0 = Full 3D Twin Window, 55 = Half Photo / Half 3D Twin Lens, 100 = Full Photo
  const [photoSplit, setPhotoSplit] = useState(58);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  if (mode !== 'pickPlace' || diagnosticsOpen || storyGuideOpen) return null;

  const onPointerDownHeader = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const onPointerMoveHeader = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextX = Math.max(8, Math.min(window.innerWidth - 310, dragRef.current.origX + dx));
    const nextY = Math.max(54, Math.min(window.innerHeight - 230, dragRef.current.origY + dy));
    setPos({ x: nextX, y: nextY });
  };

  const onPointerUpHeader = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  if (minimized) {
    return (
      <div
        data-testid="movable-photo-pip"
        style={{ left: pos.x, top: pos.y }}
        className="pointer-events-auto fixed z-20 flex items-center gap-2 rounded-full border border-emerald-400/40 bg-slate-950/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 shadow-xl backdrop-blur-md"
      >
        <Camera size={13} className="text-emerald-400" />
        <span>Photo → 3D Twin Lens</span>
        <button
          type="button"
          data-testid="expand-photo-pip-btn"
          onClick={() => setMinimized(false)}
          className="ml-1 rounded-full bg-white/10 p-1 text-slate-200 hover:bg-white/20 hover:text-white"
          title="Expand movable Photo-to-3D comparison lens"
        >
          <Maximize2 size={11} />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="movable-photo-pip"
      style={{ left: pos.x, top: pos.y }}
      className="pointer-events-auto fixed z-20 w-[275px] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/75 shadow-2xl backdrop-blur-sm select-none"
    >
      {/* Draggable Header Bar */}
      <div
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMoveHeader}
        onPointerUp={onPointerUpHeader}
        className="flex cursor-grab items-center justify-between border-b border-white/10 bg-slate-900/90 px-2.5 py-1.5 active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal size={13} className="text-slate-400" />
          <Camera size={12} className="text-emerald-400" />
          <span className="font-mono text-[10px] font-bold tracking-[0.06em] text-white uppercase">
            Photo → 3D Twin Lens
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
            Drag Me
          </span>
          <button
            type="button"
            data-testid="minimize-photo-pip-btn"
            onClick={() => setMinimized(true)}
            className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
            title="Minimize lens"
          >
            <Minimize2 size={11} />
          </button>
        </div>
      </div>

      {/* Split Wipe Comparison Viewport: Left = Physical Factory Photo, Right = Transparent 3D Digital Twin Window */}
      <div className="relative h-[132px] w-full overflow-hidden bg-transparent">
        {/* Right / Base Layer: Transparent Digital Twin Telemetry Window (sees live 3D canvas behind!) */}
        <div className="absolute inset-0 flex flex-col justify-between bg-sky-950/20 p-2">
          <div className="flex justify-end">
            <span className="rounded border border-sky-400/40 bg-slate-950/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-sky-300">
              LIVE 3D TWIN ({pickPlace.conveyorSpeed.toFixed(2)} m/s)
            </span>
          </div>
          {/* Digital Twin Kinematic Overlay Grid */}
          <div className="pointer-events-none my-auto flex items-center justify-center">
            <div className="rounded-lg border border-dashed border-sky-400/40 bg-slate-950/60 px-2 py-1 text-center font-mono text-[9px] text-sky-200">
              Δ-Picker z=1.8m · {pickPlace.strategy.toUpperCase()} · {pickPlace.trayFlow}-flow
            </div>
          </div>
          <div className="flex items-center justify-between font-mono text-[9px] text-slate-300">
            <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-emerald-300">
              Cam-04 Photo
            </span>
            <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-sky-300">
              3D Sim Mesh →
            </span>
          </div>
        </div>

        {/* Left Clipped Layer: Physical Factory Line Photo */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - photoSplit}% 0 0)` }}
        >
          <img
            src="/factory-line-photo.png"
            alt="Physical Factory Cell #04"
            className="h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute top-2 left-2 rounded border border-emerald-400/40 bg-slate-950/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
            PHYSICAL CELL PHOTO
          </div>
        </div>

        {/* Vertical Split Divider Line */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-300 shadow-[0_0_8px_#fcd34d]"
          style={{ left: `${photoSplit}%` }}
        />
      </div>

      {/* Interactive Scrubber & Quick Story Stepper */}
      <div className="flex flex-col gap-1.5 border-t border-white/10 bg-slate-900/95 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-semibold text-emerald-300 uppercase">
            Photo
          </span>
          <input
            type="range"
            data-testid="photo-twin-slider"
            min={0}
            max={100}
            value={photoSplit}
            onChange={(e) => setPhotoSplit(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-amber-400"
            title="Scrub between the Physical Factory Photo and the Live 3D Simulation"
          />
          <span className="font-mono text-[9px] font-semibold text-sky-300 uppercase">3D Sim</span>
        </div>

        <div className="flex items-center justify-between gap-1 text-[9.5px]">
          <button
            type="button"
            onClick={() => {
              setPhotoSplit(85);
              setWorkflowStep(1);
            }}
            className={`flex-1 rounded px-1.5 py-0.5 font-mono font-semibold transition-colors ${
              workflowStep === 1
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            1.Photo
          </button>
          <button
            type="button"
            onClick={() => {
              setPhotoSplit(45);
              setWorkflowStep(2);
            }}
            className={`flex-1 rounded px-1.5 py-0.5 font-mono font-semibold transition-colors ${
              workflowStep === 2
                ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            2.3D Sim
          </button>
          <button
            type="button"
            onClick={() => {
              setPhotoSplit(15);
              setWorkflowStep(3);
            }}
            className={`flex-1 rounded px-1.5 py-0.5 font-mono font-semibold transition-colors ${
              workflowStep === 3
                ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            3.Test
          </button>
        </div>
      </div>
    </div>
  );
}
