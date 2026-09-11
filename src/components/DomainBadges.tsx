'use client';

import { DOMAIN_SHORT, RING, type PlayDomain } from '@/lib/runeterra-core';
import type { TextLang } from '@/lib/i18n';

/**
 * 六個領域徽章。
 *
 * 顏色由 globals.css 的 .domain-badge--* 提供（每個 class 設定自己的 --badge 變數），
 * 不用行內 style —— 本站的 CSP 不允許 style 屬性。
 *
 * 不只靠顏色辨認：每個徽章都有文字；選取狀態同時用 aria-pressed 告訴螢幕報讀器。
 *
 * 兩種用法：
 *   · 首頁：可以點（傳入 onToggle），用來篩選傳奇
 *   · 牌組編輯器：只顯示，亮起傳奇的兩個領域，其餘變暗
 */
export function DomainBadges({
  lang,
  selected,
  onToggle,
  dimUnselected = false,
  size = 'md',
  label,
}: {
  lang: TextLang;
  selected: readonly PlayDomain[];
  onToggle?: (domain: PlayDomain) => void;
  dimUnselected?: boolean;
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2" data-domain-badges="">
      {RING.map((domain) => {
        const on = selected.includes(domain);
        const className = [
          'domain-badge',
          `domain-badge--${domain}`,
          size === 'sm' ? 'domain-badge--sm' : '',
          on ? 'is-on' : '',
          dimUnselected && !on ? 'is-dim' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return onToggle ? (
          <button
            key={domain}
            type="button"
            aria-pressed={on}
            data-domain={domain}
            onClick={() => onToggle(domain)}
            className={className}
          >
            {DOMAIN_SHORT[domain][lang]}
          </button>
        ) : (
          <span key={domain} data-domain={domain} data-lit={on ? 'true' : undefined} className={className}>
            {DOMAIN_SHORT[domain][lang]}
          </span>
        );
      })}
    </div>
  );
}
