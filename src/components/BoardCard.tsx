'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面上的一張卡 —— 用卡圖，不是一行文字。
 *
 * ── 為什麼從文字列改成卡圖 ──────────────────────────────────────
 * 原本每個區域是一份文字清單（卡名 + 一排搬移按鈕）。資訊完整，
 * 但復盤時你腦中想的是「桌上那張卡」，不是「清單第三列」——
 * 實體對局看的是圖，掃一眼就知道場上有什麼。
 *
 * ── 休眠用轉 90 度表示 ──────────────────────────────────────────
 * 規則 414.1 的休眠在實體對局就是把卡片「打橫」。這裡照做，
 * 因為那是玩家已經認得的視覺語言，比一個寫著「休眠」的徽章直覺。
 * 用 CSS class 轉，不用 inline style —— CSP 擋 inline style。
 *
 * ── 點擊而不是 hover ────────────────────────────────────────────
 * 浮動預覽會有兩個問題：靠近畫面底部時跑到視窗外、以及被後面的
 * 兄弟元素蓋住。所以主要的檢視方式是**點一下**，卡片放大顯示在
 * 固定的檢視面板裡，永遠不會跑掉。hover 仍然會放大一點作為提示。
 */
export function BoardCard({
  card,
  qty,
  dormant,
  lang,
  art,
  selected,
  onSelect,
  zoneLabel,
}: {
  card: Card;
  qty: number;
  /** 這張卡在哪一區。放進可及名稱，避免與其他地方的同名按鈕混淆。 */
  zoneLabel: string;
  /** 這張卡有幾張處於休眠（414.1）。 */
  dormant: number;
  lang: TextLang;
  art: ArtLang;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = cardName(card, lang);
  const landscape = card.orientation === 'landscape';
  const allDormant = dormant >= qty && qty > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={`${name}${qty > 1 ? ` ×${qty}` : ''}${dormant > 0 ? `　休眠 ${dormant}` : ''}`}
      aria-label={`${zoneLabel}的 ${name}${qty > 1 ? ` ×${qty}` : ''}`}
      data-card={card.id}
      data-dormant={dormant > 0 ? dormant : undefined}
      className={`relative shrink-0 rounded transition-transform hover:z-20 hover:scale-110 focus-visible:z-20 focus-visible:scale-110 focus-visible:outline-none ${
        selected ? 'z-20 ring-2 ring-accent' : ''
      } ${landscape ? 'h-[56px] w-[80px]' : 'h-[80px] w-[57px]'}`}
    >
      <img
        src={cardImageUrl(card, 160, art)}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`h-full w-full rounded object-cover ${
          allDormant ? 'rotate-90 opacity-80' : dormant > 0 ? 'opacity-90' : ''
        }`}
      />

      {qty > 1 && (
        <span className="absolute -right-1 -top-1 rounded bg-surface-2 px-1 text-[0.6rem] font-semibold text-ink shadow">
          {qty}
        </span>
      )}

      {/* 部分休眠時標數字 —— 整疊都休眠已經用轉 90 度表示了 */}
      {dormant > 0 && !allDormant && (
        <span className="absolute -bottom-1 left-0 rounded bg-amber-500/90 px-1 text-[0.6rem] font-semibold text-black">
          橫 {dormant}
        </span>
      )}
    </button>
  );
}

/**
 * 一疊看不到內容的牌（牌堆、對手不知道內容的手牌）。
 *
 * 使用者要求「看得到牌堆」—— 牌堆剩幾張是復盤時最常看的數字之一，
 * 藏在摘要文字裡不夠明顯。這裡畫成一疊卡背，數字直接壓在上面。
 */
export function CardBackPile({
  count,
  label,
  rule,
}: {
  count: number;
  label: string;
  rule?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1" title={`${label} ${count} 張`}>
      <div
        className={`relative h-[60px] w-[43px] rounded border ${
          count > 0
            ? 'border-accent/40 bg-gradient-to-br from-surface-2 to-surface-3'
            : 'border-dashed border-line bg-transparent'
        }`}
        data-pile={label}
      >
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">
          {count}
        </span>
      </div>
      <span className="text-[0.6rem] leading-none text-ink-faint">
        {label}
        {rule && <span className="ml-0.5 font-mono opacity-70">{rule}</span>}
      </span>
    </div>
  );
}
