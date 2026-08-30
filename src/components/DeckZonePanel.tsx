'use client';

import Link from 'next/link';
import { cardImageUrl, cardName, cardSubtitle } from '@/lib/cards';
import { DomainDot } from './CardBadges';
import { zoneLabel, type ExportRow } from '@/lib/deck-export';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/** 牌組裡的一列：縮圖、名稱、加減張數。 */
function DeckRow({
  card,
  qty,
  lang,
  art,
  owned,
  onChange,
}: {
  card: Card;
  qty: number;
  lang: TextLang;
  art: ArtLang;
  /** 你擁有幾張。undefined 代表沒在記錄收藏。 */
  owned: number | undefined;
  onChange: (next: number) => void;
}) {
  const subtitle = cardSubtitle(card, lang);
  const short = owned !== undefined && owned < qty ? qty - owned : 0;

  return (
    <li className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2 py-1.5">
      <img
        src={cardImageUrl(card, 80, art)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-10 w-[29px] shrink-0 rounded-sm object-cover"
      />

      <div className="min-w-0 flex-1">
        <Link
          href={`/cards/${card.id}`}
          className="block truncate text-sm text-ink hover:text-accent-soft"
        >
          {cardName(card, lang)}
          {subtitle && <span className="ml-1 text-ink-faint">{subtitle}</span>}
        </Link>
        <div className="flex items-center gap-1.5">
          {card.domains.map((d) => (
            <DomainDot key={d} domain={d} />
          ))}
          <span className="text-[0.7rem] text-ink-faint">
            {card.energy !== null && `${card.energy} 費`}
          </span>
          {short > 0 && (
            <span className="rounded bg-amber-500/15 px-1 text-[0.7rem] text-amber-400">
              缺 {short}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`減少 ${cardName(card, lang)}`}
          onClick={() => onChange(qty - 1)}
          className="h-6 w-6 rounded border border-line text-sm text-ink-dim hover:border-surface-3 hover:text-ink"
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-medium text-ink">{qty}</span>
        <button
          type="button"
          aria-label={`增加 ${cardName(card, lang)}`}
          onClick={() => onChange(qty + 1)}
          className="h-6 w-6 rounded border border-line text-sm text-ink-dim hover:border-surface-3 hover:text-ink"
        >
          +
        </button>
      </div>
    </li>
  );
}

export function DeckZonePanel({
  zone,
  rows,
  lang,
  art,
  collection,
  onChange,
  requirement,
}: {
  zone: ExportRow['zone'];
  rows: { card: Card; qty: number }[];
  lang: TextLang;
  art: ArtLang;
  collection: Record<string, number> | null;
  onChange: (cardId: string, next: number) => void;
  /** 顯示在標題旁的需求提示，例如「至少 40」。 */
  requirement?: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.qty, 0);

  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
        {zoneLabel(zone, lang)}
        <span className="font-normal text-ink-dim">{total}</span>
        {requirement && <span className="text-xs font-normal text-ink-faint">{requirement}</span>}
      </h3>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-faint">
          尚未加入任何卡牌
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ card, qty }) => (
            <DeckRow
              key={card.id}
              card={card}
              qty={qty}
              lang={lang}
              art={art}
              owned={collection ? (collection[card.id] ?? 0) : undefined}
              onChange={(next) => onChange(card.id, next)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
