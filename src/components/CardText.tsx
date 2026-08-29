import type { CardTextBlock, CardTextNode, GlyphId } from '@/lib/types';
import Link from 'next/link';
import { GLYPH_LABELS, KEYWORD_LABELS } from '@/lib/labels';
import { TAXONOMY } from '@/lib/cards';
import { t, type TextLang } from '@/lib/i18n';

/**
 * 渲染卡牌能力文字。
 *
 * 資安重點：這個元件只處理結構化的 token，
 * 完全沒有用到 dangerouslySetInnerHTML。
 * 官方回傳的內容早在建置階段就被拆解掉了
 * （英文見 scripts/lib/card-text-parser.mjs，簡中見 cn-text-parser.mjs），
 * 所有文字最後都是 React 的文字節點，由 React 自動跳脫。
 */

function Glyph({ id, lang }: { id: GlyphId; lang: TextLang }) {
  const label = GLYPH_LABELS[id][lang];
  return (
    <img
      src={`/glyphs/${id}.svg`}
      alt={label}
      title={label}
      width={16}
      height={16}
      className="inline-block h-[1em] w-[1em] translate-y-[0.1em] align-baseline"
    />
  );
}

function Token({ node, lang }: { node: CardTextNode; lang: TextLang }) {
  switch (node.type) {
    case 'text':
      return <>{node.value}</>;

    case 'break':
      return <br />;

    case 'glyph':
      return <Glyph id={node.id} lang={lang} />;

    case 'keyword': {
      const base = KEYWORD_LABELS[node.name][lang];
      const display = node.value === undefined ? base : `${base} ${node.value}`;

      /*
       * 滑鼠停留時顯示的說明來自官方卡面的提醒文字（taxonomy.keywords），
       * 不是手寫的。開發時手寫過一版，十五個裡有五個是錯的。
       */
      const entry = TAXONOMY.keywords[node.name];
      const official = entry?.[lang === 'zh-TW' ? 'tw' : lang === 'zh-CN' ? 'cn' : 'en'];
      const title = official
        ? lang === 'en'
          ? official
          : `${node.name}｜${official}`
        : node.name;

      // 點下去可以到辭典看完整說明
      return (
        <Link
          href={`/rules#keyword-${node.name.toLowerCase()}`}
          title={title}
          className="font-semibold text-accent-soft underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {display}
        </Link>
      );
    }
  }
}

function Tokens({ tokens, lang }: { tokens: CardTextNode[]; lang: TextLang }) {
  return (
    <>
      {tokens.map((node, i) => (
        <Token key={i} node={node} lang={lang} />
      ))}
    </>
  );
}

export function CardText({ blocks, lang }: { blocks: CardTextBlock[]; lang: TextLang }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-ink-faint">{t(lang).noAbilityText}</p>;
  }

  return (
    <div className="space-y-2 text-[0.95rem] leading-relaxed text-ink">
      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i}>
            <Tokens tokens={block.tokens} lang={lang} />
          </p>
        ) : (
          <ul key={i} className="ml-5 list-disc space-y-1 marker:text-ink-faint">
            {block.items.map((item, j) => (
              <li key={j}>
                <Tokens tokens={item} lang={lang} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
