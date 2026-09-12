import { CardText } from './CardText';
import type { Card } from '@/lib/types';
import type { TextLang } from '@/lib/i18n';

/**
 * 官方英文原文（附在中文能力文字下面）。
 *
 * Riot 的 Riftbound 開發者政策明文要求：卡牌要顯示官方英文文字，
 * 或 Riot 自己的官方翻譯；自己做的翻譯只能**與官方英文原文並列顯示**，
 * 不能取代它（policies/riftbound，2026-09-12 查證）。
 *
 * 本站的繁中能力文字是由官方簡中轉換而來 —— 那是我們做的，不是官方繁中版，
 * 所以只要介面不是英文，就把官方英文原文一起附上。
 *
 * 版面順序刻意是「翻譯在上、原文在下並加標籤」：
 * 使用者先讀得懂的版本，再看到權威版本，而且一眼分得出哪段有官方依據 ——
 * 跟勘誤區塊同一個做法。
 */

const LABEL: Record<TextLang, string> = {
  'zh-TW': '官方英文原文 · 判定以此為準',
  'zh-CN': '官方英文原文 · 判定以此为准',
  en: '',
};

export function OfficialCardText({ card, lang }: { card: Card; lang: TextLang }) {
  // 介面已經是英文時，上面顯示的就是官方原文，不需要重複一次。
  if (lang === 'en') return null;

  return (
    <div
      className="mt-2.5 rounded border border-dashed border-line p-2"
      data-testid="card-text-en"
    >
      <p className="text-[0.65rem] font-medium text-ink-faint">{LABEL[lang]}</p>
      <div className="mt-1 text-ink-dim">
        <CardText blocks={card.text} lang="en" />
      </div>
    </div>
  );
}
