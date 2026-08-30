import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OddsCalculator } from '@/components/OddsCalculator';
import { ALL_CARDS } from '@/lib/cards';

export const metadata: Metadata = {
  title: '機率計算',
  description:
    '符文戰場抽牌機率計算：用超幾何分布精確算出開局抽到關鍵牌的機率、逐回合抽到機率，以及依官方資源規則推算的牌組順暢度。',
};

export default function OddsPage() {
  return (
    // OddsCalculator 會讀取網址參數，需要一層 Suspense。
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1100px] px-4 py-16 text-sm text-ink-dim sm:px-6">
          載入機率計算…
        </div>
      }
    >
      <OddsCalculator cards={ALL_CARDS} />
    </Suspense>
  );
}
