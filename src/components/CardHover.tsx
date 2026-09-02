'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 把卡名包起來，滑鼠移上去（或鍵盤聚焦）時顯示卡圖。
 *
 * ── 為什麼是純 CSS，不用 JavaScript 算位置 ──────────────────────
 * 常見做法是監聽滑鼠位置，再用 inline style 把浮層放到游標旁邊。
 * **本站不能這樣做** —— CSP 有 `style-src 'self' 'nonce-…'`，
 * 沒有 'unsafe-inline'，所以 React 的 style={{ left, top }} 會被瀏覽器擋掉
 * （這個坑先前在機率長條圖上踩過，當時的解法是預先產生寬度 class）。
 *
 * 所以這裡完全不算座標：浮層用 absolute 貼在卡名底下，
 * 顯示與否交給 group-hover / group-focus-within。零 JavaScript、零 inline style。
 *
 * ── 為什麼也綁 focus ────────────────────────────────────────────
 * 只做 hover 的話，用鍵盤的人完全看不到卡圖。加上 tabIndex 讓卡名可以被
 * 聚焦，focus 時同樣顯示 —— 代價是多一個 tab 停留點，但那換來的是
 * 「這個功能鍵盤使用者也用得到」。
 */
export function CardHover({
  card,
  lang,
  art,
  children,
}: {
  card: Card;
  lang: TextLang;
  art: ArtLang;
  children: React.ReactNode;
}) {
  return (
    <span className="group/cardhover relative inline-flex min-w-0">
      <span tabIndex={0} className="min-w-0 truncate outline-none focus-visible:underline">
        {children}
      </span>

      {/*
       * pointer-events-none 很重要：浮層蓋住下方的搬移按鈕時，
       * 滑鼠若被浮層攔截就按不到那些按鈕了。
       */}
      <span
        className="pointer-events-none absolute left-0 top-full z-50 hidden pt-1 group-hover/cardhover:block group-focus-within/cardhover:block"
        data-testid="card-hover-image"
      >
        <img
          src={cardImageUrl(card, 320, art)}
          alt={cardName(card, lang)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-[200px] max-w-none rounded-lg border border-line bg-surface shadow-xl"
        />
      </span>
    </span>
  );
}
