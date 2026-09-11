import Link from 'next/link';
import { DomainBadges } from '@/components/CardBadges';
import { CardText } from '@/components/CardText';
import { HeroShowcase, type ShowcaseLegend } from '@/components/HeroShowcase';
import { LegendRoster, type LegendView } from '@/components/LegendRoster';
import {
  ALL_CARDS,
  TAXONOMY,
  cardImageUrl,
  cardName,
  cardSubtitle,
  cardText,
} from '@/lib/cards';
import { SET_LABELS, TYPE_LABELS } from '@/lib/labels';
import { readArtLang, readTextLang, t, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import { playDomains } from '@/lib/runeterra-core';
import { allLegends, championTagOf, regionOfChampion, tagLabel } from '@/lib/runeterra';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const INTRO = {
  'zh-TW': {
    body: '查詢符文戰場的卡牌資料，支援繁體中文、简体中文與英文三語切換，卡面也能在英文與简中之間切換。搜尋可跨語言比對——打「阿璃」「阿狸」或「Ahri」都找得到同一張卡。',
    enter: '進入卡牌圖鑑',
    browseLegends: '瀏覽所有傳奇',
    contents: '收錄內容',
    aboutTitle: '關於這個網站',
    about: [
      '卡牌資料在網站建置時就從官方來源抓取並打包成靜態檔案，網站運作期間不會向任何外部服務發出請求，也不會蒐集使用者資料。全站沒有帳號系統、沒有 cookie、沒有第三方追蹤腳本。',
      '接下來預計加入規則說明與關鍵字辭典、牌組編輯器、抽牌機率計算器等功能。',
    ],
  },
  'zh-CN': {
    body: '查询符文战场的卡牌资料，支持繁体中文、简体中文与英文三语切换，卡面也能在英文与简中之间切换。搜索可跨语言比对——输入「阿狸」或「Ahri」都能找到同一张卡。',
    enter: '进入卡牌图鉴',
    browseLegends: '浏览所有传奇',
    contents: '收录内容',
    aboutTitle: '关于这个网站',
    about: [
      '卡牌资料在网站构建时就从官方来源抓取并打包成静态文件，网站运行期间不会向任何外部服务发出请求，也不会收集用户资料。全站没有账号系统、没有 cookie、没有第三方追踪脚本。',
      '接下来计划加入规则说明与关键字词典、卡组编辑器、抽卡概率计算器等功能。',
    ],
  },
  en: {
    body: 'Browse Riftbound card data in Traditional Chinese, Simplified Chinese, or English. Card art can be switched between the English and Simplified Chinese printings. Search matches across all three languages.',
    enter: 'Open card gallery',
    browseLegends: 'Browse all Legends',
    contents: 'Contents',
    aboutTitle: 'About this site',
    about: [
      'Card data is fetched from official sources at build time and bundled as static files. The site makes no external requests at runtime and collects no user data. There are no accounts, no cookies, and no third-party tracking scripts.',
      'Planned next: rules reference and keyword glossary, a deck builder, and a draw-probability calculator.',
    ],
  },
} as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const lang = readTextLang({ lang: first(params.lang) });
  const art = readArtLang({ art: first(params.art) });
  const strings = t(lang);
  const intro = INTRO[lang];

  const langQuery = lang === DEFAULT_TEXT_LANG ? '' : `lang=${lang}`;
  const withLang = (path: string, extra = '') => {
    const qs = [extra, langQuery].filter(Boolean).join('&');
    return qs === '' ? path : `${path}?${qs}`;
  };

  const typeCounts = TAXONOMY.types.map((type) => ({
    type,
    count: ALL_CARDS.filter((card) => card.types.includes(type)).length,
  }));

  /*
   * 傳奇的資料都在伺服器端算好，只把畫面要用的幾個欄位傳給瀏覽器 ——
   * 不把整份卡牌資料送進首頁的客戶端程式。
   */
  const legendCards = allLegends(ALL_CARDS);
  const legends: LegendView[] = legendCards.flatMap((card) => {
    const [a, b] = playDomains(card);
    if (!a || !b) return [];
    const champion = championTagOf(card);
    const region = champion ? regionOfChampion(ALL_CARDS, champion) : null;
    return [
      {
        id: card.id,
        name: champion ? tagLabel(champion, lang) : cardName(card, lang),
        title: cardName(card, lang),
        setLabel: SET_LABELS[card.set][lang],
        region: region ? tagLabel(region, lang) : null,
        domains: [a, b],
        image: cardImageUrl(card, 300, art),
        href: withLang(`/cards/${card.id}`),
      },
    ];
  });

  /*
   * 展示台的說明視窗要顯示能力文字。CardText 會用到卡牌資料，
   * 所以在伺服器端先渲染好（details），瀏覽器只收到渲染結果。
   */
  const showcase: ShowcaseLegend[] = legendCards.map((card) => {
    const champion = championTagOf(card);
    return {
      id: card.id,
      name: champion ? tagLabel(champion, lang) : cardName(card, lang),
      title: cardName(card, lang),
      subtitle: cardSubtitle(card, lang),
      image: cardImageUrl(card, 300, art),
      largeImage: cardImageUrl(card, 600, art),
      href: withLang(`/cards/${card.id}`),
      details: (
        <div className="space-y-3">
          <DomainBadges domains={card.domains} lang={lang} />
          <CardText blocks={cardText(card, lang)} lang={lang} />
        </div>
      ),
    };
  });

  /*
   * 字級只用三層（NN/g：一個畫面最多三種大小、三種對比）：
   *   標題（h1 / 區段 h2）· 內文 · 輔助小字
   * 統計數字刻意放大，讓它自己成為視覺重點，標籤退到輔助層。
   */
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      {/*
        overflow-x-clip：展示台的轉盤比欄位寬，兩側靠遮罩淡出；
        clip 只裁左右、不產生捲動區，上下的光暈照常，也不會在筆電上撐出橫向捲軸。
      */}
      <section className="grid items-center gap-10 overflow-x-clip border-b border-surface-2 py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:py-20">
        <div className="flex flex-col gap-5">
          <p className="text-xs font-bold tracking-[0.28em] text-arcane uppercase">
            {strings.siteTagline}
          </p>
          <h1 className="text-5xl leading-tight font-bold tracking-wide text-ink sm:text-6xl">
            {strings.siteName}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-dim">{intro.body}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={withLang('/cards')}
              className="rounded-lg bg-accent px-6 py-3 text-base font-semibold text-surface shadow-[0_0_28px_-8px_rgba(216,178,63,0.7)] transition-colors hover:bg-accent-soft"
            >
              {intro.enter}
            </Link>
            <Link
              href={withLang('/cards', 'type=legend')}
              className="rounded-lg bg-surface-1/80 px-6 py-3 text-base text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {intro.browseLegends}
            </Link>
          </div>
        </div>
        <HeroShowcase lang={lang} legends={showcase} />
      </section>

      <LegendRoster lang={lang} legends={legends} />

      <section className="border-t border-surface-2 py-14">
        <h2 className="text-3xl font-bold text-ink">{intro.contents}</h2>
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TAXONOMY.sets.map((set) => (
            <div key={set.id} className="rounded-xl bg-surface-1/80 p-5">
              <dt className="text-sm text-ink-faint">
                {SET_LABELS[set.id][lang]}
                {lang !== 'en' && <span className="ml-1">{SET_LABELS[set.id].en}</span>}
              </dt>
              <dd className="mt-2 text-4xl font-bold text-ink">{set.count}</dd>
            </div>
          ))}
        </dl>

        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {typeCounts.map(({ type, count }) => (
            <li key={type}>
              <Link
                href={withLang('/cards', `type=${type}`)}
                className="block rounded-xl bg-surface-1/60 p-5 transition-colors hover:bg-surface-2"
              >
                <span className="text-sm text-ink-faint">{TYPE_LABELS[type][lang]}</span>
                <span className="mt-2 block text-3xl font-bold text-ink">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-2xl pb-6">
        <h2 className="text-3xl font-bold text-ink">{intro.aboutTitle}</h2>
        <div className="mt-4 space-y-3 text-base leading-relaxed text-ink-dim">
          {intro.about.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
