import { GLYPH_LABELS } from '@/lib/labels';
import { GLYPH_IDS, type GlyphId } from '@/lib/types';
import type { TextLang } from '@/lib/i18n';

/**
 * 渲染關鍵字辭典裡的官方說明文字。
 *
 * 文字裡的符號寫成 {might}、{energy_1} 這種形式（由建置腳本統一），
 * 這裡把它們換成圖示。
 *
 * 與 CardText 一樣，這裡也只處理已知的符號 id ——
 * 認不得的 token 原樣輸出成純文字，由 React 自動跳脫，
 * 不會有任何內容被當成 HTML 解析。
 */
export function GlossaryText({ text, lang }: { text: string; lang: TextLang }) {
  const parts = text.split(/(\{[a-z0-9_]+\})/);

  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{([a-z0-9_]+)\}$/.exec(part);
        const id = m?.[1];
        if (id && (GLYPH_IDS as readonly string[]).includes(id)) {
          const glyph = id as GlyphId;
          const label = GLYPH_LABELS[glyph][lang];
          return (
            <img
              key={i}
              src={`/glyphs/${glyph}.svg`}
              alt={label}
              title={label}
              width={16}
              height={16}
              className="inline-block h-[1em] w-[1em] translate-y-[0.1em] align-baseline"
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
