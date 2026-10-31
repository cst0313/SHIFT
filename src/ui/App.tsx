import { useEffect } from 'react';
import { Tooltip } from 'radix-ui';
import { Scene } from '@/render/Scene';
import { connectSimToStore } from '@/state/simHandle';
import { useApp } from '@/state/store';
import { writeUrlState } from '@/state/urlState';
import { TopBar } from './TopBar';
import { ChangeoverPanel } from './ChangeoverPanel';
import { ControlPanel } from './ControlPanel';
import { InteractiveLineBar } from './InteractiveLineBar';
import { ArchitectureSlideModal } from './ArchitectureSlideModal';
import { DiagnosticsCenterModal } from './DiagnosticsCenterModal';
import { RunSummary } from './RunSummary';
import { Benchmark } from './Benchmark';

export function App() {
  const panelOpen = useApp((s) => s.panelOpen);
  const mode = useApp((s) => s.mode);

  useEffect(() => connectSimToStore(), []);

  // shareable URL + keyboard shortcuts
  useEffect(
    () =>
      useApp.subscribe((s) =>
        writeUrlState(
          s.mode,
          s.mode === 'weeding' ? s.weeding : s.mode === 'pickPlace' ? s.pickPlace : null,
        ),
      ),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }
      const s = useApp.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        s.set('playing', !s.playing);
      } else if (e.key === 'r') s.restart();
      else if (e.key === '1') s.set('camera', 'follow');
      else if (e.key === '2') s.set('camera', 'robot');
      else if (e.key === '3') s.set('camera', 'top');
      else if (e.key === '4') s.set('camera', 'free');
      else if (e.key === 'Escape') {
        if (s.diagnosticsOpen) s.set('diagnosticsOpen', false);
        if (s.storyGuideOpen) s.set('storyGuideOpen', false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Tooltip.Provider>
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0">
          <Scene />
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2.5 p-2.5 sm:p-3.5">
          <TopBar />

          <div className="flex min-h-0 flex-1 items-end justify-between gap-3">
            {/* Bottom-Left: Single Unified Live Telemetry + Interactive Floor Bar */}
            <div className="flex shrink-0 flex-col justify-end">
              <InteractiveLineBar />
            </div>

            {/* Right Column: Clean 3-Step Changeover Workflow or Workcell Controls */}
            <div className="flex h-full min-h-0 shrink-0 flex-col items-end justify-end">
              {panelOpen && (mode === 'pickPlace' ? <ChangeoverPanel /> : <ControlPanel />)}
            </div>
          </div>
        </div>

        <ArchitectureSlideModal />
        <DiagnosticsCenterModal />
        <RunSummary />
        <Benchmark />
      </div>
    </Tooltip.Provider>
  );
}
