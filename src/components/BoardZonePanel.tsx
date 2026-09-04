'use client';

import { BoardCard } from './BoardCard';
import {
  MOVE_TARGETS,
  pileSize,
  ZONE_LABELS,
  ZONE_RULES,
  type BoardZone,
  type Pile,
} from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面上的一個區域，內容以**卡圖**排列。
 *
 * 每個區域標明官方條號，理由跟牌組合法性檢查一樣：
 * 使用者要能自己去規則書查證我們沒有亂編。
 *
 * ── 搬移按鈕只在「選中的那張」旁邊出現 ──────────────────────────
 * 每張卡都掛四五顆小按鈕會把版面塞爆（卡圖只有 48px 寬）。
 * 但把操作全部放到右側欄，又變成「點了卡還要把滑鼠移到另一邊」——
 * 使用者反映這樣很麻煩。
 *
 * 折衷：點一張卡之後，**這一區的底部**才長出那一列搬移按鈕。
 * 一次只有一列、就在卡片旁邊，兩個問題都避開了。
 * 右側欄的檢視面板仍然保留大圖與能力文字。
 */
export function BoardZonePanel({
  zone,
  pile,
  byId,
  lang,
  art,
  dormant,
  buffs,
  onBuffDrop,
  extra,
  owner,
  label,
  selectedCardId,
  onSelect,
  onMove,
  onRemove,
  className,
}: {
  zone: BoardZone;
  pile: Pile;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  /** 這個位置有幾張處於休眠（只有場上的位置會傳）。 */
  dormant?: Pile;
  /** 這個位置每張卡的戰力加成（只有場上的位置會傳）。 */
  buffs?: Pile;
  /** 把加成拖到某張卡上。只有場上的位置會傳。 */
  onBuffDrop?: (cardId: string, amount: number) => void;
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
  /** 把選中的那張搬到別的區域。沒傳就不顯示搬移列（例如唯讀的展示）。 */
  onMove?: (cardId: string, to: BoardZone) => void;
  /** 把選中的那張放回牌堆。 */
  onRemove?: (cardId: string) => void;
  /** 由版面決定這一格多高多寬 —— 桌子是固定高度的格線。 */
  className?: string;
}) {
  const entries = Object.entries(pile)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);

  const total = pileSize(pile);
  const { rule, hidden } = ZONE_RULES[zone];

  return (
    <section
      className={`relative flex flex-col rounded-lg border border-line bg-surface-1 p-2 ${className ?? ''}`}
      data-zone={zone}
      data-owner={owner}
    >
      <div className="mb-1.5 flex shrink-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
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
        <div className="flex flex-wrap content-start gap-1.5">
          {entries.map(({ card, qty }) => (
            <BoardCard
              key={card.id}
              card={card}
              qty={qty}
              dormant={dormant?.[card.id] ?? 0}
              buff={buffs?.[card.id] ?? 0}
              onBuffDrop={
                onBuffDrop ? (amount) => onBuffDrop(card.id, amount) : undefined
              }
              lang={lang}
              art={art}
              zoneLabel={label ?? ZONE_LABELS[zone]}
              selected={selectedCardId === card.id}
              onSelect={() => onSelect(card.id)}
            />
          ))}
        </div>
      )}

      {/* 選中的那張才長出搬移列 —— 就在卡片旁邊，不用跑去右側欄 */}
      {selectedCardId && onMove && entries.some((e) => e.card.id === selectedCardId) && (
        <div
          className="mt-1.5 flex shrink-0 flex-wrap items-center gap-1 rounded border border-accent/40 bg-surface-2/60 p-1"
          data-testid="zone-move-bar"
        >
          <span className="text-[0.6rem] text-ink-faint">搬到</span>
          {MOVE_TARGETS[zone].map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onMove(selectedCardId, target)}
              className="rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
            >
              {ZONE_LABELS[target]}
            </button>
          ))}
          {zone !== 'champion' && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(selectedCardId)}
              className="rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-ink-dim hover:border-rose-500/60 hover:text-rose-300"
            >
              放回牌堆
            </button>
          )}
        </div>
      )}
    </section>
  );
}
