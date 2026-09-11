'use client';

import { RuneWheel } from './RuneWheel';
import { DOMAIN_SHORT, playDomains, RING, type PlayDomain } from '@/lib/runeterra-core';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 牌組編輯器的「陣營」：選好傳奇之後，陣圖亮起它的兩個領域。
 *
 * 這不是新規則，是把既有的合法性檢查（103.1.b：卡片的特性要符合傳奇）
 * 畫成一眼看得懂的圖 —— 其餘四個領域熄滅，就是「這副牌不能放」。
 */
export function LegendIdentity({ legend, lang }: { legend: Card; lang: TextLang }) {
  const domains = playDomains(legend);
  if (domains.length !== 2) return null;
  const [a, b] = domains as [PlayDomain, PlayDomain];

  const labels = Object.fromEntries(RING.map((d) => [d, DOMAIN_SHORT[d][lang]])) as Record<
    PlayDomain,
    string
  >;

  return (
    <div className="mt-2 flex items-center gap-3" data-testid="legend-identity">
      <RuneWheel
        size={150}
        labels={labels}
        lit={new Set([a, b])}
        highlight={[a, b]}
        ariaLabel={`陣營：${DOMAIN_SHORT[a][lang]}與${DOMAIN_SHORT[b][lang]}`}
        className="h-[120px] w-[120px] shrink-0"
      />
      <p className="text-xs leading-relaxed text-ink-dim">
        這副牌只能放
        <span className={`mx-0.5 font-semibold text-domain--${a}`}>{DOMAIN_SHORT[a][lang]}</span>、
        <span className={`mx-0.5 font-semibold text-domain--${b}`}>{DOMAIN_SHORT[b][lang]}</span>
        與無特性的卡
        <span
          className="ml-1 rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-ink-faint"
          title="官方核心規則條號"
        >
          103.1.b
        </span>
      </p>
    </div>
  );
}
