/**
 * 戰場氛圍音樂 —— 用瀏覽器內建的 Web Audio 即時合成，不下載任何音樂檔。
 *
 * ── 為什麼用合成的 ──────────────────────────────────────────────
 * · 沒有著作權問題：Riot 的「創作者可用」音樂只涵蓋直播與影片平台，沒有涵蓋網站
 * · 不需要放寬 CSP：本站 media-src 是 'none'，合成的聲音不經過網路
 * · 不增加網站大小，也不會對任何人發出額外請求
 *
 * ── 只在使用者按下按鈕後才開始 ──────────────────────────────────
 * 瀏覽器規定：使用者點過網頁之前，網站不能發出聲音；WCAG 1.4.2 也要求能停止。
 * 所以這支程式只從按鈕的點擊事件呼叫，而且隨時可以 stop()。
 *
 * ── 曲子本身 ────────────────────────────────────────────────────
 * 72 BPM 的戰鼓節奏，底下一層緩慢起伏的低音，每兩小節換一個小調和弦的號角聲。
 */

export type BattleMusic = { stop: () => void };

/** 以 A1（55 Hz）為基準的半音。 */
const note = (semitones: number) => 55 * 2 ** (semitones / 12);

const BPM = 72;
/** 一步 = 八分音符 */
const STEP = 60 / BPM / 2;
/** 一小節 16 步的戰鼓力道（0 = 不打） */
const DRUMS = [1, 0, 0, 0.5, 1, 0, 0.6, 0, 1, 0, 0, 0.5, 1, 0.4, 0.7, 0.5];
/** A 小調的四個和弦（以 A 為 0 的半音） */
const CHORDS = [
  [0, 3, 7],
  [-2, 2, 5],
  [-4, 0, 3],
  [-5, -1, 2],
];

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof candidate === 'function' ? candidate : undefined;
}

/**
 * 這個瀏覽器能不能即時合成聲音。
 * 幾乎所有瀏覽器都可以；不行的時候，頁首的音樂按鈕會停用並說明原因，而不是按了沒反應。
 */
export function isWebAudioSupported(): boolean {
  return audioContextClass() !== undefined;
}

export function startBattleMusic(): BattleMusic | null {
  const Ctx = audioContextClass();
  if (!Ctx) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    // 有這個介面卻建立失敗（例如音訊裝置被系統封鎖）—— 當作不支援
    return null;
  }
  void ctx.resume();

  // 總音量：兩秒淡入，避免一按下去就很大聲
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor).connect(ctx.destination);

  // ── 低音層：三個略微走音的鋸齒波，經過低通濾波，濾波頻率緩慢起伏 ──
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 320;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.12;
  droneFilter.connect(droneGain).connect(master);

  const drones = [note(0), note(0) * 1.003, note(7)].map((frequency) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    osc.connect(droneFilter);
    osc.start();
    return osc;
  });

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 140;
  lfo.connect(lfoDepth).connect(droneFilter.frequency);
  lfo.start();

  // ── 戰鼓：音高快速下滑的正弦波（鼓身）＋一小段濾過的雜訊（鼓皮）──
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;

  const drum = (time: number, strength: number) => {
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(110, time);
    body.frequency.exponentialRampToValueAtTime(42, time + 0.35);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.9 * strength, time + 0.01);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
    body.connect(bodyGain).connect(master);
    body.start(time);
    body.stop(time + 0.65);

    const skin = ctx.createBufferSource();
    skin.buffer = noise;
    const skinFilter = ctx.createBiquadFilter();
    skinFilter.type = 'lowpass';
    skinFilter.frequency.value = 900;
    const skinGain = ctx.createGain();
    skinGain.gain.setValueAtTime(0.25 * strength, time);
    skinGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    skin.connect(skinFilter).connect(skinGain).connect(master);
    skin.start(time);
    skin.stop(time + 0.2);
  };

  // ── 號角：和弦的三個音，濾波慢慢打開再合上 ──
  const horn = (time: number, chord: readonly number[], duration: number) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.linearRampToValueAtTime(1400, time + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(500, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.07, time + duration * 0.35);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration);
    filter.connect(gain).connect(master);

    for (const semitone of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = note(semitone + 12);
      osc.detune.value = (Math.random() - 0.5) * 8;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    }
  };

  // ── 排程：每 0.1 秒看一次，把接下來 0.3 秒內要響的音先排好 ──
  let nextTime = ctx.currentTime + 0.1;
  let step = 0;
  let bar = 0;
  const timer = window.setInterval(() => {
    while (nextTime < ctx.currentTime + 0.3) {
      const position = step % 16;
      const strength = DRUMS[position] ?? 0;
      if (strength > 0) drum(nextTime, strength);
      if (position === 0 && bar % 2 === 0) {
        const chord = CHORDS[(bar / 2) % CHORDS.length] ?? CHORDS[0]!;
        horn(nextTime, chord, STEP * 32 - 0.1);
      }
      nextTime += STEP;
      step += 1;
      if (position === 15) bar += 1;
    }
  }, 100);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.6);
      window.setTimeout(() => {
        for (const osc of drones) osc.stop();
        lfo.stop();
        void ctx.close();
      }, 700);
    },
  };
}
