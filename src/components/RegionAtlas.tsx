'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DomainDot } from './CardBadges';
import { DOMAIN_SHORT, type PlayDomain } from '@/lib/runeterra-core';
import type { TextLang } from '@/lib/i18n';

/** 伺服器端算好的區域資料。 */
export type RegionView = {
  tag: string;
  name: string;
  /** 中文介面下的英文原名；英文介面為 null。 */
  subName: string | null;
  color: string;
  count: number;
  domains: { domain: PlayDomain; count: number }[];
  champions: string[];
  lore: string;
  href: string;
};

type Strings = {
  eyebrow: string;
  title: (n: number) => string;
  note: string;
  cards: (n: number) => string;
  seeCards: string;
  noChampion: string;
};

const STRINGS: Record<TextLang, Strings> = {
  'zh-TW': {
    eyebrow: 'RUNETERRA',
    title: (n) => `符文大地的 ${n} 個區域`,
    note: '卡數與領域分佈是起源系列卡池的統計；英雄是卡上真的標了這個區域的英雄卡。區域簡介為本站依英雄聯盟世界觀整理。',
    cards: (n) => `${n} 張`,
    seeCards: '看這個區域的卡 →',
    noChampion: '卡池中沒有標記這個區域的英雄卡',
  },
  'zh-CN': {
    eyebrow: 'RUNETERRA',
    title: (n) => `符文之地的 ${n} 个区域`,
    note: '卡数与领域分布是起源系列卡池的统计；英雄是卡上真的标了这个区域的英雄卡。区域简介为本站依英雄联盟世界观整理。',
    cards: (n) => `${n} 张`,
    seeCards: '看这个区域的卡 →',
    noChampion: '卡池中没有标记这个区域的英雄卡',
  },
  en: {
    eyebrow: 'RUNETERRA',
    title: (n) => `${n} regions of Runeterra`,
    note: 'Card counts and domain spread are computed from the Origins pool; champions are those whose cards carry the region tag. Region blurbs are written by this site.',
    cards: (n) => `${n} cards`,
    seeCards: 'Cards from this region →',
    noChampion: 'No champion card carries this region tag',
  },
};

function Swatch({ color }: { color: string }) {
  // SVG 的 fill 是呈現屬性，不受 CSP 的 style 限制
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <rect width="12" height="12" rx="2" fill={color} />
    </svg>
  );
}

/**
 * 區域地圖：點一個區域，上方換成它的簡介，並可以連到該區域的卡。
 */
export function RegionAtlas({ lang, regions }: { lang: TextLang; regions: RegionView[] }) {
  const [selected, setSelected] = useState(regions[0]?.tag ?? '');
  const s = STRINGS[lang];
  const current = regions.find((r) => r.tag === selected) ?? regions[0];
  if (!current) return null;

  return (
    <section className="flex flex-col gap-5 py-14" data-testid="region-atlas">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold tracking-[0.28em] text-arcane">{s.eyebrow}</p>
          <h2 className="font-serif text-3xl font-bold text-ink">{s.title(regions.length)}</h2>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-ink-faint sm:ml-auto sm:text-right">{s.note}</p>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-1 px-5 py-4"
        data-testid="region-lore"
      >
        <Swatch color={current.color} />
        <span className="font-serif text-xl font-bold text-ink">{current.name}</span>
        <span className="min-w-0 flex-1 text-sm leading-relaxed text-ink-dim">{current.lore}</span>
        <Link href={current.href} className="shrink-0 text-sm text-accent-soft hover:underline">
          {s.seeCards}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {regions.map((region) => {
          const on = region.tag === current.tag;
          return (
            <button
              key={region.tag}
              type="button"
              aria-pressed={on}
              data-region={region.tag}
              onClick={() => setSelected(region.tag)}
              className={`flex min-h-[132px] flex-col gap-2 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                on ? 'border-accent bg-surface-2' : 'border-line bg-surface-1 hover:border-surface-3'
              }`}
            >
              <span className="flex w-full items-center gap-2.5">
                <Swatch color={region.color} />
                <span className="font-serif text-base font-bold text-ink">{region.name}</span>
                <span className="ml-auto font-mono text-xs text-ink-faint">{s.cards(region.count)}</span>
              </span>
              {region.subName && (
                <span className="text-[0.65rem] tracking-[0.08em] text-ink-faint uppercase">
                  {region.subName}
                </span>
              )}
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-accent">
                {region.domains.slice(0, 2).map(({ domain, count }) => (
                  <span key={domain} className="inline-flex items-center gap-1">
                    <DomainDot domain={domain} />
                    {DOMAIN_SHORT[domain][lang]} {count}
                  </span>
                ))}
              </span>
              <span className="text-xs leading-relaxed text-ink-dim">
                {region.champions.length > 0 ? region.champions.slice(0, 4).join('、') : s.noChampion}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
