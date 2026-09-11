'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DomainDot } from './CardBadges';
import { RuneWheel } from './RuneWheel';
import {
  DOMAIN_ESSENCE,
  DOMAIN_SHORT,
  OPPOSITE,
  RING,
  type PlayDomain,
} from '@/lib/runeterra-core';
import type { TextLang } from '@/lib/i18n';

/** 伺服器端算好、傳進來的傳奇資料（只帶畫面需要的欄位，不帶整張卡）。 */
export type LegendView = {
  id: string;
  name: string;
  region: string | null;
  a: PlayDomain;
  b: PlayDomain;
  href: string;
};

type Strings = {
  title: string;
  intro: string;
  hint: string;
  opposite: string;
  showAll: string;
  seeCards: (domain: string) => string;
  note: string;
  center: string;
  wheel: string;
};

const STRINGS: Record<TextLang, Strings> = {
  'zh-TW': {
    title: '六大領域 · 十二傳奇',
    intro:
      '每張卡都屬於六個領域之一，兩兩相對：熾烈與翠意、靈光與摧破、混沌與序理。每位傳奇掌握兩個不相對的領域——這樣的組合正好十二種，起源系列也正好有十二位傳奇，一人一組、不重複。',
    hint: '點陣圖上任一個領域看看。',
    opposite: '對立領域',
    showAll: '看全部',
    seeCards: (d) => `看${d}的卡 →`,
    note: '領域風格是本站整理的描述，不是官方文案。',
    center: '符文陣',
    wheel: '六大領域與十二傳奇的符文陣',
  },
  'zh-CN': {
    title: '六大领域 · 十二传奇',
    intro:
      '每张卡都属于六个领域之一，两两相对：炽烈与翠意、灵光与摧破、混沌与序理。每位传奇掌握两个不相对的领域——这样的组合正好十二种，起源系列也正好有十二位传奇，一人一组、不重复。',
    hint: '点阵图上任一个领域看看。',
    opposite: '对立领域',
    showAll: '看全部',
    seeCards: (d) => `看${d}的卡 →`,
    note: '领域风格是本站整理的描述，不是官方文案。',
    center: '符文阵',
    wheel: '六大领域与十二传奇的符文阵',
  },
  en: {
    title: 'Six Domains · Twelve Legends',
    intro:
      'Every card belongs to one of six domains, set in opposing pairs: Fury and Calm, Mind and Body, Chaos and Order. Each Legend holds two domains that are not opposites — exactly twelve such pairs exist, and Origins has exactly twelve Legends, one per pair.',
    hint: 'Pick any domain on the wheel.',
    opposite: 'Opposite',
    showAll: 'Show all',
    seeCards: (d) => `${d} cards →`,
    note: 'Domain descriptions are written by this site, not official copy.',
    center: 'RUNE',
    wheel: 'Rune wheel of six domains and twelve Legends',
  },
};

/**
 * 首頁的主視覺：左邊是介紹（伺服器端渲染後傳進來），右邊是可以點的符文陣。
 *
 * 選中的領域下方會列出它的四位傳奇；滑過傳奇會亮出陣圖上對應的那一條線，
 * 點下去則是真的連到那張傳奇卡的頁面。
 */
export function HomeWheelHero({
  lang,
  legends,
  domainHref,
  children,
}: {
  lang: TextLang;
  legends: LegendView[];
  domainHref: Record<PlayDomain, string>;
  children: ReactNode;
}) {
  const [focus, setFocus] = useState<PlayDomain | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const s = STRINGS[lang];

  const labels = Object.fromEntries(RING.map((d) => [d, DOMAIN_SHORT[d][lang]])) as Record<
    PlayDomain,
    string
  >;
  const shown = focus ? legends.filter((l) => l.a === focus || l.b === focus) : [];
  const hovered = legends.find((l) => l.id === hover) ?? null;

  return (
    <section className="grid items-center gap-10 border-b border-surface-2 py-12 lg:grid-cols-[minmax(0,1fr)_470px] lg:gap-14 lg:py-16">
      <div className="flex flex-col gap-5">
        {children}

        <div
          className="mt-2 min-h-[228px] rounded-xl border border-line bg-surface-1 px-5 py-5"
          data-testid="domain-panel"
        >
          {focus === null ? (
            <div className="flex flex-col gap-2.5">
              <p className="font-serif text-xl font-bold text-ink">{s.title}</p>
              <p className="text-sm leading-relaxed text-ink-dim">{s.intro}</p>
              <p className="text-sm text-accent">{s.hint}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <span className={`font-serif text-2xl font-bold text-domain--${focus}`}>
                  {DOMAIN_SHORT[focus][lang]}
                </span>
                <span className="text-xs text-ink-faint">
                  {s.opposite}：{DOMAIN_SHORT[OPPOSITE[focus]][lang]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFocus(null);
                    setHover(null);
                  }}
                  className="ml-auto rounded-md border border-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
                >
                  {s.showAll}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-ink-dim">{DOMAIN_ESSENCE[focus][lang]}</p>
              <ul className="grid gap-2 sm:grid-cols-2" data-testid="domain-legends">
                {shown.map((legend) => {
                  const other = legend.a === focus ? legend.b : legend.a;
                  return (
                    <li key={legend.id}>
                      <Link
                        href={legend.href}
                        data-legend-link={legend.id}
                        onMouseEnter={() => setHover(legend.id)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(legend.id)}
                        onBlur={() => setHover(null)}
                        className="flex min-h-11 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-accent"
                      >
                        <DomainDot domain={other} />
                        <span className="truncate font-semibold">{legend.name}</span>
                        {legend.region && (
                          <span className="ml-auto shrink-0 text-xs text-ink-faint">{legend.region}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-3 text-xs">
                <Link href={domainHref[focus]} className="text-accent-soft hover:underline">
                  {s.seeCards(DOMAIN_SHORT[focus][lang])}
                </Link>
                <span className="ml-auto text-ink-faint">{s.note}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <RuneWheel
          size={460}
          labels={labels}
          focus={focus}
          highlight={hovered ? [hovered.a, hovered.b] : null}
          onPickDomain={(domain) => {
            setFocus(domain);
            setHover(null);
          }}
          centerLabel={s.center}
          ariaLabel={s.wheel}
          className="h-auto w-full max-w-[460px]"
        />
      </div>
    </section>
  );
}
