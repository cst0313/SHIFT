import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const SFX_DIR = path.join(ROOT, 'public', 'sfx');
const BUILD_DIR = path.join(os.tmpdir(), 'shift_demo_synced_build');
fs.mkdirSync(BUILD_DIR, { recursive: true });

// Read ELEVENLABS_API_KEY from .env
const envText = fs.readFileSync(ENV_PATH, 'utf8');
const match = envText.match(/ELEVENLABS_API_KEY\s*=\s*([^\r\n]+)/);
if (!match || !match[1].trim()) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}
const API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

const PRESENTER_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George (warm, authoritative presenter)

async function generateTts(text, outFile) {
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 2000) {
    return outFile;
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${PRESENTER_VOICE}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.82,
          style: 0.22,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`TTS error ${res.status}: ${await res.text()}`);
  }
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  return outFile;
}

function getDurationSec(filePath) {
  try {
    execFileSync(FFMPEG, ['-i', filePath], { stdio: 'pipe' });
    return 5;
  } catch (e) {
    const stderr = (e.stderr || '').toString();
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (!m) return 5;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

async function main() {
  console.log('1) Generating presenter micro-cues in parallel via ElevenLabs...');
  const presenterLines = [
    {
      id: 'p01',
      text: 'On factory lines, orders change every hour. When carton flow surges by forty percent, robots fall behind and drop boxes.',
    },
    {
      id: 'p02',
      text: 'Today, retuning takes sixty minutes of manual downtime. With SHIFT, Gemini tunes the line in twelve seconds inside a 3D physics twin.',
    },
    {
      id: 'p03',
      text: 'Under the hood, Gemini Vision calibrates the cell, and our function-calling agent verifies four candidate recipes at sixty hertz.',
    },
    {
      id: 'p04',
      text: 'Here is our live app. In Step One, we start with a real camera photo of our Delta robot cell and conveyor.',
    },
    {
      id: 'p05',
      text: 'Watch as we click Gemini Vision Scan.',
    },
    {
      id: 'p06',
      text: 'We can also inspect a real field weeding robot photo, or slide open the full 3D simulation.',
    },
    {
      id: 'p07',
      text: 'Now watch when we drop six extra boxes onto the moving belt.',
    },
    {
      id: 'p08',
      text: 'Next, we click Flip Tray and Clear to reverse the tray conveyor on the fly.',
    },
    {
      id: 'p09',
      text: 'In Steps Two and Three, we preview the parameter diff and run four candidate configs in parallel.',
    },
    {
      id: 'p10',
      text: 'Now we click Apply Configuration to commit the winning recipe.',
    },
  ];

  await Promise.all(
    presenterLines.map((item) =>
      generateTts(item.text, path.join(BUILD_DIR, `${item.id}.mp3`)),
    ),
  );

  // Build the 10 cue audio blocks:
  // Some cues are pure presenter; interactive cues combine Presenter -> ElevenLabs SFX + ElevenLabs AI Copilot Voice (Sarah)!
  function makeSilence(sec, outPath) {
    execFileSync(FFMPEG, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-t',
      String(sec),
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      outPath,
    ]);
  }

  function concatMp3(files, outPath) {
    const listFile = `${outPath}.txt`;
    fs.writeFileSync(
      listFile,
      files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'),
    );
    execFileSync(FFMPEG, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outPath,
    ]);
  }

  function overlaySfxAndVoice(sfxFile, aiVoiceFile, outPath) {
    // Mixes the ElevenLabs SFX right at 0.0s with the AI Copilot voice starting at 0.25s
    execFileSync(FFMPEG, [
      '-y',
      '-i',
      sfxFile,
      '-i',
      aiVoiceFile,
      '-filter_complex',
      '[0:a]volume=0.85[sfx];[1:a]adelay=250|250,volume=1.15[ai];[sfx][ai]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[out]',
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outPath,
    ]);
  }

  const pad03 = path.join(BUILD_DIR, 'pad03.mp3');
  makeSilence(0.35, pad03);

  // Build combined SFX+AI response clips for the 4 interactive moments
  const sfxAiScan = path.join(BUILD_DIR, 'sfx_ai_scan.mp3');
  overlaySfxAndVoice(
    path.join(SFX_DIR, 'vision_scan.mp3'),
    path.join(SFX_DIR, 'ai_vision_locked.mp3'),
    sfxAiScan,
  );

  const sfxAiSurge = path.join(BUILD_DIR, 'sfx_ai_surge.mp3');
  overlaySfxAndVoice(
    path.join(SFX_DIR, 'surge_sprint.mp3'),
    path.join(SFX_DIR, 'ai_surge_engaged.mp3'),
    sfxAiSurge,
  );

  const sfxAiFlip = path.join(BUILD_DIR, 'sfx_ai_flip.mp3');
  overlaySfxAndVoice(
    path.join(SFX_DIR, 'tray_flip.mp3'),
    path.join(SFX_DIR, 'ai_tray_flipped.mp3'),
    sfxAiFlip,
  );

  const sfxAiApply = path.join(BUILD_DIR, 'sfx_ai_apply.mp3');
  overlaySfxAndVoice(
    path.join(SFX_DIR, 'apply_success.mp3'),
    path.join(SFX_DIR, 'ai_recipe_applied.mp3'),
    sfxAiApply,
  );

  // Assemble the master timeline of sequential audio parts so we know the EXACT millisecond each part begins!
  const sequence = [
    { id: 'c01_slide1', file: path.join(BUILD_DIR, 'p01.mp3') },
    { id: 'gap1', file: pad03 },
    { id: 'c02_slide2_3', file: path.join(BUILD_DIR, 'p02.mp3') },
    { id: 'gap2', file: pad03 },
    { id: 'c03_slide4', file: path.join(BUILD_DIR, 'p03.mp3') },
    { id: 'gap3', file: pad03 },
    { id: 'c04_step1_raw', file: path.join(BUILD_DIR, 'p04.mp3') },
    { id: 'c05a_scan_intro', file: path.join(BUILD_DIR, 'p05.mp3') },
    { id: 'c05b_scan_click', file: sfxAiScan },
    { id: 'gap5', file: pad03 },
    { id: 'c06_weeder_and_full3d', file: path.join(BUILD_DIR, 'p06.mp3') },
    { id: 'c07a_surge_intro', file: path.join(BUILD_DIR, 'p07.mp3') },
    { id: 'c07b_surge_click', file: sfxAiSurge },
    { id: 'gap7', file: pad03 },
    { id: 'c08a_flip_intro', file: path.join(BUILD_DIR, 'p08.mp3') },
    { id: 'c08b_flip_click', file: sfxAiFlip },
    { id: 'gap8', file: pad03 },
    { id: 'c09_step2_3_run', file: path.join(BUILD_DIR, 'p09.mp3') },
    { id: 'c10a_apply_intro', file: path.join(BUILD_DIR, 'p10.mp3') },
    { id: 'c10b_apply_click', file: sfxAiApply },
    { id: 'gap_end', file: pad03 },
  ];

  let cursorMs = 0;
  const cues = {};
  for (const item of sequence) {
    const durMs = Math.round(getDurationSec(item.file) * 1000);
    cues[item.id] = { startMs: cursorMs, durMs, endMs: cursorMs + durMs };
    cursorMs += durMs;
  }
  const totalDurationSec = cursorMs / 1000;
  console.log('Exact Audio Cue Timeline (ms):', JSON.stringify(cues, null, 2));
  console.log(`Total synced duration: ${totalDurationSec.toFixed(2)}s`);

  // Concatenate sequence into voice_and_sfx_track.mp3
  const voiceAndSfxTrack = path.join(BUILD_DIR, 'voice_and_sfx_track.mp3');
  concatMp3(
    sequence.map((s) => s.file),
    voiceAndSfxTrack,
  );

  // Mix continuous ElevenLabs factory ambience under the voice+sfx track
  const masterAudio = path.join(BUILD_DIR, 'master_synced_audio.mp3');
  execFileSync(FFMPEG, [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    path.join(SFX_DIR, 'factory_ambience.mp3'),
    '-i',
    voiceAndSfxTrack,
    '-filter_complex',
    `[0:a]atrim=0:${totalDurationSec.toFixed(2)},volume=0.14[amb];[1:a]volume=1.05[fg];[amb][fg]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.96[out]`,
    '-map',
    '[out]',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    masterAudio,
  ]);

  console.log('2) Recording Playwright video locked to exact millisecond cues...');
  // Clean old webm files
  for (const f of fs.readdirSync(BUILD_DIR)) {
    if (f.endsWith('.webm')) fs.unlinkSync(path.join(BUILD_DIR, f));
  }

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: BUILD_DIR,
      size: { width: 1440, height: 900 },
    },
  });
  const recordStartWallMs = Date.now();
  const page = await context.newPage();

  // Warmup load & open Slide 1 BEFORE starting our synced clock t0
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('[data-testid="open-architecture-slide-btn"]');
  await page.waitForTimeout(400);

  // Mark exact t0 where Cue 1 begins!
  const t0 = Date.now();
  const videoTrimOffsetSec = (t0 - recordStartWallMs) / 1000;
  console.log(`Synced timeline t0 started (video trim offset: ${videoTrimOffsetSec.toFixed(2)}s)`);

  const waitUntil = async (targetMs) => {
    const remaining = t0 + targetMs - Date.now();
    if (remaining > 5) {
      await new Promise((r) => setTimeout(r, remaining));
    }
  };

  // CUE 1: Slide 1 (Orders Change. Robots Drop Boxes.) is already visible at t0!
  // Wait until Cue 2 starts -> switch to Slide 2
  await waitUntil(cues.c02_slide2_3.startMs);
  await page.click('[data-testid="slide-tab-2"]');

  // Halfway through Cue 2 -> switch to Slide 3 (Photo -> 3D Test -> Live Robot)
  await waitUntil(cues.c02_slide2_3.startMs + Math.round(cues.c02_slide2_3.durMs * 0.52));
  await page.click('[data-testid="slide-tab-3"]');

  // CUE 3: Switch to Slide 4 (Architecture)
  await waitUntil(cues.c03_slide4.startMs);
  await page.click('[data-testid="slide-tab-4"]');

  // Near end of Cue 3 -> briefly show Slide 5 (Live Demo Checklist)
  await waitUntil(cues.c03_slide4.endMs - 1800);
  await page.click('[data-testid="slide-tab-5"]');

  // CUE 4: Close slides at exact start of c04_step1_raw -> reveals Step 1 Unscanned Real Factory Photo
  await waitUntil(cues.c04_step1_raw.startMs);
  await page.click('[data-testid="close-architecture-slide-btn"]');

  // CUE 5B: Click Gemini Vision Scan at exact millisecond of c05b_scan_click (when SFX + Sarah AI speaks!)
  await waitUntil(cues.c05b_scan_click.startMs);
  await page.click('[data-testid="scan-photo-btn"]');

  // CUE 6: Show the real Field Weeder photo toggle, then switch back to Packing and open Full 3D Sim
  await waitUntil(cues.c06_weeder_and_full3d.startMs + 400);
  await page.click('[data-testid="photo-toggle-weeder"]');
  await waitUntil(cues.c06_weeder_and_full3d.startMs + Math.round(cues.c06_weeder_and_full3d.durMs * 0.52));
  await page.click('[data-testid="photo-toggle-packing"]');
  await page.click('[data-testid="split-sim-only-btn"]');

  // CUE 7B: Click "+ Drop 6 Items on Belt" at exact millisecond of c07b_surge_click (when Surge SFX + Sarah AI speaks!)
  await waitUntil(cues.c07b_surge_click.startMs);
  await page.click('[data-testid="inject-burst-btn"]');

  // CUE 8B: Click "Flip Tray & Clear" at exact millisecond of c08b_flip_click (when Flip SFX + Sarah AI speaks!)
  await waitUntil(cues.c08b_flip_click.startMs);
  await page.click('[data-testid="swap-tray-flow-btn"]');

  // CUE 9: Step 2 (Parameter Diff) -> Step 3 (Run 4 Configs)
  await waitUntil(cues.c09_step2_3_run.startMs);
  await page.click('[data-testid="next-to-step-2"]');
  await waitUntil(cues.c09_step2_3_run.startMs + Math.round(cues.c09_step2_3_run.durMs * 0.45));
  await page.click('[data-testid="next-to-step-3"]');
  await page.waitForTimeout(250);
  await page.click('[data-testid="run-replay-btn"]');

  // CUE 10B: Click "Apply Configuration" at exact millisecond of c10b_apply_click (when Apply Chime + Sarah AI speaks!)
  await waitUntil(cues.c10b_apply_click.startMs);
  const applyBtn = page.locator('[data-testid="apply-config-button"]');
  if (await applyBtn.isVisible()) {
    await applyBtn.click();
  }

  // Hold until the end of the audio timeline
  await waitUntil(cues.gap_end.endMs + 400);

  await context.close();
  await browser.close();

  // Find recorded webm
  const webmFile = fs
    .readdirSync(BUILD_DIR)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => path.join(BUILD_DIR, f))[0];

  console.log('3) Muxing synced video + ElevenLabs multi-layer audio into MP4...');
  const outMp4 = path.join(ROOT, 'SHIFT_Demo_Jeffrey_Chang.mp4');
  execFileSync(FFMPEG, [
    '-y',
    '-ss',
    videoTrimOffsetSec.toFixed(2),
    '-i',
    webmFile,
    '-i',
    masterAudio,
    '-t',
    totalDurationSec.toFixed(2),
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
    outMp4,
  ]);

  const desktopMp4 = 'C:\\Users\\jeffp\\OneDrive\\Desktop\\SHIFT_Demo_Jeffrey_Chang.mp4';
  const artifactMp4 =
    'C:\\Users\\jeffp\\.gemini\\antigravity\\brain\\4aa97b6f-15e1-487d-94f4-58787eb31527\\SHIFT_Demo_Jeffrey_Chang.mp4';
  fs.copyFileSync(outMp4, desktopMp4);
  fs.copyFileSync(outMp4, artifactMp4);
  console.log('DONE! Saved synced MP4 to:', desktopMp4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
