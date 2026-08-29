import { DOMAIN_LABELS, RARITY_LABELS, TYPE_LABELS } from '@/lib/labels';
import type { TextLang } from '@/lib/i18n';
import type { Card, Domain } from '@/lib/types';

/**
 * 領域的顏色圓點。
 *
 * 顏色來自 globals.css 的 .domain-dot--* class，而不是行內 style ——
 * 因為我們的 CSP 不允許 style 屬性（詳見 globals.css 的說明）。
 */
export function DomainDot({ domain }: { domain: Domain }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full domain-dot--${domain}`}
    />
  );
}

/**
 * 領域標記。
 *
 * 無障礙考量：不只用顏色區分 —— 每個圓點旁都有文字標籤，
 * 色覺辨識障礙的使用者也能分辨。
 *
 * 中文介面顯示顏色名稱（紅色／綠色…），因為中文版的實體卡面就是用顏色標示領域；
 * 英文介面顯示領域名稱（Fury／Calm…），與英文卡面一致。
 */
export function DomainBadges({ domains, lang }: { domains: Domain[]; lang: TextLang }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {domains.map((domain) => (
        <span
          key={domain}
          className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-dim"
        >
          <DomainDot domain={domain} />
          {DOMAIN_LABELS[domain][lang]}
        </span>
      ))}
    </span>
  );
}

export function TypeBadges({ types, lang }: { types: Card['types']; lang: TextLang }) {
  return (
    <>
      {types.map((type) => (
        <span
          key={type}
          className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-dim"
        >
          {TYPE_LABELS[type][lang]}
        </span>
      ))}
    </>
  );
}

export function RarityBadge({ rarity, lang }: { rarity: Card['rarity']; lang: TextLang }) {
  return (
    <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-dim">
      {RARITY_LABELS[rarity][lang]}
    </span>
  );
}

/** 能量 / 力量 / 威力 的數值標示。 */
export function StatPill({ glyph, label, value }: { glyph: string; label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink"
      title={label}
    >
      <img src={`/glyphs/${glyph}.svg`} alt="" width={12} height={12} className="h-3 w-3" />
      {value}
    </span>
  );
}
