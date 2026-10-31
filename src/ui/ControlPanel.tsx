import { BarChart3, Camera, Eye, Info, Orbit, ScanLine } from 'lucide-react';
import { useApp, type CameraMode } from '@/state/store';
import { STRATEGIES, type Strategy } from '@/core/scheduling/scheduler';
import { FIELD_PRESETS, type FieldPresetId } from '@/core/scenarios/weeding/field';
import { cn } from '@/lib/utils';
import { Section, Segmented, Slider, Switch } from './components/controls';
import { ManualPanel } from './ManualPanel';

const STRATEGY_SHORT_LABEL: Record<Strategy, string> = {
  edf: 'EDF',
  fifo: 'FIFO',
  nearest: 'Nearest',
};

const STRATEGY_BEHAVIOR_NOTE: Record<Strategy, string> = {
  edf: 'EDF (Earliest Deadline First): Always picks the front-most block closest to the conveyor exit (+X) so front items are never skipped.',
  fifo: 'FIFO (First-In, First-Out): Picks items strictly in spawn arrival order (oldest block on the belt first).',
  nearest:
    'Nearest Neighbor: Greedily picks whichever block is closest to the robot tool near the center trays (x≈0) — picks newer/later blocks in the middle of the belt and can skip front blocks!',
};

export function ControlPanel({ embedded = false }: { embedded?: boolean }) {
  const mode = useApp((s) => s.mode);
  const set = useApp((s) => s.set);

  return (
    <aside
      data-testid={embedded ? 'embedded-control-panel' : 'standalone-control-panel'}
      className={cn(
        'pointer-events-auto flex flex-col overflow-hidden rounded-2xl',
        embedded
          ? 'w-full border border-white/10 bg-black/35'
          : 'glass max-h-full w-[330px] border border-white/10 shadow-2xl',
      )}
    >
      <div className="overflow-y-auto overscroll-contain">
        {mode === 'pickPlace' && <PickPlaceSettings />}
        {mode === 'weeding' && <WeedingSettings />}
        {mode === 'manual' && <ManualPanel />}
        <ViewSettings />
        {!embedded && mode !== 'manual' && (
          <div className="border-t border-white/10 p-3">
            <button
              type="button"
              onClick={() => set('benchmarkOpen', true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-[11.5px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
            >
              <BarChart3 size={13} />
              <span>Run 4-Strategy Multi-Seed Benchmark</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function StrategyPicker({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  return (
    <div className="space-y-2">
      <Segmented
        label="Scheduling strategy (Pick Order)"
        hint="Determines whether the robot targets the front-most block or the block closest to the tool"
        value={value}
        onChange={onChange}
        options={STRATEGIES.map((s) => ({
          value: s.id,
          label: STRATEGY_SHORT_LABEL[s.id],
          hint: `${s.label}: ${s.hint}`,
        }))}
      />
      <div
        data-testid="strategy-behavior-explainer"
        className={cn(
          'flex items-start gap-1.5 rounded-xl border p-2 text-[11px] leading-snug',
          value === 'nearest'
            ? 'border-amber-400/35 bg-amber-500/10 text-amber-200'
            : 'border-sky-400/25 bg-sky-500/[0.07] text-slate-200',
        )}
      >
        <Info size={13} className="mt-0.5 shrink-0 text-sky-300" />
        <span>{STRATEGY_BEHAVIOR_NOTE[value]}</span>
      </div>
    </div>
  );
}

function PickPlaceSettings() {
  const c = useApp((s) => s.pickPlace);
  const set = useApp((s) => s.setPickPlace);
  return (
    <>
      <Section title="Robot Scheduling & Pick Order">
        <StrategyPicker value={c.strategy} onChange={(v) => set({ strategy: v })} />
      </Section>
      <Section title="Infeed Conveyor & Product Stream">
        <Slider
          label="Conveyor speed"
          value={c.conveyorSpeed}
          min={0.1}
          max={0.6}
          step={0.01}
          unit=" m/s"
          onChange={(v) => set({ conveyorSpeed: v })}
        />
        <Slider
          label="Product arrival rate"
          hint="Average number of products arriving per second (Poisson process)"
          value={c.spawnRate}
          min={0.3}
          max={2.5}
          step={0.05}
          unit=" /s"
          onChange={(v) => set({ spawnRate: v })}
        />
        <Segmented
          label="Product mix"
          value={c.mix}
          onChange={(v) => set({ mix: v })}
          options={[
            { value: 'mixed', label: 'Mixed SKUs' },
            { value: 'boxes', label: 'Boxes only' },
          ]}
        />
        <Switch
          label="Align products in trays (4th-axis yaw)"
          hint="Rotate the 4th axis so every product ends up in the same tray slot orientation"
          checked={c.alignProducts}
          onChange={(v) => set({ alignProducts: v })}
        />
      </Section>
      <Section title="Tray Outfeed & Placement">
        <Segmented
          value={c.placeMode}
          onChange={(v) => set({ placeMode: v }, true)}
          options={[
            {
              value: 'trayConveyor',
              label: 'Tray conveyor',
              hint: 'Trays move past on a second belt: placing is another moving-target intercept',
            },
            {
              value: 'staticTrays',
              label: 'Static trays',
              hint: 'Fixed trays next to the belt, swapped when full',
            },
          ]}
        />
        {c.placeMode === 'trayConveyor' && (
          <>
            <Segmented
              label="Tray direction"
              value={c.trayFlow}
              onChange={(v) => set({ trayFlow: v }, true)}
              options={[
                { value: 'counter', label: 'Counter-flow' },
                { value: 'co', label: 'Co-flow' },
              ]}
            />
            <Switch
              label="Sync tray belt to product rate"
              hint="Run the tray belt just fast enough to supply one slot per product"
              checked={c.traySync}
              onChange={(v) => set({ traySync: v })}
            />
            {!c.traySync && (
              <Slider
                label="Manual tray belt speed"
                value={c.traySpeed}
                min={0.02}
                max={0.4}
                step={0.01}
                unit=" m/s"
                onChange={(v) => set({ traySpeed: v })}
              />
            )}
          </>
        )}
      </Section>
    </>
  );
}

function WeedingSettings() {
  const c = useApp((s) => s.weeding);
  const set = useApp((s) => s.setWeeding);
  return (
    <>
      <Section title="Agricultural Crop Field">
        <Segmented
          value={c.field}
          onChange={(v: FieldPresetId) => set({ field: v }, true)}
          options={Object.values(FIELD_PRESETS).map((p) => ({
            value: p.id,
            label: p.label,
            hint: p.description,
          }))}
        />
        <Slider
          label="Weed density"
          value={c.weedDensity}
          min={1}
          max={15}
          step={0.5}
          unit=" /m²"
          digits={1}
          onChange={(v) => set({ weedDensity: v }, true)}
        />
        <Slider
          label="Vehicle speed"
          value={c.speed}
          min={0.03}
          max={0.4}
          step={0.01}
          unit=" m/s"
          onChange={(v) => set({ speed: v })}
        />
        <Segmented
          label="Run length"
          value={String(c.runLength)}
          onChange={(v) => set({ runLength: Number(v) }, true)}
          options={[
            { value: '0', label: 'Endless' },
            { value: '10', label: '10 m' },
            { value: '25', label: '25 m' },
          ]}
        />
      </Section>
      <Section title="Vision & Crop Safety">
        <Slider
          label="Classifier threshold"
          hint="Detections with a weed confidence above this are treated as weeds. Lower: fewer weeds missed, more crops pulled."
          value={c.threshold}
          min={0.05}
          max={0.95}
          step={0.01}
          onChange={(v) => set({ threshold: v })}
        />
        <Slider
          label="Extra crop clearance"
          hint="Distance kept between the gripper and crop canopies"
          value={c.clearance * 100}
          min={0}
          max={5}
          step={0.1}
          unit=" cm"
          digits={1}
          onChange={(v) => set({ clearance: v / 100 })}
        />
        <Segmented
          label="Weeds close to crops"
          value={c.clearancePolicy}
          onChange={(v) => set({ clearancePolicy: v })}
          options={[
            { value: 'skip', label: 'Skip', hint: 'Leave weeds that grow too close to a crop' },
            { value: 'attempt', label: 'Attempt', hint: 'Grip anyway, only avoiding the crop stem' },
          ]}
        />
      </Section>
      <Section title="Robot Scheduling & Disposal">
        <StrategyPicker value={c.strategy} onChange={(v) => set({ strategy: v })} />
        <Segmented
          label="Weed disposal"
          value={c.disposal}
          onChange={(v) => set({ disposal: v }, true)}
          options={[
            { value: 'bin', label: 'Bin', hint: 'Collect weeds in a bin on the vehicle' },
            { value: 'furrow', label: 'Furrow', hint: 'Drop pulled weeds into the furrow to dry out' },
          ]}
        />
      </Section>
    </>
  );
}

const CAMERAS: { value: CameraMode; label: React.ReactNode; hint: string }[] = [
  { value: 'follow', label: <Orbit size={14} className="mx-auto" />, hint: 'Overview (follows the workcell)' },
  { value: 'robot', label: <Camera size={14} className="mx-auto" />, hint: 'Close-up on the delta robot' },
  { value: 'top', label: <ScanLine size={14} className="mx-auto" />, hint: 'Top-down plan view' },
  { value: 'free', label: <Eye size={14} className="mx-auto" />, hint: 'Free orbit camera' },
];

function ViewSettings() {
  const { mode, camera, view, quality, set, setView } = useApp();
  return (
    <Section title="3D Viewport & Overlays">
      <Segmented label="Camera" value={camera} onChange={(v) => set('camera', v)} options={CAMERAS} />
      {mode !== 'manual' && (
        <>
          <Switch
            label="Workspace envelope"
            hint="Reachable volume of the tool tip"
            checked={view.workspace}
            onChange={(v) => setView({ workspace: v })}
          />
          <Switch label="Planned trajectory path" checked={view.path} onChange={(v) => setView({ path: v })} />
        </>
      )}
      {mode === 'weeding' && (
        <>
          <Switch
            label="Camera field of view"
            checked={view.vision}
            onChange={(v) => setView({ vision: v })}
          />
          <Switch
            label="Detection markers"
            checked={view.markers}
            onChange={(v) => setView({ markers: v })}
          />
        </>
      )}
      <Segmented
        label="Graphics quality"
        value={quality}
        onChange={(v) => set('quality', v)}
        options={[
          { value: 'high', label: 'High', hint: 'Shadows, ambient occlusion and bloom' },
          { value: 'low', label: 'Fast', hint: 'For slower devices' },
        ]}
      />
    </Section>
  );
}
