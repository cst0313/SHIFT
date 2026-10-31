import { describe, expect, it, beforeEach } from 'vitest';
import { CHANGEOVER_PRESETS, INITIAL_LINE_CONFIG } from '@/core/changeover/presets';
import { computeConfigDiff } from '@/core/changeover/evaluator';
import { runRecordedReplaySession } from '@/core/changeover/sessionRunner';
import { useApp } from './store';

describe('SHIFT store Apply, Undo, Reset & non-mutation invariants', () => {
  beforeEach(() => {
    useApp.getState().resetLineToDefault();
  });

  it('does not apply candidate configurations to the live store before the user clicks Apply, and supports Undo and Reset', () => {
    const presetB = CHANGEOVER_PRESETS[1]!;
    const req = structuredClone(presetB.structuredRequest);
    req.evaluationSpec.arrivalWindowSeconds = 16;
    req.evaluationSpec.drainSeconds = 10;
    req.evaluationSpec.heldOutSeeds = [101];

    const initialLiveConfig = structuredClone(useApp.getState().pickPlace);

    // Selecting a preset or running a session must NOT mutate live pickPlace config
    useApp.getState().selectPreset('product_change');
    expect(useApp.getState().pickPlace).toEqual(initialLiveConfig);

    const session = runRecordedReplaySession(presetB.baselineLineConfig, req);
    expect(session.status).toBe('recommended');
    expect(session.recommendedConfig).not.toBeNull();

    useApp.getState().setSessionResult(session);
    // Still untouched before clicking Apply!
    expect(useApp.getState().pickPlace).toEqual(initialLiveConfig);
    expect(useApp.getState().hasAppliedActiveRecommendation).toBe(false);

    // Now user clicks Apply
    const applied = useApp.getState().applyRecommendedConfig();
    expect(applied).toBe(true);
    expect(useApp.getState().pickPlace).toEqual(session.recommendedConfig);
    expect(useApp.getState().hasAppliedActiveRecommendation).toBe(true);
    expect(useApp.getState().appliedConfigHistory.length).toBe(1);

    // Verify configuration diff matches the actual before/after difference
    const diff = computeConfigDiff(
      session.baselineUnderNewRequirementsConfig,
      session.recommendedConfig!,
    );
    expect(diff.length).toBeGreaterThan(0);
    expect(session.configDiff).toEqual(diff);

    // Now user clicks Undo
    const undone = useApp.getState().undoAppliedConfig();
    expect(undone).toBe(true);
    expect(useApp.getState().pickPlace).toEqual(initialLiveConfig);
    expect(useApp.getState().hasAppliedActiveRecommendation).toBe(false);

    // Apply again and test Reset
    useApp.getState().applyRecommendedConfig();
    useApp.getState().resetLineToDefault();
    expect(useApp.getState().pickPlace).toEqual(INITIAL_LINE_CONFIG);
    expect(useApp.getState().activeSession).toBeNull();
  });
});
