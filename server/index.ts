import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeFactoryPhotoWithGemini,
  getGeminiConfig,
  interpretRequestWithGemini,
  runGeminiChangeoverSession,
} from './geminiAgent';
import type { PickPlaceConfig } from '../src/core/scenarios/pickPlace/pickPlace';
import type { StructuredChangeRequest } from '../src/core/changeover/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export async function handleShiftApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/agent/')) {
    return false;
  }

  loadDotEnv();

  if (req.method === 'GET' && url.pathname === '/api/agent/status') {
    const cfg = getGeminiConfig();
    sendJson(res, 200, {
      liveAvailable: cfg.liveAvailable,
      modelId: cfg.modelId,
      mode: cfg.liveAvailable ? 'live_gemini' : 'replay',
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent/analyze-photo') {
    try {
      const photoPath = path.join(ROOT_DIR, 'public', 'factory-line-photo.png');
      const imageBase64 = fs.existsSync(photoPath)
        ? fs.readFileSync(photoPath).toString('base64')
        : undefined;
      const visionResult = await analyzeFactoryPhotoWithGemini(imageBase64);
      sendJson(res, 200, visionResult);
      return true;
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to analyze factory photo',
      });
      return true;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/agent/interpret') {
    try {
      const body = await readJsonBody<{
        rawPrompt?: string;
        currentConfig?: PickPlaceConfig;
      }>(req);
      if (!body.rawPrompt || !body.currentConfig) {
        sendJson(res, 400, { error: 'Missing rawPrompt or currentConfig' });
        return true;
      }
      const result = await interpretRequestWithGemini(body.rawPrompt, body.currentConfig);
      sendJson(res, 200, result);
      return true;
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to interpret request',
      });
      return true;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/agent/run') {
    try {
      const body = await readJsonBody<{
        initialConfig?: PickPlaceConfig;
        request?: StructuredChangeRequest;
        forceReplay?: boolean;
        stream?: boolean;
      }>(req);

      if (!body.initialConfig || !body.request) {
        sendJson(res, 400, { error: 'Missing initialConfig or request' });
        return true;
      }

      if (body.stream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });

        const writeEvent = (evt: unknown) => {
          res.write(JSON.stringify(evt) + '\n');
        };

        const result = await runGeminiChangeoverSession(body.initialConfig, body.request, {
          forceReplay: body.forceReplay,
          callbacks: {
            onActivity: (activity) => writeEvent({ type: 'activity', activity }),
            onCandidateRun: (run) => writeEvent({ type: 'candidate', run }),
          },
        });

        writeEvent({ type: 'result', result });
        res.end();
        return true;
      }

      const result = await runGeminiChangeoverSession(body.initialConfig, body.request, {
        forceReplay: body.forceReplay,
      });
      sendJson(res, 200, result);
      return true;
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to execute changeover session',
      });
      return true;
    }
  }

  sendJson(res, 404, { error: `Route not found: ${req.method} ${url.pathname}` });
  return true;
}

export function createShiftApiServer() {
  return http.createServer(async (req, res) => {
    const handled = await handleShiftApiRequest(req, res);
    if (!handled) {
      sendJson(res, 404, { error: 'Not Found' });
    }
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (isMain) {
  const port = Number(process.env.PORT || 3001);
  const server = createShiftApiServer();
  server.listen(port, () => {
    const cfg = getGeminiConfig();
    console.log(
      `[SHIFT Agent API] Listening on http://localhost:${port} | mode=${cfg.liveAvailable ? 'LIVE_GEMINI' : 'REPLAY_FALLBACK'} | model=${cfg.modelId}`,
    );
  });
}
