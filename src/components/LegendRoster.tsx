'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DomainDot } from './CardBadges';
import { DomainBadges } from './DomainBadges';
import {
  DOMAIN_ESSENCE,
  DOMAIN_SHORT,
  matchesDomains,
  toggleDomain,
  type PlayDomain,
} from '@/lib/runeterra-core';
import type { TextLang } from '@/lib/i18n';

/** 伺服器端算好、傳進來的傳奇資料（只帶畫面需要的欄位，不帶整張卡）。 */
export type LegendView = {
  id: string;
  /** 英雄名（例如「凱莎」） */
  name: string;
  /** 完整卡名（例如「凱莎-虛空之女」），當作卡圖的替代文字 */
  title: string;
  setLabel: string;
  region: string | null;
  domains: [PlayDomain, PlayDomain];
  image: string;
  href: string;
};

type Strings = {
  eyebrow: string;
  /** 標題不放數量：新系列加入傳奇時不必改標題（數量顯示在徽章旁的「全部 N 位」） */
  title: string;
  intro: string;
  filterLabel: string;
  showing: (n: number, total: number) => string;
  clear: string;
  none: (a: string, b: string) => string;
  essenceNote: string;
};

const STRINGS: Record<TextLang, Strings> = {
  'zh-TW': {
    eyebrow: 'LEGENDS',
    title: '傳奇與六大領域',
    intro:
      '每位傳奇掌握兩個領域，他的牌組只能放這兩個領域與無特性的卡（核心規則 103.1.b）。點領域徽章篩選：選一個，看哪些傳奇用它；選兩個，看這個組合有誰。',
    filterLabel: '依領域篩選傳奇',
    showing: (n, total) => (n === total ? `全部 ${total} 位` : `${n} / ${total} 位`),
    clear: '清除篩選',
    none: (a, b) => `目前卡池沒有同時掌握${a}與${b}的傳奇。`,
    essenceNote: '領域風格為本站整理，不是官方文案。',
  },
  'zh-CN': {
    eyebrow: 'LEGENDS',
    title: '传奇与六大领域',
    intro:
      '每位传奇掌握两个领域，他的卡组只能放这两个领域与无特性的卡（核心规则 103.1.b）。点领域徽章筛选：选一个，看哪些传奇用它；选两个，看这个组合有谁。',
    filterLabel: '按领域筛选传奇',
    showing: (n, total) => (n === total ? `全部 ${total} 位` : `${n} / ${total} 位`),
    clear: '清除筛选',
    none: (a, b) => `目前卡池没有同时掌握${a}与${b}的传奇。`,
    essenceNote: '领域风格为本站整理，不是官方文案。',
  },
  en: {
    eyebrow: 'LEGENDS',
    title: 'Legends and the six domains',
    intro:
      'Each Legend holds two domains, and their deck may only contain cards of those domains plus colourless ones (Core Rules 103.1.b). Pick one domain to see which Legends use it, or two to see who holds that pair.',
    filterLabel: 'Filter Legends by domain',
    showing: (n, total) => (n === total ? `All ${total}` : `${n} of ${total}`),
    clear: 'Clear',
    none: (a, b) => `No Legend in the current pool holds both ${a} and ${b}.`,
    essenceNote: 'Domain descriptions are written by this site, not official copy.',
  },
};

/**
 * 首頁的「領域徽章＋傳奇列」。
 *
 * 傳奇的數量完全由資料決定：新系列加入傳奇，這裡就多幾張卡，版面不用改。
 */
export function LegendRoster({ lang, legends }: { lang: TextLang; legends: LegendView[] }) {
  const [selected, setSelected] = useState<PlayDomain[]>([]);
  const s = STRINGS[lang];

  const shown = legends.filter((legend) => matchesDomains(legend.domains, selected));
  const [first, second] = selected;

  return (
    <section className="flex flex-col gap-5 py-14" data-testid="legend-roster">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.28em] text-arcane">{s.eyebrow}</p>
        <h2 className="text-3xl font-bold text-ink">{s.title}</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-dim">{s.intro}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <DomainBadges
          lang={lang}
          selected={selected}
          onToggle={(domain) => setSelected((prev) => toggleDomain(prev, domain))}
          label={s.filterLabel}
        />
        <span className="font-mono text-xs text-ink-faint" data-testid="legend-count">
          {s.showing(shown.length, legends.length)}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="rounded-md border border-line px-3 py-1 text-xs text-ink-dim hover:border-arcane hover:text-ink"
          >
            {s.clear}
          </button>
        )}
      </div>

      {/* 只選一個領域時，順便說明這個領域的風格 */}
      {first && !second && (
        <p className="rounded-lg border border-line bg-surface-1/70 px-4 py-3 text-sm leading-relaxed text-ink-dim">
          <span className={`mr-2 font-serif text-base font-bold text-domain--${first}`}>
            {DOMAIN_SHORT[first][lang]}
          </span>
          {DOMAIN_ESSENCE[first][lang]}
          <span className="ml-2 text-xs text-ink-faint">{s.essenceNote}</span>
        </p>
      )}

      {shown.length === 0 && first && second ? (
        <p
          className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-dim"
          data-testid="legend-empty"
        >
          {s.none(DOMAIN_SHORT[first][lang], DOMAIN_SHORT[second][lang])}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {shown.map((legend) => (
            <li key={legend.id}>
              <Link
                href={legend.href}
                data-legend-link={legend.id}
                data-domains={legend.domains.join(' ')}
                className="group flex h-full flex-col gap-1.5 rounded-xl border border-line bg-surface-1/80 p-2 transition-colors hover:border-arcane"
              >
                <img
                  src={legend.image}
                  alt={legend.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="card-frame--portrait w-full rounded-lg object-cover transition-transform group-hover:scale-[1.02]"
                />
                <span className="flex items-center gap-1.5 px-0.5">
                  <DomainDot domain={legend.domains[0]} />
                  <DomainDot domain={legend.domains[1]} />
                  <span className="truncate text-sm font-semibold text-ink">{legend.name}</span>
                </span>
                <span className="flex items-center gap-1.5 px-0.5 text-[0.7rem] text-ink-faint">
                  <span>{legend.setLabel}</span>
                  {legend.region && <span className="truncate">· {legend.region}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
