import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Play, Table2, BarChart3, X, Loader2 } from 'lucide-react';
import { useApp } from '@/state/store';
import { runBenchmark, type BenchmarkRequest, type StrategyResult } from '@/core/benchmark';
import { STRATEGIES } from '@/core/scheduling/scheduler';
import { SERIES_COLORS } from '@/lib/palette';
import { cn, fmt } from '@/lib/utils';
import { Segmented } from './components/controls';

type Status =
  | { state: 'idle' }
  | { state: 'running'; done: number; total: number }
  | { state: 'done'; results: StrategyResult[] };

const LABEL: Record<string, string> = {
  edf: 'EDF (Front-most)',
  fifo: 'FIFO (Oldest)',
  nearest: 'Nearest (Closest)',
  spt: 'SPT (Fastest pick)',
};

export function BenchmarkPanel({ autoRunOnMount = false }: { autoRunOnMount?: boolean }) {
  const mode = useApp((s) => s.mode);
  const [seeds, setSeeds] = useState('3');
  const [seconds, setSeconds] = useState('30');
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = useCallback(
    (seedCount = Number(seeds), simSeconds = Number(seconds)) => {
      const s = useApp.getState();
      const req: BenchmarkRequest =
        s.mode === 'weeding'
          ? { kind: 'weeding', config: s.weeding, seeds: seedCount, seconds: simSeconds }
          : { kind: 'pickPlace', config: s.pickPlace, seeds: seedCount, seconds: simSeconds };

      worker.current?.terminate();
      try {
        const w = new Worker(new URL('../workers/benchmark.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.current = w;
        setStatus({ state: 'running', done: 0, total: STRATEGIES.length * req.seeds });
        w.onmessage = (e) => {
          if (e.data.type === 'progress') {
            setStatus({ state: 'running', done: e.data.done, total: e.data.total });
          } else {
            setStatus({ state: 'done', results: e.data.results });
            w.terminate();
          }
        };
        w.onerror = () => {
          const results = runBenchmark(req);
          setStatus({ state: 'done', results });
          w.terminate();
        };
        w.postMessage(req);
      } catch {
        const results = runBenchmark(req);
        setStatus({ state: 'done', results });
      }
    },
    [seeds, seconds],
  );

  useEffect(() => {
    if (autoRunOnMount && status.state === 'idle') {
      run(3, 30);
    }
  }, [autoRunOnMount, run, status.state]);

  return (
    <div
      data-testid="benchmark-panel"
      className="flex flex-col rounded-2xl border border-white/10 bg-black/35 p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h3 className="font-mono text-[12px] font-bold tracking-[0.08em] text-white uppercase">
            3-Strategy Multi-Seed Benchmark ({mode === 'weeding' ? 'Agri Weeding' : 'Pick & Place'})
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Evaluates <span className="font-mono text-slate-200">EDF (Front-First)</span>,{' '}
            <span className="font-mono text-slate-200">FIFO (Oldest)</span>, and{' '}
            <span className="font-mono text-slate-200">Nearest (Middle-Pick)</span> across identical random seeds in a Web Worker.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Segmented
          label="Seeds per strategy"
          value={seeds}
          onChange={setSeeds}
          options={[
            { value: '3', label: '3 seeds' },
            { value: '5', label: '5 seeds' },
            { value: '10', label: '10' },
          ]}
        />
        <Segmented
          label="Simulated window"
          value={seconds}
          onChange={setSeconds}
          options={[
            { value: '30', label: '30 s' },
            { value: '60', label: '60 s' },
            { value: '120', label: '2 min' },
          ]}
        />
        <button
          type="button"
          data-testid="run-benchmark-btn"
          onClick={() => run(Number(seeds), Number(seconds))}
          disabled={status.state === 'running'}
          className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-[12px] font-bold text-slate-950 shadow-sm hover:bg-emerald-400 disabled:opacity-50"
        >
          {status.state === 'running' ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play size={13} fill="currentColor" />
              <span>Run Benchmark</span>
            </>
          )}
        </button>
      </div>

      {status.state === 'running' && (
        <div className="my-4 space-y-1.5 rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${(100 * status.done) / status.total}%` }}
            />
          </div>
          <p className="tabular font-mono text-[11px] text-slate-300">
            Simulating {status.done} / {status.total} trajectories in background worker...
          </p>
        </div>
      )}

      {status.state === 'done' && (
        <div className="space-y-3" data-testid="benchmark-results">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Legend />
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  data-testid={`benchmark-view-${v}`}
                  aria-label={v === 'chart' ? 'Chart view' : 'Table view'}
                  onClick={() => setView(v)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white',
                    view === v && 'bg-white/10 text-white',
                  )}
                >
                  {v === 'chart' ? <BarChart3 size={13} /> : <Table2 size={13} />}
                  <span className="capitalize">{v}</span>
                </button>
              ))}
            </div>
          </div>
          {view === 'chart' ? (
            <SmallMultiples results={status.results} />
          ) : (
            <ResultTable results={status.results} />
          )}
          <p className="text-[11px] text-slate-400">
            Colored bars show the mean across seeds; horizontal whiskers show the min–max range across seeds.
          </p>
        </div>
      )}
    </div>
  );
}

/** Standalone Radix Dialog wrapper when triggered outside DiagnosticsCenterModal */
export function Benchmark() {
  const open = useApp((s) => s.benchmarkOpen);
  const set = useApp((s) => s.set);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => set('benchmarkOpen', o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[720px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-4 focus:outline-none">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="font-mono text-sm font-bold tracking-wider text-white uppercase">
              Strategy Benchmark Runner
            </Dialog.Title>
            <Dialog.Close
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Compare all 4 scheduling strategies across multiple random seeds.
          </Dialog.Description>
          <BenchmarkPanel autoRunOnMount />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-200">
      {STRATEGIES.map((s, i) => (
        <span key={s.id} className="inline-flex items-center gap-1.5 font-mono">
          <span
            className="size-2.5 shrink-0 rounded-xs"
            style={{ background: SERIES_COLORS[i] ?? '#38bdf8' }}
          />
          <span>{LABEL[s.id] ?? s.label}</span>
        </span>
      ))}
    </div>
  );
}

/** One mini horizontal bar chart per metric (different units never share an axis). */
function SmallMultiples({ results }: { results: StrategyResult[] }) {
  const metrics = results[0]!.metrics;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map((m, j) => {
        const max = Math.max(...results.map((r) => r.metrics[j]!.max), 1e-9) * 1.05;
        const best = results.reduce((b, r) =>
          (
            m.higherIsBetter
              ? r.metrics[j]!.mean > b.metrics[j]!.mean
              : r.metrics[j]!.mean < b.metrics[j]!.mean
          )
            ? r
            : b,
        );
        return (
          <figure
            key={m.label}
            className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5"
          >
            <figcaption className="mb-2 flex items-baseline justify-between gap-1 leading-tight">
              <div className="text-[11.5px] font-semibold text-slate-200">
                {m.label}{' '}
                {m.unit && <span className="font-mono text-[10px] text-slate-400">[{m.unit}]</span>}
              </div>
              <div className="text-[9.5px] text-slate-500">
                {m.higherIsBetter ? 'higher better' : 'lower better'}
              </div>
            </figcaption>
            <div className="space-y-1.5">
              {results.map((r, i) => {
                const s = r.metrics[j]!;
                const pct = (v: number) => `${Math.min(100, Math.max(0, (100 * v) / max))}%`;
                const strategyShort = r.strategy.toUpperCase();
                return (
                  <div
                    key={r.strategy}
                    className="group grid grid-cols-[2.8rem_1fr_3.2rem] items-center gap-1.5"
                    title={`${LABEL[r.strategy] ?? r.strategy}: mean ${fmt(s.mean, 2)} ${m.unit} (min ${fmt(s.min, 2)}, max ${fmt(s.max, 2)})`}
                  >
                    <span className="truncate font-mono text-[9.5px] text-slate-400">
                      {strategyShort}
                    </span>
                    <div className="relative h-4 rounded-xs bg-white/[0.04]">
                      <div
                        className="absolute top-0 left-0 h-4 rounded-r-[3px] transition-opacity group-hover:opacity-85"
                        style={{
                          width: pct(s.mean),
                          background: SERIES_COLORS[i] ?? '#38bdf8',
                        }}
                      />
                      {/* min-max whisker */}
                      <div
                        className="absolute top-1/2 h-px bg-slate-100/80"
                        style={{ left: pct(s.min), width: `calc(${pct(s.max)} - ${pct(s.min)})` }}
                      />
                      <div
                        className="absolute top-[3px] h-2.5 w-px bg-slate-100/80"
                        style={{ left: pct(s.min) }}
                      />
                      <div
                        className="absolute top-[3px] h-2.5 w-px bg-slate-100/80"
                        style={{ left: pct(s.max) }}
                      />
                    </div>
                    <span
                      className={cn(
                        'tabular text-right font-mono text-[10.5px] text-slate-300',
                        r === best && 'font-bold text-emerald-300',
                      )}
                    >
                      {fmt(s.mean, s.mean >= 100 ? 0 : s.mean >= 10 ? 1 : 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </figure>
        );
      })}
    </div>
  );
}

function ResultTable({ results }: { results: StrategyResult[] }) {
  const metrics = results[0]!.metrics;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
      <table className="w-full text-left text-[11.5px]">
        <thead className="border-b border-white/10 bg-white/[0.03] font-mono text-[10px] text-slate-400 uppercase">
          <tr>
            <th className="px-3 py-2 font-semibold">Strategy</th>
            {metrics.map((m) => (
              <th key={m.label} className="px-2.5 py-2 text-right font-semibold">
                {m.label} {m.unit ? `[${m.unit}]` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 tabular font-mono text-slate-200">
          {results.map((r, idx) => (
            <tr key={r.strategy} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2 font-sans font-medium text-white">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-xs"
                    style={{ background: SERIES_COLORS[idx] ?? '#38bdf8' }}
                  />
                  <span>{LABEL[r.strategy] ?? r.strategy}</span>
                </span>
              </td>
              {r.metrics.map((s) => (
                <td key={s.label} className="px-2.5 py-2 text-right">
                  <span className="font-semibold text-white">{fmt(s.mean, 1)}</span>{' '}
                  <span className="text-[10px] text-slate-400">
                    ({fmt(s.min, 1)}–{fmt(s.max, 1)})
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
