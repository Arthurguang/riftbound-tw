'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GlossaryText } from './GlossaryText';
import { KEYWORD_LABELS } from '@/lib/labels';
import { filterKeywords } from '@/lib/glossary';
import { RULES_STRINGS } from '@/lib/rules-content';
import type { Taxonomy } from '@/lib/types';
import type { TextLang } from '@/lib/i18n';

/**
 * 可搜尋的關鍵字辭典。
 *
 * 說明文字全部來自官方卡面（見 scripts/fetch-cards.mjs 的抽取邏輯），
 * 這個元件只負責呈現與搜尋，不含任何自行撰寫的規則內容。
 */
export function KeywordGlossary({
  keywords,
  counts,
  lang,
  langQuery,
}: {
  keywords: Taxonomy['keywords'];
  /** 每個關鍵字在 Origins 系列裡有幾張卡使用 */
  counts: Record<string, number>;
  lang: TextLang;
  /*
   * 這裡收的是查詢字串而不是「產生連結的函式」——
   * 函式沒辦法從伺服器元件傳給用戶端元件（無法序列化），
   * 傳了會讓整個區塊靜默地渲染不出來。
   */
  langQuery: string;
}) {
  const [query, setQuery] = useState('');

  /*
   * 這個旗標只做一件事：在瀏覽器接手（hydration 完成）之後標記到 DOM 上。
   *
   * 端對端測試需要它 —— 在 hydration 完成前，畫面上的搜尋框只是伺服器產生的
   * HTML，打字進去 React 收不到，測試會因此偶發失敗（實際發生過）。
   * 有了明確的訊號，測試就不必靠「等一下應該好了吧」這種猜測。
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const strings = RULES_STRINGS;

  const cardHref = (keyword: string) =>
    `/cards?q=${encodeURIComponent(keyword)}${langQuery === '' ? '' : `&${langQuery}`}`;

  const results = useMemo(() => filterKeywords(keywords, query), [query, keywords]);

  return (
    <div data-glossary-ready={ready ? 'true' : 'false'}>
      <div className="mb-4">
        <label htmlFor="glossary-search" className="sr-only">
          {strings.glossarySearch[lang]}
        </label>
        <input
          id="glossary-search"
          type="search"
          value={query}
          maxLength={60}
          placeholder={strings.glossarySearch[lang]}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-line bg-surface-1 px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-ink-dim">{strings.glossaryNoResult[lang]}</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {results.map((name) => {
            const entry = keywords[name];
            const official = entry?.[lang === 'zh-TW' ? 'tw' : lang === 'zh-CN' ? 'cn' : 'en'];
            const count = counts[name] ?? 0;

            return (
              <div
                key={name}
                id={`keyword-${name.toLowerCase()}`}
                className="scroll-mt-20 rounded-xl border border-line bg-surface-1 p-4"
              >
                <dt className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-semibold text-accent-soft">
                    {KEYWORD_LABELS[name][lang]}
                  </span>
                  {lang !== 'en' && <span className="text-xs text-ink-faint">{name}</span>}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink">
                  {official ? (
                    <GlossaryText text={official} lang={lang} />
                  ) : (
                    <span className="text-ink-faint">{strings.noOfficialText[lang]}</span>
                  )}
                </dd>
                {count > 0 && (
                  <dd className="mt-2">
                    <Link
                      href={cardHref(name)}
                      className="text-xs text-ink-dim underline underline-offset-2 hover:text-accent-soft"
                    >
                      {strings.usedOnCards[lang]}（{count}）
                    </Link>
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
