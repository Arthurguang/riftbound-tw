'use client';

import { useEffect, useRef } from 'react';
import type { BackdropVariant } from '@/lib/ambience';

/**
 * 戰場背景動畫 —— 用 <canvas> 即時繪製，不是影片、也不下載任何圖片。
 *
 * 三種風格（試看中，使用者選定後會只留一種）：
 *   embers 戰火餘燼：橘紅火星從下往上緩慢飄升，底部有火光與煙霧
 *   runes  符文光痕：青色光點緩慢漂浮，偶爾劃出一道光痕
 *   mixed  兩者混合：下方火星、上方符文光點
 *
 * ── 資安 ────────────────────────────────────────────────────────
 * 畫布上的顏色是 canvas API 的 fillStyle，不是 HTML 的 style 屬性，
 * 本站的 CSP 不需要任何調整。
 *
 * ── 不干擾使用 ──────────────────────────────────────────────────
 * · 放在所有內容後面，pointer-events: none，完全點不到
 * · 暫停時、或系統設定「減少動態效果」時，只畫一張靜止的畫面
 * · 分頁切到背景時瀏覽器會自動停掉 requestAnimationFrame，不耗電
 */

type Kind = 'ember' | 'rune';
type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  phase: number;
};
type Streak = { x: number; y: number; vx: number; vy: number; life: number; max: number };
type Smoke = { x: number; y: number; r: number; vx: number };

const EMBER_RGB = '255, 150, 70';
const RUNE_RGB = '163, 227, 244';

function kindsOf(variant: BackdropVariant): Kind[] {
  if (variant === 'embers') return ['ember'];
  if (variant === 'runes') return ['rune'];
  return ['ember', 'rune'];
}

export function BattlefieldBackdrop({
  variant,
  intensity,
  paused,
}: {
  variant: BackdropVariant;
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
    const kinds = kindsOf(variant);
    const runeBand = variant === 'mixed' ? 0.6 : 1;
    const strength = 0.45 + 0.55 * intensity;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let smoke: Smoke[] = [];
    let streak: Streak | null = null;
    let raf = 0;

    const spawn = (kind: Kind, anywhere: boolean): Particle =>
      kind === 'ember'
        ? {
            kind,
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : height + 10,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -(0.3 + Math.random() * 0.7),
            life: anywhere ? Math.random() * 300 : 0,
            max: 420 + Math.random() * 480,
            size: 0.7 + Math.random() * 1.6,
            phase: Math.random() * Math.PI * 2,
          }
        : {
            kind,
            x: Math.random() * width,
            y: Math.random() * height * runeBand,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.1,
            life: anywhere ? Math.random() * 400 : 0,
            max: 600 + Math.random() * 700,
            size: 0.9 + Math.random() * 1.4,
            phase: Math.random() * Math.PI * 2,
          };

    const populate = () => {
      const scale = Math.max(0.4, Math.min(1.5, (width * height) / (1440 * 900)));
      particles = kinds.flatMap((kind) =>
        Array.from({ length: Math.round((kind === 'ember' ? 80 : 40) * intensity * scale) }, () =>
          spawn(kind, true),
        ),
      );
      smoke = kinds.includes('ember')
        ? Array.from({ length: 5 }, () => ({
            x: Math.random() * width,
            y: height * (0.65 + Math.random() * 0.4),
            r: 200 + Math.random() * 240,
            vx: (Math.random() - 0.5) * 0.1,
          }))
        : [];
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

    const draw = (animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      if (kinds.includes('ember')) {
        // 底部的火光
        const glow = ctx.createLinearGradient(0, height, 0, height * 0.6);
        glow.addColorStop(0, `rgba(220, 90, 40, ${0.12 * intensity})`);
        glow.addColorStop(1, 'rgba(220, 90, 40, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, height * 0.6, width, height * 0.4);

        // 煙霧：幾團很大的暗紅光暈，慢慢橫向漂移
        for (const s of smoke) {
          if (animate) {
            s.x += s.vx;
            if (s.x < -s.r) s.x = width + s.r;
            else if (s.x > width + s.r) s.x = -s.r;
          }
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
          g.addColorStop(0, `rgba(150, 70, 45, ${0.09 * intensity})`);
          g.addColorStop(1, 'rgba(150, 70, 45, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p, index) => {
        if (animate) {
          p.life += 1;
          p.x += p.vx + (p.kind === 'ember' ? Math.sin(p.life / 45 + p.phase) * 0.18 : 0);
          p.y += p.vy;
        }
        const t = p.life / p.max;
        const fade = t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
        const flicker = 0.65 + 0.35 * Math.sin(p.life / (p.kind === 'ember' ? 6 : 20) + p.phase);
        const alpha = fade * flicker * (p.kind === 'ember' ? 0.85 : 0.7) * strength;
        const rgb = p.kind === 'ember' ? EMBER_RGB : RUNE_RGB;

        ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.18})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        const gone = p.life >= p.max || p.y < -20 || p.x < -20 || p.x > width + 20;
        if (animate && gone) particles[index] = spawn(p.kind, false);
      });

      // 符文光痕：偶爾有一道光從畫面一側劃過
      if (kinds.includes('rune')) {
        if (animate && !streak && Math.random() < 0.003 + 0.004 * intensity) {
          const fromLeft = Math.random() < 0.5;
          const speed = 6 + Math.random() * 4;
          const angle = Math.random() * 0.4 - 0.2;
          streak = {
            x: fromLeft ? -40 : width + 40,
            y: height * runeBand * (0.1 + Math.random() * 0.7),
            vx: (fromLeft ? 1 : -1) * speed * Math.cos(angle),
            vy: speed * Math.sin(angle),
            life: 0,
            max: 140,
          };
        }
        if (streak) {
          const tail = 18;
          const tx = streak.x - streak.vx * tail;
          const ty = streak.y - streak.vy * tail;
          const a = Math.sin(Math.PI * Math.min(1, streak.life / streak.max)) * 0.55 * strength;
          const g = ctx.createLinearGradient(streak.x, streak.y, tx, ty);
          g.addColorStop(0, `rgba(${RUNE_RGB}, ${a})`);
          g.addColorStop(1, `rgba(${RUNE_RGB}, 0)`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(streak.x, streak.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          if (animate) {
            streak.x += streak.vx;
            streak.y += streak.vy;
            streak.life += 1;
            if (streak.life > streak.max) streak = null;
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = () => {
      draw(true);
      raf = requestAnimationFrame(loop);
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
  }, [variant, intensity, paused]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="battle-backdrop"
      data-backdrop={variant}
      data-intensity={intensity}
    />
  );
}
