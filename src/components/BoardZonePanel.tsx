'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import { CardHover } from './CardHover';
import { isInPlayZone, pileSize, ZONE_RULES, type BoardZone, type Pile } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

const ZONE_LABELS: Record<BoardZone, string> = {
  champion: '英雄區域（選定英雄）',
  hand: '手牌',
  base: '基地（場上）',
  bf0: '戰場一（你帶來的）',
  bf1: '戰場二（對手帶來的）',
  discard: '廢牌堆',
  exile: '放逐區',
};

/** 可以搬去哪些區域。順序照實際使用頻率排。 */
const MOVE_TARGETS: Record<BoardZone, BoardZone[]> = {
  // 108.3.d：選定英雄可以從英雄區域照正常規則打出
  champion: ['base', 'bf0', 'bf1', 'discard'],
  hand: ['base', 'bf0', 'bf1', 'discard'],
  // 198.1：位置包括戰場和基地，所以單位可以在這三處之間移動
  base: ['bf0', 'bf1', 'discard', 'hand'],
  bf0: ['base', 'bf1', 'discard'],
  bf1: ['base', 'bf0', 'discard'],
  discard: ['hand', 'base', 'exile'],
  exile: ['hand', 'base', 'discard'],
};

const SHORT: Record<BoardZone, string> = {
  champion: '英',
  hand: '手',
  base: '基',
  bf0: '戰一',
  bf1: '戰二',
  discard: '廢',
  exile: '逐',
};

/**
 * 盤面上的一個區域。
 *
 * 每個區域標明官方條號，理由跟牌組合法性檢查一樣：
 * 使用者要能自己去規則書查證我們沒有亂編。
 */
export function BoardZonePanel({
  zone,
  pile,
  byId,
  lang,
  art,
  onMove,
  onRemove,
  dormant,
  onDormantChange,
  extra,
  owner,
  label,
}: {
  zone: BoardZone;
  pile: Pile;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onMove: (cardId: string, to: BoardZone) => void;
  onRemove: (cardId: string) => void;
  /** 這個位置有幾張處於休眠（只有場上的位置會傳）。 */
  dormant?: Pile;
  onDormantChange?: (cardId: string, count: number) => void;
  /** 額外的控制項，例如手牌的「未知張數」。 */
  extra?: React.ReactNode;
  /**
   * 這一區是誰的。
   *
   * 戰場是雙方共用的（198.1），同一個 data-zone 會同時出現兩份 ——
   * 一份對手的、一份你的。少了這個標記就沒辦法明確指定是哪一份。
   */
  owner?: 'you' | 'opponent';
  /**
   * 蓋掉預設的區域名稱。
   *
   * 戰場擺在牌桌中間、標題已經寫了是哪一個戰場，上下兩半再各寫一次
   * 「戰場一（你帶來的）」只會混淆 —— 對手那一半也會寫成「你帶來的」。
   * 那兩半要標的是**誰的**，不是**哪一個戰場**。
   */
  label?: string;
}) {
  const entries = Object.entries(pile)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);

  const total = pileSize(pile);
  const { rule, hidden } = ZONE_RULES[zone];

  return (
    <section
      className="rounded-lg border border-line bg-surface-1 p-2.5"
      data-zone={zone}
      data-owner={owner}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-semibold text-ink">{label ?? ZONE_LABELS[zone]}</h4>
        <span className="text-sm text-ink-dim">{total}</span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="官方規則條號"
        >
          {rule}
        </span>
        {hidden && (
          <span className="text-[0.65rem] text-ink-faint" title="核心規則 108.7.c">
            私密資訊
          </span>
        )}
        {extra}
      </div>

      {entries.length === 0 ? (
        <p className="rounded border border-dashed border-line px-2 py-1.5 text-xs text-ink-faint">
          空
        </p>
      ) : (
        <ul className="space-y-1">
          {entries.map(({ card, qty }) => (
            <li
              key={card.id}
              className="flex items-center gap-1.5 rounded border border-line px-1.5 py-1"
            >
              <img
                src={cardImageUrl(card, 60, art)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-7 w-5 shrink-0 rounded-sm object-cover"
              />
              <span className="min-w-0 flex-1 text-xs text-ink" title={cardName(card, lang)}>
                <CardHover card={card} lang={lang} art={art}>
                  {cardName(card, lang)}
                </CardHover>
              </span>
              {qty > 1 && <span className="shrink-0 text-xs text-ink-dim">×{qty}</span>}

              {/* 活躍／休眠（414、415）。只有場上的位置有這個狀態。 */}
              {isInPlayZone(zone) && onDormantChange && (
                <button
                  type="button"
                  aria-label={`切換 ${cardName(card, lang)} 的活躍或休眠狀態`}
                  title={
                    (dormant?.[card.id] ?? 0) > 0
                      ? '休眠：耗盡了能量（414.1）。點一下改為活躍'
                      : '活躍：可以行動（415.1）。點一下改為休眠'
                  }
                  onClick={() => {
                    const current = dormant?.[card.id] ?? 0;
                    // 一次切一張：全活躍 → 全休眠 → 逐張喚醒
                    onDormantChange(card.id, current >= qty ? 0 : current + 1);
                  }}
                  className={`shrink-0 rounded border px-1 text-[0.65rem] ${
                    (dormant?.[card.id] ?? 0) > 0
                      ? 'border-amber-500/50 text-amber-300'
                      : 'border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  {(dormant?.[card.id] ?? 0) > 0
                    ? qty > 1
                      ? `休眠 ${dormant?.[card.id]}`
                      : '休眠'
                    : '活躍'}
                </button>
              )}

              <div className="flex shrink-0 gap-0.5">
                {MOVE_TARGETS[zone].map((target) => (
                  <button
                    key={target}
                    type="button"
                    title={`搬到${ZONE_LABELS[target]}`}
                    aria-label={`把 ${cardName(card, lang)} 從${ZONE_LABELS[zone]}搬到${ZONE_LABELS[target]}`}
                    onClick={() => onMove(card.id, target)}
                    className="h-5 min-w-5 rounded border border-line px-0.5 text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
                  >
                    {SHORT[target]}
                  </button>
                ))}
                {zone !== 'champion' && (
                <button
                  type="button"
                  title="放回牌堆"
                  aria-label={`把 ${cardName(card, lang)} 放回牌堆`}
                  onClick={() => onRemove(card.id)}
                  className="h-5 w-5 rounded border border-line text-[0.65rem] text-ink-dim hover:border-rose-500/60 hover:text-rose-300"
                >
                  ↺
                </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
