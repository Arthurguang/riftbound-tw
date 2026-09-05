import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CardText } from '@/components/CardText';
import { DomainBadges, RarityBadge, StatPill, TypeBadges } from '@/components/CardBadges';
import {
  ALL_CARDS,
  TAXONOMY,
  cardFlavor,
  cardImageAlt,
  cardImageOriginal,
  cardImageUrl,
  cardName,
  cardSubtitle,
  cardText,
  getCardById,
  getVariants,
  isConvertedText,
  resolveArtLang,
} from '@/lib/cards';
import { BAN_LIST_VERSION, banEntriesFor } from '@/lib/ban-list';
import {
  coinedTermsIn,
  ERRATA_VERSION,
  errataFor,
  errataZh,
  isEnglishOnly,
  ZH_TRANSLATOR,
} from '@/lib/errata';
import { filtersFromParams, filtersToQueryString } from '@/lib/filters-url';
import { SET_LABELS } from '@/lib/labels';
import { readArtLang, readTextLang, t, DEFAULT_ART_LANG, DEFAULT_TEXT_LANG } from '@/lib/i18n';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 告訴 Next.js 全部 376 張卡的路由。
 *
 * 由於 CSP 的 nonce 需要動態渲染（見 src/app/layout.tsx 的說明），
 * 這些頁面不會在建置時被寫成靜態檔，但這份清單仍有價值：
 * 它讓建置階段就能確認每一個 id 都是合法路由。
 *
 * 執行期的安全保證來自下面的 getCardById —— 網址裡的 id 只會被
 * 拿去查一張建置時就固定好的表，查不到就 404，
 * 不會有任何字串被當成查詢條件或程式碼使用。
 */
export function generateStaticParams() {
  return ALL_CARDS.map((card) => ({ id: card.id }));
}

/** 從 searchParams 取出語言設定（值可能是陣列，只取第一個）。 */
function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const card = getCardById(id);
  if (!card) return { title: '找不到這張卡' };

  const lang = readTextLang({ lang: firstValue((await searchParams).lang) });
  const name = cardName(card, lang);
  const subtitle = cardSubtitle(card, lang);
  const display = subtitle ? `${name}・${subtitle}` : name;

  return {
    title: `${display}（${card.code}）`,
    description:
      card.image.alt ?? `${display} — 符文戰場${SET_LABELS[card.set][lang]}系列卡牌資料。`,
  };
}

export default async function CardDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const card = getCardById(id);
  if (!card) notFound();

  const query = await searchParams;

  /*
   * searchParams 的值可能是字串或字串陣列（?type=a&type=b）。
   * URLSearchParams 只吃字串，所以先攤平成單值，陣列一律取第一個 ——
   * 跟 firstValue 對語言的處理一致。
   */
  const flatQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const single = firstValue(value);
    if (single !== undefined) flatQuery[key] = single;
  }

  const lang = readTextLang({ lang: firstValue(query.lang) });
  const art = readArtLang({ art: firstValue(query.art) });
  const strings = t(lang);

  // 保留語言設定，讓頁內連結不會把使用者的選擇弄丟。
  const langParams = new URLSearchParams();
  if (lang !== DEFAULT_TEXT_LANG) langParams.set('lang', lang);
  if (art !== DEFAULT_ART_LANG) langParams.set('art', art);
  const langQuery = langParams.toString();
  const withLang = (path: string) => (langQuery === '' ? path : `${path}?${langQuery}`);

  /*
   * 回圖鑑時把篩選條件帶回去。
   *
   * **不是**把網址參數原封不動反射回連結** —— 網址是使用者可以任意編造的輸入，
   * 直接回貼等於讓別人決定我們頁面上的連結長什麼樣。
   *
   * 所以先用 filtersFromParams 解析（它只認允許清單內的值，其餘丟掉），
   * 再用 filtersToQueryString 重新組出來。經過這一圈，出去的一定是我們認得的東西。
   */
  const backQuery = [
    filtersToQueryString(filtersFromParams(new URLSearchParams(flatQuery), TAXONOMY.tags)),
    langQuery,
  ]
    .filter(Boolean)
    .join('&');
  const backHref = backQuery === '' ? '/cards' : `/cards?${backQuery}`;

  const variants = getVariants(card);
  const isLandscape = card.orientation === 'landscape';
  const shownArt = resolveArtLang(card, art);
  const name = cardName(card, lang);
  const subtitle = cardSubtitle(card, lang);
  const flavor = cardFlavor(card, lang);
  const converted = isConvertedText(card, lang);

  /*
   * 禁卡狀態。banEntriesFor 回傳所有賽制的禁用紀錄，
   * 再另外判斷 1v1 有沒有被禁 —— 兩者不一樣：有一張傳奇只在 2v2 被禁，
   * 官方公告特別說明過它在 1v1 是合理的，標成「禁用」會誤導使用者。
   */
  const errata = errataFor(card);
  /*
   * 中文參考翻譯只在中文介面顯示 —— 看英文介面的人要的就是官方原文，
   * 多塞一段非官方的中文只是干擾。
   */
  const errataZhText = errata && lang !== 'en' ? errataZh(errata) : null;
  const coined = errataZhText ? coinedTermsIn(errataZhText) : [];

  const bans = banEntriesFor(card);
  const oneVsOneBanned = bans.some((b) => b.formats.includes('constructed'));
  const twNameFromCommunity = lang === 'zh-TW' && card.zh.tw?.nameSource === 'community';

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <Link
        href={backHref}
        className="text-sm text-ink-dim transition-colors hover:text-accent-soft"
      >
        ← {strings.backToGallery}
      </Link>

      <article className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* 卡圖 */}
        <div className={isLandscape ? 'md:col-span-2 md:max-w-2xl' : ''}>
          <a
            href={cardImageOriginal(card, shownArt)}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-line bg-surface-1"
          >
            <img
              key={shownArt}
              src={cardImageUrl(card, 900, shownArt)}
              alt={cardImageAlt(card, lang, shownArt)}
              width={card.image.width}
              height={card.image.height}
              referrerPolicy="no-referrer"
              className="h-auto w-full"
            />
          </a>
          <p className="mt-2 text-xs text-ink-faint">
            {strings.openFullImage}
            {art === 'zh-CN' && shownArt === 'en' && '（這張卡沒有简体中文卡面，顯示英文卡面）'}
          </p>
        </div>

        {/* 資料 */}
        <div className="space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadges types={card.types} lang={lang} />
              <RarityBadge rarity={card.rarity} lang={lang} />
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              {name}
              {subtitle && <span className="ml-2 text-ink-dim">{subtitle}</span>}
            </h1>
            <p className="mt-1 font-mono text-sm text-ink-faint">{card.code}</p>

            {/* 其他語言的卡名對照 —— 台灣玩家常需要跟英文卡溝通 */}
            {lang !== 'en' && (
              <p className="mt-1 text-sm text-ink-faint">
                {card.name}
                {twNameFromCommunity && (
                  <span className="ml-2 text-xs" title={strings.communityNameNotice}>
                    · {strings.communityNameNotice}
                  </span>
                )}
              </p>
            )}
          </header>

          {/*
            賽事禁用標示。

            放在數值上方、卡名正下方 —— 這是會影響「這張卡能不能帶去比賽」的資訊，
            使用者往往看完卡名就決定要不要用了，藏在頁面下方等於沒說。

            一律附上官方原文與版本日期：禁卡表是人工維護、沒有 API 的資料，
            使用者要能自己去對官方公告。
          */}
          {bans.length > 0 && (
            <aside
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5"
              data-testid="ban-notice"
            >
              <p className="text-sm font-medium text-rose-200">
                {oneVsOneBanned ? '正式賽事構築禁用' : '2v2 構築禁用（1v1 可用）'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-200/75">
                {oneVsOneBanned
                  ? '這張卡在官方認證賽事的構築賽制中不可使用。'
                  : '這張卡只在 2v2 構築賽制被禁用，1v1 不受影響。'}
                {bans[0]!.official !== card.name && (
                  <> 官方禁卡表上列為「{bans[0]!.official}」。</>
                )}
              </p>
              <p className="mt-1.5 text-[0.7rem] text-rose-200/55">
                依據 {BAN_LIST_VERSION.updated} 版禁卡表 ·{' '}
                <a
                  href={BAN_LIST_VERSION.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-rose-200"
                >
                  官方公告
                </a>
              </p>
            </aside>
          )}

          {(card.energy !== null || card.might !== null || card.power !== null) && (
            <div className="flex flex-wrap items-center gap-2">
              {card.energy !== null && (
                <StatPill glyph="energy_1" label={strings.energy} value={card.energy} />
              )}
              {card.might !== null && (
                <StatPill glyph="might" label={strings.might} value={card.might} />
              )}
              {card.power !== null && (
                <StatPill glyph="rune_rainbow" label={strings.power} value={card.power} />
              )}
            </div>
          )}

          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-dim uppercase">
              {strings.abilityText}
            </h2>
            <CardText blocks={cardText(card, lang)} lang={lang} />

            {/*
              勘誤。

              刻意緊接在能力文字**下面**：使用者剛讀完卡上寫什麼，
              下一件該知道的就是「這段已經被官方更正了」。放到頁面別處
              等於讓人先讀了一段失效的文字。

              官方原文照登不翻譯 —— 這是規則文字，我們自己翻等於是在發明
              一段看起來很官方的敘述。本站的原則是寧可讓使用者看英文，
              也不要給他一段沒有出處的中文規則。
            */}
            {errata && (
              <div
                className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
                data-testid="errata-notice"
              >
                <p className="text-xs font-semibold text-amber-200">
                  這張卡已勘誤 —— 實際生效的是下面這段文字
                </p>
                <p className="mt-1.5 text-[0.7rem] leading-relaxed text-amber-100/85 whitespace-pre-line">
                  {errata.updated}
                </p>

                {/*
                  社群整理的中文參考翻譯。

                  放在官方原文**下面**、而且用不同的框線與標籤區隔 ——
                  使用者一眼要能分辨哪一段有官方依據、哪一段是我們補的。
                  順序也是刻意的：先看到權威版本，再看到參考版本。
                */}
                {errataZhText && (
                  <div
                    className="mt-2.5 rounded border border-dashed border-amber-500/30 p-2"
                    data-testid="errata-zh"
                  >
                    <p className="text-[0.65rem] font-medium text-amber-200/70">
                      中文參考翻譯 · {ZH_TRANSLATOR}
                    </p>
                    <p className="mt-1 text-[0.7rem] leading-relaxed whitespace-pre-line text-ink-dim">
                      {errataZhText}
                    </p>
                    {coined.length > 0 && (
                      <p className="mt-1.5 text-[0.65rem] leading-relaxed text-ink-faint">
                        {coined.map((term) => (
                          <span key={term.en}>
                            「{term.zh}」（{term.en}）是本站自訂的用詞：{term.why}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="mt-1 text-[0.65rem] text-ink-faint">
                      翻譯僅供參考，判定一律以上方官方英文原文為準。
                    </p>
                  </div>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-[0.7rem] text-amber-200/60 hover:text-amber-200">
                    卡片上原本印的文字
                  </summary>
                  <p className="mt-1 text-[0.7rem] leading-relaxed text-ink-faint whitespace-pre-line">
                    {errata.printed}
                  </p>
                </details>

                <p className="mt-2 text-[0.7rem] leading-relaxed text-amber-200/55">
                  {isEnglishOnly(errata)
                    ? '官方註明這張卡只有英文版的文字不同，中文卡不受影響。'
                    : '官方明說勘誤文字取代印刷文字。這些更正不會印在再版或在地化的卡片上，所以你手上的實體卡（含繁中版）看到的仍是舊文字。'}
                </p>
                <p className="mt-1 text-[0.7rem] text-amber-200/45">
                  依據 {ERRATA_VERSION.published} 版{' '}
                  <a
                    href={ERRATA_VERSION.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-200"
                  >
                    官方勘誤表
                  </a>
                </p>
              </div>
            )}

            {/* 誠實標示：繁中能力文字目前是簡轉繁，不是官方在地化用詞 */}
            {converted && (
              <p className="mt-2 rounded border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs text-ink-faint">
                {strings.convertedNotice}
              </p>
            )}
          </section>

          {flavor && (
            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-dim uppercase">
                {strings.flavorText}
              </h2>
              <p className="text-sm text-ink-dim italic">{flavor}</p>
            </section>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 border-t border-line pt-5 text-sm">
            <dt className="text-ink-faint">{strings.domain}</dt>
            <dd>
              <DomainBadges domains={card.domains} lang={lang} />
            </dd>

            <dt className="text-ink-faint">{strings.set}</dt>
            <dd className="text-ink-dim">
              {SET_LABELS[card.set][lang]}
              {lang !== 'en' && <span className="ml-1.5 text-ink-faint">{SET_LABELS[card.set].en}</span>}
            </dd>

            {card.tags.length > 0 && (
              <>
                <dt className="text-ink-faint">{strings.tags}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {card.tags.map((tag) => {
                    const entry = TAXONOMY.tagLabels[tag];
                    const label =
                      lang === 'en' || !entry ? tag : lang === 'zh-TW' ? entry.tw : entry.cn;
                    const href = `/cards?tag=${encodeURIComponent(tag)}${
                      langQuery === '' ? '' : `&${langQuery}`
                    }`;
                    return (
                      <Link
                        key={tag}
                        href={href}
                        title={lang === 'en' ? undefined : tag}
                        className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft"
                      >
                        {label}
                      </Link>
                    );
                  })}
                </dd>
              </>
            )}

            {card.artists.length > 0 && (
              <>
                <dt className="text-ink-faint">{strings.artist}</dt>
                <dd className="text-ink-dim">{card.artists.join('、')}</dd>
              </>
            )}
          </dl>

          {variants.length > 0 && (
            <section className="border-t border-line pt-5">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-ink-dim uppercase">
                {strings.otherVersions(variants.length)}
              </h2>
              <ul className="flex flex-wrap gap-3">
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <Link
                      href={withLang(`/cards/${variant.id}`)}
                      className="block w-24 transition-transform hover:-translate-y-0.5"
                    >
                      <img
                        src={cardImageUrl(variant, 200, resolveArtLang(variant, art))}
                        alt={cardImageAlt(variant, lang, resolveArtLang(variant, art))}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full rounded border border-line"
                      />
                      <span className="mt-1 block font-mono text-[0.65rem] text-ink-faint">
                        {variant.code}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
