'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import type { ArtLang, TextLang } from '@/lib/i18n';
import { BUFF_DRAG_TYPE } from './BuffPalette';
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
  buff = 0,
  onBuffDrop,
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
  /** 這張卡目前的戰力加成（0 就不顯示）。 */
  buff?: number;
  /** 有傳才接受把加成拖上來。只有場上的位置會傳。 */
  onBuffDrop?: (amount: number) => void;
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
      data-buff={buff > 0 ? buff : undefined}
      onDragOver={
        onBuffDrop
          ? (e) => {
              // 只有真的帶著加成才接受，否則不要攔別人的拖放
              if (!e.dataTransfer.types.includes(BUFF_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          : undefined
      }
      onDrop={
        onBuffDrop
          ? (e) => {
              const raw = e.dataTransfer.getData(BUFF_DRAG_TYPE);
              if (raw === '') return;
              const amount = Number(raw);
              if (!Number.isFinite(amount)) return;
              e.preventDefault();
              onBuffDrop(amount);
            }
          : undefined
      }
      className={`relative shrink-0 rounded transition-transform hover:z-20 hover:scale-110 focus-visible:z-20 focus-visible:scale-110 focus-visible:outline-none ${
        selected ? 'z-20 ring-2 ring-accent' : ''
      } ${landscape ? 'h-[48px] w-[68px]' : 'h-[68px] w-[48px]'}`}
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

      {/*
       * 加成顯示成「卡面＋增益」而不是算好的總和。
       *
       * 一開始寫的是總和（3 加 2 就顯示 5），但使用者要的是看得出
       * **哪些是原本的、哪些是效果給的** —— 復盤時要判斷的往往是
       * 「這個增益消失之後還打得贏嗎」，總和把那個資訊蓋掉了。
       * 加總的責任留給戰場的合計，那裡才是真的要一個數字。
       */}
      {buff > 0 && (
        <span
          className="absolute -bottom-1 -right-1 rounded bg-emerald-500 px-1 text-[0.6rem] font-bold text-black shadow"
          title={
            card.might === null
              ? `加成 +${buff}（這張卡沒有戰力）`
              : `戰力 ${card.might} + 增益 ${buff} = ${card.might + buff}`
          }
        >
          {card.might === null ? `+${buff}` : `${card.might}+${buff}`}
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
 * 一疊看不到內容的牌（牌堆、符文牌堆、對手不知道內容的手牌）。
 *
 * 使用者要求「看得到牌堆」—— 牌堆剩幾張是復盤時最常看的數字之一，
 * 藏在摘要文字裡不夠明顯。這裡畫成一疊卡背，數字直接壓在上面。
 *
 * ── 可以點的那幾疊 ──────────────────────────────────────────────
 * 傳了 onClick 就變成按鈕：點主牌堆抽一張、點符文牌堆召一張。
 * 這是為了配合卡牌效果 —— 遊戲中「抽一張」「多召一張符文」隨時可能發生，
 * 每次都要跑去右側欄按按鈕太慢。牌堆就在桌上，點它最直覺。
 *
 * 空的牌堆不能點（disabled），因為抽不到也召不出來。
 */
export function CardBackPile({
  count,
  label,
  rule,
  onClick,
  actionHint,
}: {
  count: number;
  label: string;
  rule?: string;
  /** 有傳才變成可點的按鈕。 */
  onClick?: () => void;
  /** 點下去會發生什麼，寫進 title 與可及名稱。 */
  actionHint?: string;
}) {
  const face = (
    <span
      className={`relative block h-[52px] w-[38px] rounded border transition-transform ${
        count > 0
          ? 'border-accent/40 bg-gradient-to-br from-surface-2 to-surface-3'
          : 'border-dashed border-line bg-transparent'
      } ${onClick && count > 0 ? 'group-hover/pile:scale-105 group-hover/pile:border-accent' : ''}`}
      data-pile={label}
    >
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">
        {count}
      </span>
    </span>
  );

  const caption = (
    <span className="text-[0.6rem] leading-none text-ink-faint">
      {label}
      {rule && <span className="ml-0.5 font-mono opacity-70">{rule}</span>}
    </span>
  );

  if (!onClick) {
    return (
      <div className="flex flex-col items-center gap-1" title={`${label} ${count} 張`}>
        {face}
        {caption}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      data-pile-action={label}
      title={`${label} ${count} 張　${count === 0 ? '（空了）' : actionHint ?? ''}`}
      aria-label={`${label}（${count} 張）${actionHint ? `：${actionHint}` : ''}`}
      className="group/pile flex flex-col items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {face}
      {caption}
    </button>
  );
}
