'use client';

import { BoardCard } from './BoardCard';
import { pileSize, ZONE_RULES, type BoardZone, type Pile } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

const ZONE_LABELS: Record<BoardZone, string> = {
  champion: '英雄區域',
  hand: '手牌',
  base: '基地',
  bf0: '戰場一',
  bf1: '戰場二',
  discard: '廢牌堆',
  exile: '放逐區',
};

/**
 * 盤面上的一個區域，內容以**卡圖**排列。
 *
 * 每個區域標明官方條號，理由跟牌組合法性檢查一樣：
 * 使用者要能自己去規則書查證我們沒有亂編。
 *
 * ── 這裡不再放搬移按鈕 ──────────────────────────────────────────
 * 每張卡旁邊掛四五顆小按鈕，在文字清單時代還能看，換成卡圖之後
 * 會把版面塞爆。改成**點卡片選取**，操作集中在下方的檢視面板。
 * 一次只操作一張，畫面乾淨很多，也不會誤按到隔壁那張的按鈕。
 */
export function BoardZonePanel({
  zone,
  pile,
  byId,
  lang,
  art,
  dormant,
  extra,
  owner,
  label,
  selectedCardId,
  onSelect,
}: {
  zone: BoardZone;
  pile: Pile;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  /** 這個位置有幾張處於休眠（只有場上的位置會傳）。 */
  dormant?: Pile;
  /** 額外的控制項，例如對手手牌的「未知張數」。 */
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
   * 「戰場一」只會重複。那兩半要標的是**誰的**。
   */
  label?: string;
  /** 目前選中的卡（只有在同一區時才會標示）。 */
  selectedCardId?: string;
  onSelect: (cardId: string) => void;
}) {
  const entries = Object.entries(pile)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);

  const total = pileSize(pile);
  const { rule, hidden } = ZONE_RULES[zone];

  return (
    <section
      className="relative rounded-lg border border-line bg-surface-1 p-2"
      data-zone={zone}
      data-owner={owner}
    >
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <h4 className="text-xs font-semibold text-ink">{label ?? ZONE_LABELS[zone]}</h4>
        <span className="text-xs text-ink-dim">{total}</span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-ink-faint"
          title="官方規則條號"
        >
          {rule}
        </span>
        {hidden && (
          <span className="text-[0.6rem] text-ink-faint" title="核心規則 108.7.c">
            私密
          </span>
        )}
        {extra}
      </div>

      {entries.length === 0 ? (
        <p className="rounded border border-dashed border-line px-2 py-3 text-center text-[0.7rem] text-ink-faint">
          空
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map(({ card, qty }) => (
            <BoardCard
              key={card.id}
              card={card}
              qty={qty}
              dormant={dormant?.[card.id] ?? 0}
              lang={lang}
              art={art}
              zoneLabel={label ?? ZONE_LABELS[zone]}
              selected={selectedCardId === card.id}
              onSelect={() => onSelect(card.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
