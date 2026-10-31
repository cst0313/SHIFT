# SHIFT — AI Robot Changeover & Kinematic Line Simulator

> **Core Promise:** *"Describe the production change. Watch the agent test the alternatives."*

**SHIFT** is an interactive industrial control-room prototype built for the Gemini Hackathon on top of [Christian Diekmann's `delta` simulator](https://github.com/hcdiekmann/delta) (forked from commit `9efa3b320a0ba8716567fd55649a39b9b2ce18cd`, MIT License).

When a production requirement changes on a robotic packing line—such as a demand surge, a switch from uniform boxes to mixed SKUs (boxes + taller cylinders), or a downstream tray-flow constraint—a production engineer describes the change in plain language or selects a preset. **Gemini (`gemini-3.8-flash`)** translates the prompt into an editable structured specification, executes bounded simulations against an identical pre-generated arrival workload, verifies the finalist on held-out arrival schedules, and presents the exact configuration diff and measured before/after evidence for engineer approval (**Apply**, **Undo**, **Replay Comparison**).

---

## Quick Start

Requires **Node.js 22+**.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional for replay mode; required for live Gemini)
cp .env.example .env
# Set GEMINI_API_KEY in .env (or in your OS environment variables)

# 3. Start the application (Vite + server-side Node Gemini agent middleware)
npm run dev
```

Open **`http://localhost:5173`**.

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite dev server + server-side `/api/agent/*` Gemini service on `http://localhost:5173` |
| `npm run server` | Starts standalone Node API server on `http://localhost:3001` (`server/index.ts`) |
| `npm test` | Runs all 60 Vitest unit & invariant tests (54 inherited + 6 SHIFT changeover verification suites) |
| `npm run typecheck` | Runs TypeScript (`tsc -b`) across both client (`src/`) and server (`server/`) |
| `npm run lint` | Runs ESLint with strict core-isolation boundary checks |
| `npm run build` | Type-checks and builds production bundle into `dist/` |

---

## Inherited Baseline vs. Novel Contributions in SHIFT

### Inherited from `hcdiekmann/delta` (`9efa3b320a0ba8716567fd55649a39b9b2ce18cd`)
- **4-Axis Delta Robot Model & Kinematics (`src/core/kinematics/`)**: Closed-form inverse kinematics, three-sphere forward kinematics, analytical Jacobian, motor angle limits (`[-104.5°, +45.5°]`), passive ball-joint tilt limits (`46.6°`), reachable workspace slicer, and lumped-mass Jacobian-transpose motor torque estimation (`38.5:1` gearbox).
- **Motion Planning & Controller (`src/core/motion/`, `src/core/robot/`)**: Jerk-limited double-S industrial gate profiles (`vMax = 5 m/s`, `aMax = 60 m/s²`, `jMax = 3000 m/s³`), carrier + relative moving-target conveyor interception, and 240 Hz task controller state machine.
- **Baseline Scenarios & Renderer (`src/core/scenarios/`, `src/render/`)**: Pick & place and autonomous weeding worlds, scheduling strategies (`fifo`, `nearest`, `edf`), React Three Fiber 3D scene, `StatsHud`, `JointChart`, and Web Worker strategy benchmark.

### Built for SHIFT (New Work)
1. **Fair Workload Spawning & Accounting (`src/core/scenarios/pickPlace/pickPlace.ts`)**:
   - Pre-generated arrival schedules (`generateArrivalSchedule()`) using an isolated PRNG so conveyor speed, blocked entry checks, and product-mix branches never alter the offered arrival stream across candidates.
   - FIFO entry backlog queue (`pendingArrivals`) when belt entry (`xStart = -2.4 m`) is momentarily occupied, preventing fast-versus-slow belt speeds from silently dropping demand.
   - Explicit conservation accounting (`offered = placed + missed + unfinished`, where `unfinished = queued + onBelt + carried`) so items still in transit at the end of a run are never counted as successful placements.
2. **Constraint-Enforced Changeover Evaluator (`src/core/changeover/`)**:
   - Strict separation between **Changed Requirements** (workload), **Fixed Constraints** (locked hardware/process rules), **Editable Parameters** (agent search space), and **Success Criteria**.
   - Guardrails in `validateCandidateConfig()` that reject out-of-range parameters, attempts to lower required `spawnRate`, attempts to disable required orientation alignment (`alignProducts`), or edits to locked parameters.
   - Held-out generalisation evaluator (`evaluateHeldOutSummary()`) that tests the selected finalist against 3 unseen arrival schedules (`seeds: [101, 202, 303]`) and reports mean + `[min–max]` range.
3. **Server-Side Gemini Tool-Calling Agent (`server/geminiAgent.ts`, `server/index.ts`)**:
   - Uses `@google/genai` (`gemini-3.8-flash`, configurable via `GEMINI_MODEL`) with server-side credentials (`GEMINI_API_KEY`).
   - Exposes 6 `zod`-validated tools: `inspect_line`, `validate_change`, `simulate_candidate`, `compare_candidates`, `propose_configuration`, and `explain_failure`.
   - Streams real-time NDJSON tool activity and candidate results to the browser, with automatic fallback to deterministic simulation replay (`mode: 'replay'`) if credentials are absent.
4. **Industrial Control-Room Changeover UI (`src/ui/ChangeoverPanel.tsx`, `src/ui/ComparisonDock.tsx`, `src/ui/TopBar.tsx`)**:
   - Four realistic presets (**A. Demand Surge**, **B. Product Mix Change**, **C. Co-Flow Manual Tray Recipe**, **D. Infeasible 2.50 items/s Overload**) plus natural-language request parsing.
   - Editable Structured Request Card, live tool activity feed, candidate cards, before/after comparison dock, held-out summary badge, configuration diff pills, **Apply Configuration**, **Undo**, **Replay Comparison**, **Reset**, and **Export Evidence JSON**.

---

## Scope, Checked Invariants & Limitations

- **Kinematic & Process Simulation Only**: This prototype evaluates kinematic reachability, jerk-limited motion timing, moving-target conveyor interception, and scheduling throughput in browser simulation. It does not deploy code to a physical PLC/robot controller, certify functional safety, or simulate soft-body grasp contact physics.
- **Exact vs. Estimated Metrics**:
  - **Exact (deterministic 240 Hz simulation)**: `offered`, `placed`, `missed`, `unfinished`, `completionRatePct`, `throughputPpm`, `traysFilled`, `incompleteTrays`, and inverse-kinematics joint/ball-joint angle checks.
  - **Estimated**: `peakTorqueNm` and `rmsTorqueNm` use a lumped-mass dynamic approximation (splitting forearm rod mass between elbow and effector and mapping effector acceleration through the Jacobian transpose).
- **Fixed Cell Geometry**: Conveyor belt positions (`y = 0.08 m` and `y = -0.34 m`), belt width, and robot mounting height (`1.12 m`) are fixed constants (`LAYOUT` in `pickPlace.ts`).

---

## Attribution & License

- Base Delta Robot Simulator: **MIT License © Christian Diekmann** ([`hcdiekmann/delta`](https://github.com/hcdiekmann/delta), starting commit `9efa3b320a0ba8716567fd55649a39b9b2ce18cd`).
- SHIFT AI Changeover Engine & Control-Room Interface: **MIT License**. See [`LICENSE`](LICENSE).
