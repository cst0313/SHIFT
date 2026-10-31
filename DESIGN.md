# SHIFT — Industrial Control-Room Visual System (`DESIGN.md`)

## 1. Aesthetic Direction & Core Principles
- **Persona**: Precision Industrial Control-Room Interface (Beckhoff / Siemens HMI meets high-contrast telemetry).
- **Zero-Cutoff Simplistic Main Surface**: The live 3D robotic packaging cell (`PACKING CELL #04`) occupies the full viewport (`100vw × 100vh`) with zero mode-switching clutter or bottom-dock overlap. All primary cards fit cleanly inside both `1440×900` (projector/desktop) and `1100×720` (laptop) screens without clipping.
- **Realistic 3D Factory Packaging Workcell**:
  - Upstream **Carton Sealer & Infeed Tunnel** at belt entry.
  - Overhead **Machine-Vision Camera & Cyan Laser Line-Scan Bridge** across the infeed conveyor.
  - Real-time **3-Lamp Andon Stack Light Tower** (Green = nominal zero-miss operation, Amber = evaluating / viewing Before replay, Red = missed cartons overflowing or infeasible overload).
  - Floor-standing **PLC & Servo Drive Cabinet** with live HMI display, E-stop mushroom button, and overhead cable conduit.
  - **VFD Gearmotor Housings**, **Stainless Overflow Reject Chute** with optical sensor beacon, and **Yellow/Black Safety Floor Perimeter** with corner safety bollards.

## 2. Color Tokens & Semantic Palette
- **Canvas / Background**: Deep graphite `#0b1015` (`--color-bg`), floor grid `#1a222b` / `#2b3643`.
- **Control Surfaces (`.glass`)**: Translucent slate `rgb(15 22 30 / 0.86)` with `1px solid rgb(255 255 255 / 0.09)` hairlines and subtle top-border specular highlight.
- **Primary Operational Accent (Active / Feasible / Recommended)**: Emerald Cyan `#34d399` (`--color-accent`) paired with Telemetry Cyan `#38bdf8` (`--color-accent-2`).
- **Warning / Constraint Boundary / Replay Badge**: Industrial Amber `#fbbf24` (`--color-warn`).
- **Rejected / Missed / Constraint Violation**: Signal Rose-Red `#fb7185` (`--color-bad`).

## 3. Typography & Numeric Discipline
- **UI Sans**: `Inter`, system-ui — crisp labels, uppercase section headers (`10px–11px`, `tracking-[0.12em]`, `font-semibold`, `text-slate-400`).
- **Telemetry & Diffs**: `JetBrains Mono` with mandatory `font-variant-numeric: tabular-nums` (`.tabular`) on all live counters, candidate tables, configuration diffs, and elapsed timers so numbers never jitter during 240 Hz updates.

## 4. Layout Architecture (Simplistic + On-Demand Deep Dive)
- **Top Bar (`TopBar.tsx`)**:
  - Brand mark (**SHIFT · PACKING CELL #04**) + single-sentence operational subtitle.
  - **Engine Status Badge**: Distinct `LIVE GEMINI` (emerald pulse) vs. `REPLAY` (amber badge).
  - Quick toggles: `Before vs. With SHIFT` story guide, `Statistics & Controls` modal trigger, `Change Production` panel toggle, and transport controls (`Play/Pause`, `0.5×–4×`, `Restart`, `Reset`).
- **Top-Left Story Guide (`StoryBanner.tsx`)**:
  - Contrasts the **Production Engineer's Life Before SHIFT** (manual VFD/PLC trial-and-error while cartons pile into the red reject chute) vs. **With SHIFT** (plain-language request → bounded candidate simulation → held-out verification → 1-click Apply).
  - Includes a 1-click **"1. Watch Line Without SHIFT"** button (`previewUnadjustedChangeOnLine()`) to immediately show the unadjusted line failing in 3D.
- **Bottom-Left Live KPI Pill (`StatsHud.tsx`)**:
  - Compact single-row bar showing line status (`LINE NOMINAL`, `OVERFLOW WARNING`, or `BEFORE/WITH SHIFT`), active recipe summary, and the 4 core KPIs (`Picks/min`, `Placed`, `Missed`, `Pick rate`) + `Telemetry & Charts` button.
- **Right Column (`ChangeoverPanel.tsx` — Full Height, Zero Cutoff)**:
  - Compact 2×2 preset selector (`A–D`) + natural-language prompt input.
  - 1-line Spec Summary chip (`Spec: 1.38/s · boxes · ≥95%`) with collapsible `Edit Spec ▾` drawer.
  - Inline `Test Alternatives` & `Replay` buttons.
  - Inline compact Tool Activity Log, Candidate Status Chips, and **Before/After Recommendation Card** (`Apply Configuration`, `Undo`, `Replay 3D`, `JSON`, and `Open Full Candidate Matrix & Replay Center ↗`).
- **On-Demand Statistics, Detailed Controls & Replay Center (`DiagnosticsCenterModal.tsx`)**:
  - Opened only when the user requests deep-dive data:
    1. **Candidate Matrix & Replay Center**: Full candidate table, 3-seed held-out distribution breakdown, full agent tool log, and 3D Before/After replay controls.
    2. **Robot Telemetry & Joint Dynamics**: All 8 live line metrics, 3-axis `JointChart` (angles, velocities, torques), camera presets, and engineering overlays.
    3. **Manual Line Controls & Benchmark**: Full `ControlPanel` sliders and 4-strategy Web Worker benchmark.
