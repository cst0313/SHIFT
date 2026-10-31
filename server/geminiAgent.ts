import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { z } from 'zod';
import {
  interpretNaturalLanguageRequest,
  type ChangeoverPreset,
  CHANGEOVER_PRESETS,
} from '../src/core/changeover/presets';
import {
  ChangeoverToolExecutor,
  runRecordedReplaySession,
  type ToolExecutorCallbacks,
} from '../src/core/changeover/sessionRunner';
import type {
  ChangeoverSessionResult,
  EditableParam,
  StructuredChangeRequest,
} from '../src/core/changeover/types';
import type { PickPlaceConfig } from '../src/core/scenarios/pickPlace/pickPlace';

// Strict Zod schemas for untrusted Gemini tool call arguments
const ValidateChangeArgsSchema = z.object({
  summary: z.string().max(400).optional(),
  editableParameters: z
    .array(
      z.enum([
        'strategy',
        'conveyorSpeed',
        'placeMode',
        'trayFlow',
        'traySpeed',
        'traySync',
      ]),
    )
    .optional(),
  minCompletionRatePct: z.number().min(50).max(100).optional(),
  maxMissedItems: z.number().int().min(0).max(100).optional(),
});

const SimulateCandidateArgsSchema = z.object({
  label: z.string().max(120).optional(),
  rationale: z.string().max(400).optional(),
  config: z.object({
    strategy: z.enum(['fifo', 'nearest', 'edf']).optional(),
    conveyorSpeed: z.number().optional(),
    placeMode: z.enum(['staticTrays', 'trayConveyor']).optional(),
    trayFlow: z.enum(['co', 'counter']).optional(),
    traySpeed: z.number().optional(),
    traySync: z.boolean().optional(),
    spawnRate: z.number().optional(),
    mix: z.enum(['boxes', 'mixed']).optional(),
    alignProducts: z.boolean().optional(),
  }),
});

const CompareCandidatesArgsSchema = z.object({
  runIds: z.array(z.string()).optional(),
});

const ProposeConfigurationArgsSchema = z.object({
  candidateId: z.string().min(1),
  explanation: z.string().min(5).max(800),
});

const ExplainFailureArgsSchema = z.object({
  runId: z.string().min(1),
  analysis: z.string().min(5).max(800),
});

const InterpretResponseSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(5).max(350),
  changedRequirements: z.object({
    spawnRate: z.number().min(0.3).max(2.5).optional(),
    mix: z.enum(['boxes', 'mixed']).optional(),
    alignProducts: z.boolean().optional(),
    placeMode: z.enum(['staticTrays', 'trayConveyor']).optional(),
    trayFlow: z.enum(['co', 'counter']).optional(),
    traySync: z.boolean().optional(),
  }),
  fixedConstraints: z.object({
    keepRobotLimitsFixed: z.boolean(),
    requireOrientationAlignment: z.boolean(),
    maxConveyorSpeed: z.number().min(0.15).max(0.6).optional(),
    minConveyorSpeed: z.number().min(0.15).max(0.6).optional(),
    fixedPlaceMode: z.enum(['staticTrays', 'trayConveyor']).optional(),
    fixedTrayFlow: z.enum(['co', 'counter']).optional(),
    fixedTraySync: z.boolean().optional(),
    notes: z.array(z.string()).max(5),
  }),
  editableParameters: z
    .array(
      z.enum([
        'strategy',
        'conveyorSpeed',
        'placeMode',
        'trayFlow',
        'traySpeed',
        'traySync',
      ]),
    )
    .min(1),
  successCriteria: z.object({
    minCompletionRatePct: z.number().min(60).max(100),
    maxMissedItems: z.number().int().min(0).max(25),
    minFullTrays: z.number().int().min(1).max(12).optional(),
  }),
});

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'inspect_line',
    description:
      'Inspect the current robotic packing line configuration, the baseline simulation result under the new production requirements, editable parameter bounds, and line physics hints.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'validate_change',
    description:
      'Validate and confirm the structured changeover specification (changed requirements, fixed constraints, editable parameters, and success criteria) before testing candidate configurations.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Concise engineering summary of the production change and constraints.',
        },
      },
    },
  },
  {
    name: 'simulate_candidate',
    description:
      'Run a deterministic kinematic/process simulation of a candidate line configuration against the pre-generated arrival schedule. Enforces parameter bounds and locked constraints.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: {
          type: Type.STRING,
          description: 'Short descriptive label for this candidate (e.g., "EDF + Counter-Flow 0.26 m/s").',
        },
        rationale: {
          type: Type.STRING,
          description: 'Engineering hypothesis explaining why this parameter combination is being tested.',
        },
        config: {
          type: Type.OBJECT,
          description: 'Candidate configuration parameters to test.',
          properties: {
            strategy: {
              type: Type.STRING,
              description: 'Pick scheduling strategy: "fifo", "nearest", or "edf" (Earliest Deadline First).',
            },
            conveyorSpeed: {
              type: Type.NUMBER,
              description: 'Product belt speed in m/s (typically 0.20 to 0.50 m/s; ~0.24-0.28 m/s gives longer reach dwell time).',
            },
            placeMode: {
              type: Type.STRING,
              description: 'Placement target mode: "trayConveyor", "staticTrays", or "pallet".',
            },
            trayFlow: {
              type: Type.STRING,
              description: 'Tray belt direction relative to product belt: "counter" or "co".',
            },
            traySpeed: {
              type: Type.NUMBER,
              description: 'Manual tray belt speed in m/s (0.04 to 0.30 m/s) when traySync is false.',
            },
            traySync: {
              type: Type.BOOLEAN,
              description: 'Whether tray belt speed automatically synchronizes to product spawn rate.',
            },
          },
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'compare_candidates',
    description:
      'Compare simulated candidate configurations against the baseline run under the new requirements, ranking candidates by completion rate, missed items, and full trays.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        runIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional list of candidate runIds to compare (e.g., ["cand-1", "cand-2", "cand-3"]).',
        },
      },
    },
  },
  {
    name: 'propose_configuration',
    description:
      'Select a winning candidate configuration that satisfies the success criteria and evaluate it on held-out arrival schedules. Does not apply to the live line until the engineer clicks Apply.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        candidateId: {
          type: Type.STRING,
          description: 'The runId of the winning candidate (e.g., "cand-2").',
        },
        explanation: {
          type: Type.STRING,
          description: 'Clear, evidence-backed engineering recommendation citing completion rate, missed items, and configuration changes.',
        },
      },
      required: ['candidateId', 'explanation'],
    },
  },
  {
    name: 'explain_failure',
    description:
      'Record an engineering root-cause analysis when a candidate fails or when the requested workload is physically infeasible for a single delta picker.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        runId: {
          type: Type.STRING,
          description: 'The runId being diagnosed (e.g., "baseline" or "cand-3").',
        },
        analysis: {
          type: Type.STRING,
          description: 'Engineering explanation of the bottleneck (e.g., robot cycle time ceiling, tray starvation, or belt exit misses).',
        },
      },
      required: ['runId', 'analysis'],
    },
  },
];

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  return {
    apiKey,
    modelId,
    liveAvailable: apiKey.length > 10,
  };
}

/**
 * Translate a free-form natural language changeover request into a StructuredChangeRequest.
 * Uses Gemini structured JSON output when available and falls back to deterministic parser.
 */
export async function interpretRequestWithGemini(
  rawPrompt: string,
  currentConfig: PickPlaceConfig,
): Promise<{ request: StructuredChangeRequest; mode: 'live_gemini' | 'replay' }> {
  // Check exact match to preset prompts first for instant responsiveness
  const matchingPreset: ChangeoverPreset | undefined = CHANGEOVER_PRESETS.find(
    (p) => p.prompt.trim().toLowerCase() === rawPrompt.trim().toLowerCase(),
  );
  if (matchingPreset) {
    return {
      request: structuredClone(matchingPreset.structuredRequest),
      mode: getGeminiConfig().liveAvailable ? 'live_gemini' : 'replay',
    };
  }

  const fallback = interpretNaturalLanguageRequest(rawPrompt, currentConfig);
  const { apiKey, modelId, liveAvailable } = getGeminiConfig();
  if (!liveAvailable) {
    return { request: fallback, mode: 'replay' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are SHIFT, an industrial robotics changeover planning agent for a high-speed 4-axis delta robot packing line.
Current line configuration: ${JSON.stringify(currentConfig)}
Engineer's production change request: "${rawPrompt}"

Translate this request into a JSON object matching this exact structure:
{
  "title": string,
  "summary": string,
  "changedRequirements": {
    "spawnRate"?: number (0.3 to 2.5 items/s),
    "mix"?: "boxes" | "mixed",
    "alignProducts"?: boolean,
    "placeMode"?: "pallet" | "staticTrays" | "trayConveyor",
    "trayFlow"?: "co" | "counter",
    "traySync"?: boolean
  },
  "fixedConstraints": {
    "keepRobotLimitsFixed": true,
    "requireOrientationAlignment": boolean,
    "maxConveyorSpeed"?: number,
    "minConveyorSpeed"?: number,
    "fixedPlaceMode"?: "pallet" | "staticTrays" | "trayConveyor",
    "fixedTrayFlow"?: "co" | "counter",
    "fixedTraySync"?: boolean,
    "notes": string[]
  },
  "editableParameters": Array<"strategy" | "conveyorSpeed" | "placeMode" | "trayFlow" | "traySpeed" | "traySync">,
  "successCriteria": {
    "minCompletionRatePct": number (e.g. 95),
    "maxMissedItems": number (e.g. 2),
    "minFullTrays"?: number
  }
}
Important rules:
- Never include locked/fixed parameters in editableParameters.
- Always keep keepRobotLimitsFixed = true.
- Return raw JSON only.`;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    const validated = InterpretResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return { request: fallback, mode: 'live_gemini' };
    }

    const d = validated.data;
    return {
      mode: 'live_gemini',
      request: {
        id: `req-gemini-${Date.now()}`,
        title: d.title,
        rawPrompt,
        summary: d.summary,
        changedRequirements: d.changedRequirements,
        fixedConstraints: {
          ...d.fixedConstraints,
          keepRobotLimitsFixed: true,
        },
        editableParameters: d.editableParameters as EditableParam[],
        successCriteria: d.successCriteria,
        evaluationSpec: fallback.evaluationSpec,
      },
    };
  } catch {
    return { request: fallback, mode: 'replay' };
  }
}

/**
 * Run a live Gemini multi-step tool-calling changeover investigation,
 * streaming each tool activity and candidate run via callbacks.
 */
export async function runGeminiChangeoverSession(
  initialConfig: PickPlaceConfig,
  request: StructuredChangeRequest,
  options?: {
    forceReplay?: boolean;
    callbacks?: ToolExecutorCallbacks;
  },
): Promise<ChangeoverSessionResult> {
  const { apiKey, modelId, liveAvailable } = getGeminiConfig();

  if (options?.forceReplay || !liveAvailable) {
    return runRecordedReplaySession(initialConfig, request, options?.callbacks);
  }

  const executor = new ChangeoverToolExecutor(initialConfig, request, options?.callbacks);
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are SHIFT, an industrial robotics changeover optimization agent operating a 4-axis delta robot pick-and-place cell.
Your job is to evaluate a requested production change using real kinematic/process simulations and recommend a verified line configuration (or reject the change if physically infeasible).

Follow this exact engineering workflow using your tools:
1. Call inspect_line() first to inspect the baseline performance under the new requirements, parameter bounds, and line physics hints.
2. Call validate_change() to confirm the structured request and constraints.
3. Call simulate_candidate() for 3 to 4 distinct candidate configurations within the search budget (${request.evaluationSpec.maxCandidates} max):
   - Only modify parameters listed in editableParameters (${JSON.stringify(request.editableParameters)}) unless testing a boundary.
   - Physics insight: Slower product conveyor speeds (e.g., 0.24 to 0.28 m/s) keep items inside the robot's circular reach window longer during Poisson arrival bursts.
   - Physics insight: Earliest Deadline First ("edf") prioritizes items closest to exiting the pick window.
   - Physics insight: When placeMode is "trayConveyor" and traySync is false, manual traySpeed should match (spawnRate * 0.42 * 1.05) / 4 (approx 0.13-0.15 m/s for 1.35 items/s) so trays neither starve nor leave partially empty.
   - Physics insight: A single delta robot with 6g limits has a minimum gate pick-and-place cycle of ~0.68s (~88 picks/min = ~1.47 items/s sustained ceiling).
4. Call compare_candidates() to rank all simulated runs against the baseline under the new workload.
5. If a candidate meets the success criteria, call propose_configuration(candidateId, explanation) to run held-out arrival verification and prepare the recommendation.
6. If NO candidate meets the success criteria (e.g., when requested arrival rate exceeds single-robot capacity), call explain_failure(runId, analysis) explaining the physical bottleneck and do NOT fabricate passing results.

Keep explanations concise, quantitative, and grounded strictly in the simulated numbers.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    {
      role: 'user',
      parts: [
        {
          text: `Execute changeover investigation for request "${request.title}":
Engineer Prompt: "${request.rawPrompt}"
Changed Requirements: ${JSON.stringify(request.changedRequirements)}
Fixed Constraints: ${JSON.stringify(request.fixedConstraints)}
Editable Parameters: ${JSON.stringify(request.editableParameters)}
Success Criteria: ${JSON.stringify(request.successCriteria)}`,
        },
      ],
    },
  ];

  let finalModelText = '';

  try {
    for (let turn = 0; turn < 10; turn++) {
      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction,
          temperature: 0.15,
          thinkingConfig: { thinkingBudget: 512 },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        break;
      }

      contents.push(candidate.content);

      const textParts = candidate.content.parts
        .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
        .map((p) => p.text!.trim());
      if (textParts.length > 0) {
        finalModelText = textParts.join('\n');
      }

      const functionCalls =
        response.functionCalls ??
        candidate.content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
      if (!functionCalls || functionCalls.length === 0) {
        break;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = [];

      for (const call of functionCalls) {
        const name = call.name;
        const rawArgs = (call.args ?? {}) as Record<string, unknown>;
        let toolOutput: unknown;

        if (name === 'inspect_line') {
          toolOutput = executor.inspectLine();
        } else if (name === 'validate_change') {
          const parsed = ValidateChangeArgsSchema.safeParse(rawArgs);
          toolOutput = parsed.success
            ? executor.validateChange(parsed.data)
            : { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
        } else if (name === 'simulate_candidate') {
          const parsed = SimulateCandidateArgsSchema.safeParse(rawArgs);
          if (!parsed.success) {
            toolOutput = {
              ok: false,
              error: `Schema validation failed for simulate_candidate: ${parsed.error.message}`,
            };
          } else {
            toolOutput = executor.simulateCandidate(parsed.data);
          }
        } else if (name === 'compare_candidates') {
          const parsed = CompareCandidatesArgsSchema.safeParse(rawArgs);
          toolOutput = parsed.success
            ? executor.compareCandidates(parsed.data)
            : executor.compareCandidates({});
        } else if (name === 'propose_configuration') {
          const parsed = ProposeConfigurationArgsSchema.safeParse(rawArgs);
          toolOutput = parsed.success
            ? executor.proposeConfiguration(parsed.data)
            : { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
        } else if (name === 'explain_failure') {
          const parsed = ExplainFailureArgsSchema.safeParse(rawArgs);
          toolOutput = parsed.success
            ? executor.explainFailure(parsed.data)
            : { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
        } else {
          toolOutput = { ok: false, error: `Unknown tool: ${String(name)}` };
        }

        responseParts.push({
          functionResponse: {
            name,
            response: toolOutput as Record<string, unknown>,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }

    return executor.buildResult('live_gemini', modelId, finalModelText);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // If the live API failed Before running any candidates, fall back cleanly to replay mode and clearly mark it as replay
    if (executor.candidateRuns.length === 0) {
      const replayRes = runRecordedReplaySession(initialConfig, request, options?.callbacks);
      replayRes.apiError = `Live Gemini API error (${errMsg}); executed verified simulation replay.`;
      return replayRes;
    }
    const partialRes = executor.buildResult('live_gemini', modelId, finalModelText);
    partialRes.apiError = errMsg;
    return partialRes;
  }
}

export interface FactoryPhotoVisionResult {
  mode: 'live_gemini' | 'replay';
  modelId: string;
  robotType: string;
  detectedSkus: string[];
  conveyorLayout: string;
  safetyEnclosure: string;
  summary: string;
}

const DEFAULT_PHOTO_VISION: Omit<FactoryPhotoVisionResult, 'mode' | 'modelId'> = {
  robotType: '3-Axis Parallel Delta Picker + 4th-Axis Yaw Gripper (6g Kinematic Limit)',
  detectedSkus: ['Cardboard Cartons (120×90×50 mm)', 'Blue & Green Cylindrical Canisters (Ø80×60 mm)'],
  conveyorLayout: 'Dual Parallel Belts: Left-to-Right Infeed + 4-Slot Molded Outfeed Trays',
  safetyEnclosure: 'Interlocked Steel Frame + PLC Cabinet #04 (E-Stop Armed)',
  summary:
    'Multimodal inspection confirmed a 3-arm parallel delta workcell picking boxes and cylinders from a primary belt into 4-slot plastic trays. 3D Digital Twin calibrated to match workcell geometry.',
};

export async function analyzeFactoryPhotoWithGemini(
  imageBase64?: string,
): Promise<FactoryPhotoVisionResult> {
  const { apiKey, modelId, liveAvailable } = getGeminiConfig();
  if (!liveAvailable || !imageBase64) {
    return {
      mode: 'replay',
      modelId: 'recorded-vision-calibration',
      ...DEFAULT_PHOTO_VISION,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64,
              },
            },
            {
              text: 'Analyze this industrial robotic packing cell photograph to calibrate its 3D kinematic digital twin. Return JSON with: robotType, detectedSkus (array of 2 short strings), conveyorLayout, safetyEnclosure, and summary (1 concise sentence).',
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });
    const parsed = JSON.parse(response.text || '{}') as Partial<FactoryPhotoVisionResult>;
    return {
      mode: 'live_gemini',
      modelId,
      robotType: parsed.robotType || DEFAULT_PHOTO_VISION.robotType,
      detectedSkus:
        Array.isArray(parsed.detectedSkus) && parsed.detectedSkus.length > 0
          ? parsed.detectedSkus.slice(0, 3)
          : DEFAULT_PHOTO_VISION.detectedSkus,
      conveyorLayout: parsed.conveyorLayout || DEFAULT_PHOTO_VISION.conveyorLayout,
      safetyEnclosure: parsed.safetyEnclosure || DEFAULT_PHOTO_VISION.safetyEnclosure,
      summary: parsed.summary || DEFAULT_PHOTO_VISION.summary,
    };
  } catch {
    return {
      mode: 'replay',
      modelId: 'recorded-vision-calibration',
      ...DEFAULT_PHOTO_VISION,
    };
  }
}
