// Plays ElevenLabs generated sound effects & AI Copilot telemetry callouts in the browser

let currentVoiceAudio: HTMLAudioElement | null = null;

export function playElevenLabsEvent(event: 'scan' | 'surge' | 'flip' | 'apply') {
  if (typeof window === 'undefined') return;

  const sfxMap: Record<typeof event, { sfx: string; voice: string; delayMs: number }> = {
    scan: {
      sfx: '/sfx/vision_scan.mp3',
      voice: '/sfx/ai_vision_locked.mp3',
      delayMs: 550,
    },
    surge: {
      sfx: '/sfx/surge_sprint.mp3',
      voice: '/sfx/ai_surge_engaged.mp3',
      delayMs: 450,
    },
    flip: {
      sfx: '/sfx/tray_flip.mp3',
      voice: '/sfx/ai_tray_flipped.mp3',
      delayMs: 450,
    },
    apply: {
      sfx: '/sfx/apply_success.mp3',
      voice: '/sfx/ai_recipe_applied.mp3',
      delayMs: 450,
    },
  };

  const cfg = sfxMap[event];
  try {
    const sfxAudio = new Audio(cfg.sfx);
    sfxAudio.volume = 0.65;
    void sfxAudio.play().catch(() => {});

    window.setTimeout(() => {
      try {
        if (currentVoiceAudio) {
          currentVoiceAudio.pause();
          currentVoiceAudio.currentTime = 0;
        }
        const voiceAudio = new Audio(cfg.voice);
        voiceAudio.volume = 0.9;
        currentVoiceAudio = voiceAudio;
        void voiceAudio.play().catch(() => {});
      } catch {
        // Ignore autoplay restrictions
      }
    }, cfg.delayMs);
  } catch {
    // Ignore autoplay restrictions
  }
}
