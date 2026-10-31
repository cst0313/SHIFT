import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (val) {
        process.env[key] = val;
      }
    }
  }
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const OUT_DIR = path.resolve(process.cwd(), 'demo_video_build');
const FINAL_MP4 = path.resolve(process.cwd(), 'SHIFT_Demo_Jeffrey_Chang.mp4');
const ARTIFACT_MP4 =
  'C:/Users/jeffp/.gemini/antigravity/brain/4aa97b6f-15e1-487d-94f4-58787eb31527/SHIFT_Demo_Jeffrey_Chang.mp4';

const SEGMENTS = [
  {
    id: 'seg1_problem',
    text: 'When factory orders change, robots drop boxes, and manual trial and error stops the line for 60 minutes. With SHIFT, you snap a photo, Gemini tests 4 recipes in a 3D digital twin, and applies the winner in 12 seconds.',
  },
  {
    id: 'seg2_arch',
    text: 'Under the hood, Gemini Vision calibrates our 3D Delta cell, locks 6G safety limits so the agent cannot cheat, and runs a 6-tool kinematic simulation loop across 3 random seeds.',
  },
  {
    id: 'seg3_scan',
    text: 'Here is our live packing cell. In Step 1, we scan the raw camera photo with Gemini Vision—detecting the PLC cabinet, Delta picker, and conveyor belts—and slide directly into our live 3D simulation.',
  },
  {
    id: 'seg4_interactive',
    text: 'Now watch what happens when we drop 6 extra boxes onto the belt: Gemini immediately triggers a 10G surge sprint and brakes the belt to 0.15 meters per second. And one click flips the tray belt direction and clears the line.',
  },
  {
    id: 'seg5_changeover',
    text: 'Finally, for an 83 item per minute demand surge, Gemini simulates 4 candidate recipes, switches from greedy Nearest to Earliest Deadline First, and applies 100 percent packing completion with zero dropped boxes.',
  },
];

async function synthesizeSpeech(text, outFile) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is missing in .env');
  }

  const voiceIds = ['JBFqnCBsd6RMkjVDRZzb', 'pNInz6obpgDQGcFmaJgB', '21m00Tcm4TlvDq8ikWAM'];
  const models = ['eleven_multilingual_v2', 'eleven_turbo_v2_5'];

  let lastError = '';
  for (const voiceId of voiceIds) {
    for (const modelId of models) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.52,
              similarity_boost: 0.78,
              style: 0.12,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(outFile, buf);
        return;
      }
      lastError = `${res.status}: ${await res.text()}`;
    }
  }

  throw new Error(`ElevenLabs TTS failed: ${lastError}`);
}

function getAudioDurationMs(filePath) {
  try {
    execFileSync(ffmpegPath, ['-i', filePath], { stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const hours = parseFloat(match[1]);
      const mins = parseFloat(match[2]);
      const secs = parseFloat(match[3]);
      return Math.round((hours * 3600 + mins * 60 + secs) * 1000);
    }
  }
  return 12000;
}

async function waitRemaining(stepStartMs, targetDurationMs) {
  const elapsed = Date.now() - stepStartMs;
  const remaining = Math.max(200, targetDurationMs - elapsed);
  return new Promise((r) => setTimeout(r, remaining));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('1. Generating ElevenLabs voiceover segments...');
  const durations = [];
  for (const seg of SEGMENTS) {
    const mp3Path = path.join(OUT_DIR, `${seg.id}.mp3`);
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 2000) {
      const dur = getAudioDurationMs(mp3Path);
      durations.push({ ...seg, mp3Path, durationMs: dur });
      console.log(`   - ${seg.id} (cached): ${(dur / 1000).toFixed(1)}s`);
    } else {
      await synthesizeSpeech(seg.text, mp3Path);
      const dur = getAudioDurationMs(mp3Path);
      durations.push({ ...seg, mp3Path, durationMs: dur });
      console.log(`   - ${seg.id} (synthesized): ${(dur / 1000).toFixed(1)}s`);
    }
  }

  console.log('2. Recording synchronized 1440x900 live browser demo...');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const videoStartWallMs = Date.now();
  const page = await context.newPage();
  const offsetsMs = [];

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // =========================================================================
  // SCENE 1: Pitch Slides 1 -> 2 -> 3
  // =========================================================================
  const s1Start = Date.now();
  offsetsMs.push(s1Start - videoStartWallMs);
  const s1Target = durations[0].durationMs + 450;
  await page.click('[data-testid="open-architecture-slide-btn"]');
  await page.waitForTimeout(Math.round(s1Target * 0.34));
  await page.click('[data-testid="slide-tab-2"]');
  await page.waitForTimeout(Math.round(s1Target * 0.33));
  await page.click('[data-testid="slide-tab-3"]');
  await waitRemaining(s1Start, s1Target);

  // =========================================================================
  // SCENE 2: Technical Architecture Slide 4 -> Slide 5 -> Close to Live App
  // =========================================================================
  const s2Start = Date.now();
  offsetsMs.push(s2Start - videoStartWallMs);
  const s2Target = durations[1].durationMs + 450;
  await page.click('[data-testid="slide-tab-4"]');
  await page.waitForTimeout(Math.round(s2Target * 0.72));
  await page.click('[data-testid="slide-tab-5"]');
  await page.waitForTimeout(Math.round(s2Target * 0.22));
  await page.click('[data-testid="close-architecture-slide-btn"]');
  await waitRemaining(s2Start, s2Target);

  // =========================================================================
  // SCENE 3: Step 1 Raw Unscanned Photo -> Gemini Vision Scan -> Live 3D Split
  // =========================================================================
  const s3Start = Date.now();
  offsetsMs.push(s3Start - videoStartWallMs);
  const s3Target = durations[2].durationMs + 450;
  await page.waitForTimeout(Math.round(s3Target * 0.22));
  await page.click('[data-testid="scan-photo-btn"]');
  await page.waitForTimeout(Math.round(s3Target * 0.35));
  await page.click('[data-testid="split-sim-only-btn"]');
  await page.waitForTimeout(Math.round(s3Target * 0.22));
  await page.click('[data-testid="split-50-btn"]');
  await waitRemaining(s3Start, s3Target);

  // =========================================================================
  // SCENE 4: Interactive Floor Perturbations (+6 Burst -> 10g Sprint, Flip Tray)
  // =========================================================================
  const s4Start = Date.now();
  offsetsMs.push(s4Start - videoStartWallMs);
  const s4Target = durations[3].durationMs + 450;
  await page.click('[data-testid="inject-burst-btn"]');
  await page.waitForTimeout(Math.round(s4Target * 0.56));
  await page.click('[data-testid="swap-tray-flow-btn"]');
  await waitRemaining(s4Start, s4Target);

  // =========================================================================
  // SCENE 5: Step 2 Diff -> Step 3 Parameter Testing -> Run 4 Configs & Apply
  // =========================================================================
  const s5Start = Date.now();
  offsetsMs.push(s5Start - videoStartWallMs);
  const s5Target = durations[4].durationMs + 1200;
  await page.click('[data-testid="next-to-step-2"]');
  await page.waitForTimeout(Math.round(s5Target * 0.2));
  await page.click('[data-testid="next-to-step-3"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="run-replay-btn"]');
  await page.waitForTimeout(Math.round(s5Target * 0.35));
  const applyBtn = page.locator('[data-testid="apply-config-button"]');
  if ((await applyBtn.count()) > 0) {
    await applyBtn.click();
  }
  await waitRemaining(s5Start, s5Target);

  const video = page.video();
  await context.close();
  await browser.close();

  const webmPath = await video.path();
  console.log('   Recorded WebM:', webmPath);
  console.log('   Scene start offsets (ms):', offsetsMs);

  // Build ffmpeg filter_complex to align each ElevenLabs segment to its exact scene start
  const inputArgs = ['-y', '-i', webmPath];
  const filterParts = [];
  const mixLabels = [];

  durations.forEach((seg, idx) => {
    inputArgs.push('-i', seg.mp3Path);
    const delayMs = Math.max(0, offsetsMs[idx] || 0);
    const audioInputIdx = idx + 1;
    const outLabel = `a${idx}`;
    filterParts.push(`[${audioInputIdx}:a]adelay=${delayMs}|${delayMs},volume=1.0[${outLabel}]`);
    mixLabels.push(`[${outLabel}]`);
  });

  const filterComplex = `${filterParts.join(';')};${mixLabels.join('')}amix=inputs=${durations.length}:duration=longest:dropout_transition=0,volume=${durations.length}[aout]`;

  console.log('3. Muxing HD video + timestamp-locked ElevenLabs voiceover into MP4...');
  execFileSync(
    ffmpegPath,
    [
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      FINAL_MP4,
    ],
    { stdio: 'inherit' }
  );

  fs.copyFileSync(FINAL_MP4, ARTIFACT_MP4);
  const sizeMb = (fs.statSync(FINAL_MP4).size / (1024 * 1024)).toFixed(2);
  console.log(`SUCCESS! Saved narrated MP4 demo video (${sizeMb} MB) to:`);
  console.log(`  1. ${FINAL_MP4}`);
  console.log(`  2. ${ARTIFACT_MP4}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
