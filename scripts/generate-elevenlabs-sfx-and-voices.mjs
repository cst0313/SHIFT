import fs from 'node:fs';
import path from 'node:path';

// Load .env
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
      if (val) process.env[key] = val;
    }
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}

const SFX_DIR = path.resolve(process.cwd(), 'public', 'sfx');
fs.mkdirSync(SFX_DIR, { recursive: true });

const SOUND_EFFECTS = [
  {
    file: 'factory_ambience.mp3',
    text: 'Subtle modern robotic packaging factory conveyor belt hum and clean high-tech servo motor whirring ambient loop',
    duration_seconds: 10.0,
    prompt_influence: 0.4,
  },
  {
    file: 'vision_scan.mp3',
    text: 'Futuristic high-tech computer vision laser scan sweep and target lock confirmation chime',
    duration_seconds: 2.0,
    prompt_influence: 0.5,
  },
  {
    file: 'surge_sprint.mp3',
    text: 'High power industrial robotic arm turbo servo acceleration whoosh and fast pneumatic pick burst',
    duration_seconds: 2.5,
    prompt_influence: 0.5,
  },
  {
    file: 'tray_flip.mp3',
    text: 'Crisp mechanical conveyor belt directional switch latch and pneumatic air clear whoosh',
    duration_seconds: 2.0,
    prompt_influence: 0.5,
  },
  {
    file: 'apply_success.mp3',
    text: 'Clean futuristic industrial control panel confirmation chime and positive telemetry lock',
    duration_seconds: 2.0,
    prompt_influence: 0.5,
  },
];

const AI_COPILOT_CALLOUTS = [
  {
    file: 'ai_vision_locked.mp3',
    text: 'Vision calibrated. Delta 6G picker and 4-slot trays mapped to 3D twin.',
  },
  {
    file: 'ai_surge_engaged.mp3',
    text: 'Surge detected. Engaging 10G sprint and braking belt to 0.15 meters per second.',
  },
  {
    file: 'ai_tray_flipped.mp3',
    text: 'Tray belt reversed. Backlog cleared and velocities synchronized.',
  },
  {
    file: 'ai_recipe_applied.mp3',
    text: 'Candidate 1 applied: Earliest Deadline First. 100 percent completion verified.',
  },
];

async function generateSoundEffect(item) {
  const outPath = path.join(SFX_DIR, item.file);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    console.log(`SFX cached: ${item.file}`);
    return;
  }
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: item.text,
      duration_seconds: item.duration_seconds,
      prompt_influence: item.prompt_influence,
    }),
  });
  if (!res.ok) {
    throw new Error(`SFX ${item.file} failed (${res.status}): ${await res.text()}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`Generated ElevenLabs SFX: ${item.file}`);
}

async function generateAiCallout(item) {
  const outPath = path.join(SFX_DIR, item.file);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    console.log(`AI Callout cached: ${item.file}`);
    return;
  }
  // Use Sarah (EXAVITQu4vr4xnSDxMaL) — crisp AI system copilot voice contrasting with George presenter voice
  const voiceId = 'EXAVITQu4vr4xnSDxMaL';
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: item.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.82,
          style: 0.08,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`AI Callout ${item.file} failed (${res.status}): ${await res.text()}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`Generated ElevenLabs AI Copilot Voice: ${item.file}`);
}

async function main() {
  for (const sfx of SOUND_EFFECTS) {
    await generateSoundEffect(sfx);
  }
  for (const callout of AI_COPILOT_CALLOUTS) {
    await generateAiCallout(callout);
  }
  console.log('All ElevenLabs SFX and AI Copilot voice callouts ready in public/sfx!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
