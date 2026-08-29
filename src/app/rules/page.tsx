import type { Metadata } from 'next';
import { Suspense } from 'react';
import { KeywordGlossary } from '@/components/KeywordGlossary';
import { GlossaryText } from '@/components/GlossaryText';
import { ALL_CARDS, TAXONOMY } from '@/lib/cards';
import { GLYPH_LABELS } from '@/lib/labels';
import { BASICS, OFFICIAL_LINKS, RULES_STRINGS } from '@/lib/rules-content';
import { readTextLang, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import { KEYWORDS } from '@/lib/types';

export const metadata: Metadata = {
  title: '規則說明與關鍵字辭典',
  description:
    '符文戰場關鍵字辭典與規則速查。關鍵字說明取自官方卡面上的提醒文字，並附官方規則書連結。',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RulesPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const rawLang = query.lang;
  const lang = readTextLang({ lang: Array.isArray(rawLang) ? rawLang[0] : rawLang });
  const s = RULES_STRINGS;

  // 保留語言設定，讓頁內連結不會把使用者的選擇弄丟
  const langQuery = lang === DEFAULT_TEXT_LANG ? '' : `lang=${lang}`;

  /** 每個關鍵字在收錄的卡牌裡出現幾張 */
  const counts: Record<string, number> = {};
  for (const keyword of KEYWORDS) {
    counts[keyword] = ALL_CARDS.filter((card) =>
      card.text.some((block) => {
        const tokenLists = block.kind === 'paragraph' ? [block.tokens] : block.items;
        return tokenLists.some((tokens) =>
          tokens.some((t) => t.type === 'keyword' && t.name === keyword),
        );
      }),
    ).length;
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {s.title[lang]}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">{s.intro[lang]}</p>
      </header>

      {/* ── 遊戲概要 ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-ink">{s.basicsTitle[lang]}</h2>
        <p className="mt-1 text-xs text-ink-faint">{s.basicsNote[lang]}</p>
        <ul className="mt-4 space-y-2.5">
          {BASICS.map((item) => (
            <li
              key={item.text.en}
              className="rounded-lg border border-line bg-surface-1 px-4 py-3 text-sm leading-relaxed text-ink"
            >
              {item.text[lang]}
              <span className="mt-1 block text-xs text-ink-faint">— {item.source[lang]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 關鍵字辭典 ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-ink">{s.glossaryTitle[lang]}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-faint">
          {s.glossaryNote[lang]}
        </p>
        <div className="mt-4">
          <Suspense fallback={null}>
            <KeywordGlossary
              keywords={TAXONOMY.keywords}
              counts={counts}
              lang={lang}
              langQuery={langQuery}
            />
          </Suspense>
        </div>
      </section>

      {/* ── 符號說明 ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-ink">{s.glyphsTitle[lang]}</h2>
        <p className="mt-1 text-xs text-ink-faint">{s.glyphsNote[lang]}</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {TAXONOMY.glyphs.map((glyph) => (
            <li
              key={glyph}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2"
            >
              <GlossaryText text={`{${glyph}}`} lang={lang} />
              <span className="truncate text-sm text-ink-dim">{GLYPH_LABELS[glyph][lang]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 官方規則文件 ── */}
      <section>
        <h2 className="text-lg font-semibold text-ink">{s.linksTitle[lang]}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-faint">{s.linksNote[lang]}</p>
        <ul className="mt-4 space-y-2">
          {OFFICIAL_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-line bg-surface-1 px-4 py-3 transition-colors hover:border-accent"
              >
                <span className="text-sm font-medium text-ink">{link.label[lang]} ↗</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{link.note[lang]}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
