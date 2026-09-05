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
  const lang = readTextLang({ lang: firstValue(query.lang) });
  const art = readArtLang({ art: firstValue(query.art) });
  const strings = t(lang);

  // 保留語言設定，讓頁內連結不會把使用者的選擇弄丟。
  const langParams = new URLSearchParams();
  if (lang !== DEFAULT_TEXT_LANG) langParams.set('lang', lang);
  if (art !== DEFAULT_ART_LANG) langParams.set('art', art);
  const langQuery = langParams.toString();
  const withLang = (path: string) => (langQuery === '' ? path : `${path}?${langQuery}`);

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
  const bans = banEntriesFor(card);
  const oneVsOneBanned = bans.some((b) => b.formats.includes('constructed'));
  const twNameFromCommunity = lang === 'zh-TW' && card.zh.tw?.nameSource === 'community';

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <Link
        href={withLang('/cards')}
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
