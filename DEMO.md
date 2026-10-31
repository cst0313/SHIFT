# SHIFT — 90-Second Live Hackathon Demo Script & Fallback Procedure

## Core Promise
> *"Describe the production change. Watch the agent test the alternatives."*

---

## Pre-Demo Checklist (30 seconds before going on stage)
1. Ensure the dev server is running from `C:\Users\jeffp\OneDrive\Desktop\Hackathons\Shift(Gemini)`:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5173` in Chrome or Edge at `100%` zoom (verified zero-cutoff at both `1440×900` projector and `1100×720` laptop resolutions).
3. Click **Reset** in the top bar so the line starts in its clean baseline state (`1.00 items/s`, `Nearest` scheduler, `0.48 m/s` belt, `0.09 m/s` manual tray belt) and confirm the green **`LIVE · gemini-3.8-flash`** badge is visible in the top bar.

---

## 90-Second Presentation Script

### 0:00 – 0:20 · The Engineer's Reality ("Before SHIFT" Magic Moment)
- **On screen**: A realistic 3D industrial packaging cell (**PACKING CELL #04**) with an upstream carton sealer tunnel, overhead machine-vision laser scanner bridge, 3-lamp Andon stack tower (Green), PLC/servo cabinet, and safety perimeter.
- **Action**: Point to the top-left **"Production Engineer's Life: Before vs. With SHIFT"** card and click **`1. Watch Line Without SHIFT`**.
- **On screen**: The upstream sealer surges to `1.38 cartons/s`. Immediately, the unadjusted line falls behind, cartons pile into the stainless reject chute, the optical overflow beacon flashes red, and the **Andon Stack Light switches to RED** (`OVERFLOW WARNING` in the bottom KPI bar).
- **Say**:
  *"Every day in high-mix packaging plants, an upstream carton sealer speeds up or SKUs change. Before SHIFT, a production engineer stands at the PLC cabinet for 40 minutes tweaking VFD belt speeds and scheduling flags by trial-and-error while cartons pile into the reject bin."*

### 0:20 – 0:55 · "With SHIFT" — Live Gemini Tool Execution & Fair Simulation
- **Action**: In the right-hand **AI Changeover Copilot**, Preset **A. Demand Surge** is active (`Upstream carton sealer surged output to 1.38 items/s...`). Click **`Test Alternatives (Live Gemini)`** (or expand **`Spec: 1.38/s · boxes · ≥95% ▾`** to show the locked 6g robot limits and editable parameters).
- **On screen**: Watch Gemini stream live tool calls:
  1. `Reading constraints` (`inspect_line`): Baseline under the new `1.38 items/s` workload drops to **82.6% completion (8 missed items)**.
  2. `Validating change request` (`validate_change`).
  3. `Testing candidate 1..4` (`simulate_candidate`): Every candidate faces the **exact same pre-generated arrival schedule (`46 offered items`)**.
  4. `Evaluating finalist on held-out arrivals` (`propose_configuration`): Verified on **3 unseen arrival schedules (`seeds 101, 202, 303`)**, improving held-out mean completion from **90.7% → 97.0%**.

### 0:55 – 1:15 · 1-Click Apply, On-Demand Statistics Center & 3D Replay
- **On screen**: The compact **Before/After Recommendation Card** appears in the right panel (`Completion: 82.6% → 100%`, `Missed: 8 → 0`, `Placed: 38/46 → 46/46`).
- **Action**: Click **`Apply Configuration`**.
- **On screen**: The live 3D workcell switches to the verified recipe, the Andon tower returns to **GREEN**, and missed items drop to **0**.
- **Action**: Click **`Statistics & Controls`** in the top bar (or **`Open Full Candidate Matrix & Replay Center ↗`**) to show the on-demand deep-dive modal:
  - **Tab 1 (`Candidate Matrix & Replay Center`)**: Full candidate table, 3-seed held-out breakdown, and 3D Before/After replay toggle.
  - **Tab 2 (`Robot Telemetry & Joint Dynamics`)**: Live 3-axis joint angle, velocity, and dynamic torque charts (`JointChart`).
  - **Tab 3 (`Manual Line Controls & Benchmark`)**: Manual PLC sliders and 4-strategy Web Worker benchmark.

### 1:15 – 1:30 · Honest Rejection of Infeasible Requests (Preset D)
- **Action**: Close the modal, click **D. Infeasible Overload** (`2.50 items/s = 150 items/min`), and click **Replay** (or **Test Alternatives**).
- **On screen**: SHIFT tests top candidates, proves the 6g kinematic ceiling (~88 picks/min) is exceeded (`63.4% completion, 30 missed`), and displays **`Rejected — Infeasible Workload`** instead of hallucinating a pass.

---

## Fallback Procedure (Network Outage / API Quota / Missing Credentials)
1. **Instant Button Fallback**: Next to **Test Alternatives** is the **Replay** button. Clicking **Replay** executes the exact same `ChangeoverToolExecutor` and real deterministic `PickPlaceScenario` kinematic simulations locally in `< 1 second`, clearly badged as **`Sim Replay`**.
2. **Automatic Graceful Degradation**: If `GEMINI_API_KEY` is absent or unreachable, SHIFT automatically falls back to `runRecordedReplaySession` and labels the UI badge **`REPLAY`**.
