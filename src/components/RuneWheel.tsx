'use client';

import type { KeyboardEvent } from 'react';
import {
  DOMAIN_COLOR,
  nonOppositePairs,
  OPPOSITE,
  pairKey,
  RING,
  type PlayDomain,
} from '@/lib/runeterra-core';

const GOLD = '#c9a227';
const GOLD_BRIGHT = '#f0d98a';
const INK_DARK = '#0b0e14';
const NODE_IDLE = '#131822';

/**
 * 符文陣：六個領域排成一圈，十二組不對立的配對連成線。
 *
 * ── 為什麼顏色都寫在 SVG 屬性上 ─────────────────────────────────
 * 本站的 CSP 不允許 style 屬性（見 globals.css 開頭）。SVG 的 fill、stroke
 * 這類是「呈現屬性」，不是 style 屬性，CSP 不會擋 —— 所以動態的顏色與透明度
 * 直接寫在屬性上，不需要放寬任何東西。
 *
 * ── 兩種用法 ────────────────────────────────────────────────────
 * 首頁：可以點領域（onPickDomain），點了會亮出它的四條連線。
 * 牌組編輯器：只顯示，亮起傳奇的兩個領域與那一條連線。
 */
export function RuneWheel({
  size,
  labels,
  lit,
  focus = null,
  highlight = null,
  onPickDomain,
  centerLabel,
  ariaLabel,
  className,
}: {
  size: number;
  labels: Record<PlayDomain, string>;
  /** 要塗滿顏色的領域。 */
  lit?: ReadonlySet<PlayDomain>;
  /** 使用者選中的領域：放大、並亮出它的連線。 */
  focus?: PlayDomain | null;
  /** 要特別標出的那一條連線（一位傳奇的兩個領域）。 */
  highlight?: readonly [PlayDomain, PlayDomain] | null;
  onPickDomain?: (domain: PlayDomain) => void;
  centerLabel?: string;
  ariaLabel: string;
  className?: string;
}) {
  const center = size / 2;
  const radius = size * 0.385;
  const nodeR = Math.max(14, size * 0.05);
  const fontSize = Math.max(9, nodeR * 0.56);
  const interactive = Boolean(onPickDomain);
  const litSet = lit ?? new Set<PlayDomain>();
  const highlightKey = highlight ? pairKey(highlight[0], highlight[1]) : null;

  const point = (domain: PlayDomain) => {
    const angle = ((RING.indexOf(domain) * 60 - 90) * Math.PI) / 180;
    return {
      x: Math.round((center + radius * Math.cos(angle)) * 100) / 100,
      y: Math.round((center + radius * Math.sin(angle)) * 100) / 100,
    };
  };

  const chordStyle = (a: PlayDomain, b: PlayDomain) => {
    const touches = focus !== null && (a === focus || b === focus);
    if (highlightKey) {
      if (pairKey(a, b) === highlightKey) return { stroke: GOLD_BRIGHT, opacity: 1, width: 3.5, active: true };
      if (touches && focus) return { stroke: DOMAIN_COLOR[focus], opacity: 0.3, width: 2, active: false };
      return { stroke: GOLD, opacity: 0.08, width: 1.2, active: false };
    }
    if (focus) {
      if (touches) return { stroke: DOMAIN_COLOR[focus], opacity: 0.95, width: 2.5, active: true };
      return { stroke: GOLD, opacity: 0.07, width: 1.2, active: false };
    }
    return { stroke: GOLD, opacity: 0.42, width: 1.5, active: false };
  };

  const onKey = (domain: PlayDomain) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPickDomain?.(domain);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
      data-rune-wheel=""
      className={className}
      fill="none"
    >
      <circle cx={center} cy={center} r={radius + nodeR + size * 0.05} stroke="#1f2636" />
      <circle cx={center} cy={center} r={radius} stroke={GOLD} strokeOpacity={0.26} />

      {/* 對立的三組：虛線穿過圓心，沒有任何傳奇 */}
      {RING.slice(0, 3).map((domain) => {
        const p = point(domain);
        const q = point(OPPOSITE[domain]);
        return (
          <line
            key={`opposite-${domain}`}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke="#6b7684"
            strokeOpacity={0.3}
            strokeDasharray="3 7"
          />
        );
      })}

      {nonOppositePairs().map(([a, b]) => {
        const p = point(a);
        const q = point(b);
        const s = chordStyle(a, b);
        return (
          <line
            key={pairKey(a, b)}
            data-pair={pairKey(a, b)}
            data-active={s.active ? 'true' : undefined}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={s.stroke}
            strokeOpacity={s.opacity}
            strokeWidth={s.width}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        );
      })}

      <circle cx={center} cy={center} r={nodeR * 1.5} fill={INK_DARK} stroke={GOLD} strokeOpacity={0.45} />
      {centerLabel && (
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={700}
          fill="#e0c463"
          className="pointer-events-none select-none font-serif"
        >
          {centerLabel}
        </text>
      )}

      {RING.map((domain) => {
        const p = point(domain);
        const on = litSet.has(domain) || focus === domain;
        const color = DOMAIN_COLOR[domain];
        const nodeProps = interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-pressed': focus === domain,
              'aria-label': labels[domain],
              onClick: () => onPickDomain?.(domain),
              onKeyDown: onKey(domain),
              className: 'cursor-pointer outline-none [&:focus-visible>circle]:stroke-white',
            }
          : {};
        return (
          <g key={domain} data-domain={domain} data-lit={on ? 'true' : undefined} {...nodeProps}>
            <circle
              cx={p.x}
              cy={p.y}
              r={focus === domain ? nodeR * 1.22 : nodeR}
              fill={on ? color : NODE_IDLE}
              stroke={color}
              strokeWidth={1.5}
              className="transition-all duration-300"
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={700}
              fill={on ? INK_DARK : color}
              className="pointer-events-none select-none"
            >
              {labels[domain]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
