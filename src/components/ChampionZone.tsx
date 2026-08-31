'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import { setInPile, type PlayerBoard } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 傳奇區域與英雄區域。
 *
 * 這兩個區域的卡在遊戲開始時就擺出來，**不在牌堆裡**：
 *   107.4　　　傳奇區域。傳奇卡不能從此區移除、移動或移位（107.4.d）
 *   103.2.a.1　遊戲開始時選定英雄置於英雄區域
 *   133.4　　　主牌堆的卡開局會出現在主牌堆，或（如果是選定英雄）英雄區域
 *
 * 所以傳奇只顯示不能動；選定英雄可以指定，也可以打出去（108.3.d）。
 */
export function ChampionZone({
  player,
  byId,
  lang,
  art = 'en',
  onChange,
}: {
  player: PlayerBoard;
  byId: Map<string, Card>;
  lang: TextLang;
  art?: ArtLang;
  onChange: (next: PlayerBoard) => void;
}) {
  const legend = player.deck.legendId ? byId.get(player.deck.legendId) : undefined;

  /** 主牌組裡可以當選定英雄的卡：英雄單位，且與傳奇共享英雄標籤（103.2.a.2）。 */
  const candidates = Object.keys(player.deck.main)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c))
    .filter(
      (card) =>
        card.subtype === 'champion' &&
        (!legend || card.tags.some((tag) => legend.tags.includes(tag))),
    )
    .sort((a, b) => a.number - b.number);

  /** 目前在英雄區域的那張（可能已經被打出去，這時就是空的）。 */
  const inZone = Object.keys(player.champion)[0];
  const inZoneCard = inZone ? byId.get(inZone) : undefined;

  const choose = (cardId: string) => {
    onChange({
      ...player,
      deck: { ...player.deck, championId: cardId === '' ? null : cardId },
      // 指定後直接放進英雄區域（103.2.a.1：遊戲開始時置於英雄區域）
      champion: cardId === '' ? {} : setInPile({}, cardId, 1),
    });
  };

  return (
    <section
      className="mb-3 rounded-lg border border-line bg-surface-1 p-2.5"
      data-testid="champion-zone"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {/* 傳奇區域 */}
        <div>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5">
            <h4 className="text-xs font-semibold text-ink">傳奇區域</h4>
            <span
              className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
              title="傳奇卡不能從此區移除、移動或移位（107.4.d）"
            >
              107.4
            </span>
          </div>
          {legend ? (
            <div className="flex items-center gap-1.5">
              <img
                src={cardImageUrl(legend, 60, art)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-7 w-5 shrink-0 rounded-sm object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-ink">
                {cardName(legend, lang)}
              </span>
            </div>
          ) : (
            <p className="text-[0.7rem] text-ink-faint">牌組裡還沒有傳奇</p>
          )}
        </div>

        {/* 英雄區域 */}
        <div>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5">
            <label htmlFor={`champion-${player.deck.legendId ?? 'none'}`} className="text-xs font-semibold text-ink">
              選定英雄
            </label>
            <span
              className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
              title="遊戲開始時置於英雄區域（103.2.a.1、133.4）"
            >
              108.3
            </span>
          </div>

          {candidates.length === 0 ? (
            <p className="text-[0.7rem] text-ink-faint">
              主牌組裡沒有符合傳奇標籤的英雄單位（103.2.a.2）
            </p>
          ) : (
            <select
              data-testid="champion-select"
              id={`champion-${player.deck.legendId ?? 'none'}`}
              value={player.deck.championId ?? ''}
              onChange={(e) => choose(e.target.value)}
              className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
            >
              <option value="">（尚未指定）</option>
              {candidates.map((card) => (
                <option key={card.id} value={card.id}>
                  {cardName(card, lang)}
                </option>
              ))}
            </select>
          )}

          {player.deck.championId && (
            <p className="mt-1 text-[0.7rem] text-ink-faint">
              {inZoneCard
                ? '在英雄區域，尚未打出 —— 不算在牌堆裡'
                : '已經打出去了（108.3.d）'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
