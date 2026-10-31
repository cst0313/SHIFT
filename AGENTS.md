# SHIFT — Agent & Engineering Rules (`AGENTS.md`)

## 1. Upstream Baseline & Attribution
- **Upstream Repository**: [hcdiekmann/delta](https://github.com/hcdiekmann/delta) (MIT License © Christian Diekmann)
- **Starting Commit**: `9efa3b320a0ba8716567fd55649a39b9b2ce18cd`
- **Toolchain**: Node.js `v24.20.0` (`>=22` required), npm `11.19.0`, TypeScript `~6.0.3`, Vite `8.3.1`, Vitest `5.0.2`.
- **Baseline Verification**:
  - `npm ci` — installs 329 packages cleanly from lockfile.
  - `npm run build` — `tsc -b && vite build` succeeds cleanly.
  - `npm test` — 9 test files, 54 tests pass (`simLoop`, `trajectory`, `doubleS`, `dynamics`, `kinematics`, `workspace`, `pickPlace`, `weeding`, `benchmark`).

## 2. Strict Architectural Boundaries
- **`src/core/**/*.ts` Purity**: Enforced by `eslint.config.js`. Files under `src/core/` MUST NOT import `three`, `react`, `react-dom`, `@react-three/*`, `@/render/*`, `@/ui/*`, or `@/state/*`.
- **Why**: The exact same kinematic, scheduling, and scenario code executes inside:
  1. The 240 Hz fixed-step browser simulation loop (`SIM_DT = 1 / 240`),
  2. Web Workers for non-blocking UI evaluation,
  3. The local Node backend (`server/`) for Gemini tool execution, and
  4. Vitest unit/verification suites.
- **No Fake Physics or Claims**: This is a kinematic, jerk-limited trajectory, and process scheduling simulator with lumped-mass torque estimation. Do not claim physical robot deployment, certified collision safety, realistic grasp physics, or measured factory floor savings. State exact geometric/kinematic checks performed (reachability, joint angle limits `thetaMin`/`thetaMax`, ball-joint tilt limit `ballJointMax`, and moving-target intercept window feasibility).

## 3. Fair Comparison & Deterministic Workload Discovery
Inspecting `src/core/scenarios/pickPlace/pickPlace.ts` revealed why matching `seed` alone does **not** guarantee an identical offered workload across candidate configurations:
1. `spawnProduct()` consumes random numbers (`rng.next()`, `rng.range()`) *before* checking if the conveyor entry is blocked (`Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < 0.15`).
2. When blocked, `advanceWorld()` retries after `0.05s`, drawing additional values from `this.rng` and shifting the RNG stream depending on `conveyorSpeed`.
3. `mix === 'boxes'` short-circuits `this.rng.next() < 0.6`, shifting the RNG stream relative to `mix === 'mixed'`.

### Mandatory Evaluation Protocol (`src/core/changeover/`)
- **Pre-Generated Arrival Schedule**: Generate an explicit `ArrivalEvent[]` schedule (`id`, `time`, `kind`, `yOffset`, `yaw`, `color`) deterministically from `(seed, spawnRate, mix, duration)` using an isolated `Rng` instance before running any simulation.
- **Identical Offered Workload**: Pass the exact same `ArrivalEvent[]` schedule to the **Baseline** (old configuration facing the *new* production requirements) and every **Candidate** configuration.
- **Explicit Queue & Accounting**:
  - If an arrival reaches `t >= event.time` while the belt entry (`xStart`) is blocked within `0.15m`, place it in an explicit `pendingArrivals` FIFO queue and spawn it as soon as entry clearance permits.
  - Track and report:
    - `offered`: total scheduled arrivals in the evaluation window
    - `placed`: items successfully released into a valid tray slot
    - `missed`: items passing `LAYOUT.missX` (`0.9m`), falling off belt end, or aborted while carried
    - `queuedOrUnfinished`: items still in `pendingArrivals`, on the `belt`, `reserved`, or `carried` when evaluation ends (never counted as successful placements).
- **Held-Out Verification**: Finalist configurations must be evaluated on held-out arrival schedules (distinct seeds not inspected during candidate exploration) to report mean, min/max range, and sample count.

## 4. Gemini Agent Security & Guardrails
- **Server-Side Credentials Only**: `GEMINI_API_KEY` and `GEMINI_MODEL` are loaded exclusively by the Node backend from `.env` (which is git-ignored). Never expose API keys in `VITE_*` variables, client bundles, `localStorage`, screenshots, or logs.
- **Untrusted Model Output**: Validate all Gemini tool calls and structured responses with `zod` schemas.
- **Immutable Requirements & Limits**: The agent may only vary parameters listed in `editableParameters` within allowed physical bounds (`conveyorSpeed` in `[0.1, 0.6]`, `traySpeed` in `[0.02, 0.4]`, valid `strategy`, `placeMode`, `trayFlow`, `traySync`). The agent cannot reduce `spawnRate`, disable required `alignProducts`, change `mix`, or alter robot kinematic/motion limits (`PRESETS.picker`).
- **Explicit Engineer Approval**: `propose_configuration` only stages a recommendation with its verified evidence. The live simulation is never mutated until the engineer clicks **Apply** in the browser UI.

## 5. Environment & Windows Quirks
- The project directory path `C:\Users\jeffp\OneDrive\Desktop\Hackathons\Shift(Gemini)` contains parentheses; always quote paths or pass `-LiteralPath` in PowerShell.
- For Playwright browser verification (`playwright-core`), use installed Microsoft Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (`channel: 'msedge'`).
