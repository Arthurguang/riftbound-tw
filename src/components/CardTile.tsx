import Link from 'next/link';
import { cardImageAlt, cardImageUrl, cardName, cardSubtitle, resolveArtLang } from '@/lib/cards';
import { bannedEntryFor } from '@/lib/ban-list';
import { DomainDot } from './CardBadges';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 圖鑑列表中的單張卡片。
 *
 * 圖片刻意使用原生 <img> 而非 next/image：
 *   1. 兩個官方 CDN 都支援即時轉檔，不需要再經過一層最佳化代理。
 *   2. 少一層代理 = 少一個攻擊面，也不會把使用者的請求繞經我們的伺服器。
 *   3. referrerPolicy="no-referrer" 讓 CDN 拿不到使用者從哪一頁點過來的。
 */
export function CardTile({
  card,
  lang,
  art,
  href,
}: {
  card: Card;
  lang: TextLang;
  art: ArtLang;
  href: string;
}) {
  const isLandscape = card.orientation === 'landscape';
  const name = cardName(card, lang);
  const subtitle = cardSubtitle(card, lang);
  // 這張卡若沒有簡中卡面，會自動退回英文卡面。
  const shownArt = resolveArtLang(card, art);
  /*
   * 只標 1v1 構築的禁卡。
   *
   * 官方卡圖上其實已經烙了英文 BANNED，但在縮圖尺寸下幾乎看不清楚，
   * 所以還是自己標一個。
   *
   * 只在 2v2 被禁的卡**刻意不標** —— 縮圖上沒有空間解釋「哪個賽制」，
   * 標一個「禁」會害使用者以為 1v1 不能用。細節留給詳細頁講。
   */
  const banned = bannedEntryFor(card, 'constructed');

  return (
    <Link
      href={href}
      className="group block rounded-lg outline-offset-4 transition-transform duration-150 hover:-translate-y-1"
    >
      <div
        className={`relative overflow-hidden rounded-lg border border-line bg-surface-1 ${
          isLandscape ? 'card-frame--landscape' : 'card-frame--portrait'
        }`}
      >
        <img
          // key 讓切換卡面語言時強制換圖，而不是沿用舊的快取節點
          key={shownArt}
          src={cardImageUrl(card, 420, shownArt)}
          alt={cardImageAlt(card, lang, shownArt)}
          width={card.image.width}
          height={card.image.height}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        {banned && (
          <span
            className="absolute top-1.5 right-1.5 rounded bg-rose-600/90 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white shadow"
            title={`正式賽事構築禁用（官方列為「${banned.official}」）`}
            data-testid="tile-ban"
          >
            賽事禁用
          </span>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink group-hover:text-accent-soft">
            {name}
            {subtitle && <span className="ml-1 text-ink-faint">{subtitle}</span>}
          </span>
          <span className="shrink-0 font-mono text-[0.7rem] text-ink-faint">
            {card.set}-{String(card.number).padStart(3, '0')}
            {card.variant ?? ''}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          {card.domains.map((domain) => (
            <DomainDot key={domain} domain={domain} />
          ))}
          <span className="ml-1 truncate text-[0.7rem] text-ink-faint">
            {card.energy !== null && `${card.energy}`}
            {card.energy !== null && card.might !== null && ' · '}
            {card.might !== null && `${card.might}`}
          </span>
        </div>
      </div>
    </Link>
  );
}
