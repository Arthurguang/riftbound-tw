'use client';

import { useEffect, useRef } from 'react';

/**
 * 戰場背景動畫「戰火餘燼」—— 用 <canvas> 即時繪製，不是影片、也不下載任何圖片。
 *
 * 橘紅火星從畫面下方緩慢飄升、左右輕晃、忽明忽暗；幾團很大的暗紅煙霧慢慢橫向漂移，
 * 底部的火光是固定的 CSS 漸層 —— 交戰後還在燃燒的戰場。
 * （使用者試看過餘燼／光痕／混合三種後選定這一種。）
 *
 * ── 效能（2026-09-11 CI 抓到的問題）───────────────────────────────
 * 第一版每一格都重新產生好幾個全畫面大小的漸層。在沒有顯示卡的 CI 主機上，
 * 畫面格被拖慢到 Playwright 等不到按鈕「穩定」，復盤頁的測試逾時 ——
 * 低階手機一樣會卡。現在：
 *   · 火星與煙霧的光暈先畫成小圖（sprite），每格只是把小圖貼上去
 *   · 最多每秒 30 格（背景動畫不需要 60 格）
 *   · 底部火光改成 CSS 漸層，完全不佔每格的繪製時間
 *
 * ── 資安 ────────────────────────────────────────────────────────
 * 畫布上的顏色是 canvas API 的 fillStyle，不是 HTML 的 style 屬性，CSP 不需要任何調整。
 *
 * ── 不干擾使用 ──────────────────────────────────────────────────
 * · 放在所有內容後面，pointer-events: none，完全點不到
 * · 暫停時、或系統設定「減少動態效果」時，只畫一張靜止的畫面
 * · 分頁切到背景時瀏覽器會自動停掉 requestAnimationFrame，不耗電
 */

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  phase: number;
};
type Smoke = { x: number; y: number; r: number; vx: number };

const FRAME_MS = 1000 / 30;

/** 先畫好一張放射狀光暈的小圖，之後每格直接貼上，不必每格重算漸層。 */
function glowSprite(size: number, stops: ReadonlyArray<[number, string]>): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext('2d');
  if (g) {
    const half = size / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return sprite;
}

export function BattlefieldBackdrop({
  intensity,
  paused,
}: {
  /** 0–1。首頁 1，工具頁較淡。 */
  intensity: number;
  paused: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const strength = 0.45 + 0.55 * intensity;

    // 火星：亮橘的核心，外面一圈淡淡的光
    const emberSprite = glowSprite(32, [
      [0, 'rgba(255, 205, 140, 1)'],
      [0.18, 'rgba(255, 150, 70, 0.9)'],
      [0.35, 'rgba(255, 150, 70, 0.22)'],
      [1, 'rgba(255, 150, 70, 0)'],
    ]);
    // 煙霧：暗紅、邊緣完全透明
    const smokeSprite = glowSprite(128, [
      [0, 'rgba(150, 70, 45, 1)'],
      [1, 'rgba(150, 70, 45, 0)'],
    ]);

    let width = 0;
    let height = 0;
    let embers: Ember[] = [];
    let smoke: Smoke[] = [];
    let raf = 0;
    let lastFrame = 0;

    const spawn = (anywhere: boolean): Ember => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -(0.6 + Math.random() * 1.4),
      life: anywhere ? Math.random() * 150 : 0,
      max: 210 + Math.random() * 240,
      size: 0.7 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    });

    const populate = () => {
      const scale = Math.max(0.4, Math.min(1.5, (width * height) / (1440 * 900)));
      embers = Array.from({ length: Math.round(80 * intensity * scale) }, () => spawn(true));
      smoke = Array.from({ length: Math.max(2, Math.round(5 * intensity)) }, () => ({
        x: Math.random() * width,
        y: height * (0.65 + Math.random() * 0.4),
        r: 200 + Math.random() * 240,
        vx: (Math.random() - 0.5) * 0.2,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      populate();
    };

    // 每一格的時間是 30 fps，所以速度參數是 60 fps 版本的兩倍
    const draw = (animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = 0.09 * intensity;
      for (const s of smoke) {
        if (animate) {
          s.x += s.vx;
          if (s.x < -s.r) s.x = width + s.r;
          else if (s.x > width + s.r) s.x = -s.r;
        }
        ctx.drawImage(smokeSprite, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      }

      ctx.globalCompositeOperation = 'lighter';
      embers.forEach((p, index) => {
        if (animate) {
          p.life += 1;
          p.x += p.vx + Math.sin(p.life / 22 + p.phase) * 0.36;
          p.y += p.vy;
        }
        const t = p.life / p.max;
        const fade = t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
        const flicker = 0.65 + 0.35 * Math.sin(p.life / 3 + p.phase);
        ctx.globalAlpha = Math.min(1, fade * flicker * 0.85 * strength);
        const d = p.size * 8;
        ctx.drawImage(emberSprite, p.x - d / 2, p.y - d / 2, d, d);

        const gone = p.life >= p.max || p.y < -20 || p.x < -20 || p.x > width + 20;
        if (animate && gone) embers[index] = spawn(false);
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (time - lastFrame < FRAME_MS) return;
      lastFrame = time;
      draw(true);
    };

    const still = () => paused || reduceMotion.matches;
    const start = () => {
      cancelAnimationFrame(raf);
      if (still()) {
        draw(false);
        canvas.setAttribute('data-motion', 'still');
      } else {
        canvas.setAttribute('data-motion', 'running');
        raf = requestAnimationFrame(loop);
      }
    };

    const onResize = () => {
      resize();
      if (still()) draw(false);
    };

    resize();
    start();
    window.addEventListener('resize', onResize);
    reduceMotion.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      reduceMotion.removeEventListener('change', start);
    };
  }, [intensity, paused]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`battle-backdrop ${intensity < 1 ? 'battle-backdrop--dim' : ''}`}
      data-intensity={intensity}
    />
  );
}
