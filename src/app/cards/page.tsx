import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CardGallery } from '@/components/CardGallery';
import { ALL_CARDS, TAXONOMY } from '@/lib/cards';

export const metadata: Metadata = {
  title: '卡牌圖鑑',
  description:
    '符文戰場起源系列（Origins）與試煉場（Proving Grounds）完整卡牌圖鑑，支援繁中／简中／英文三語切換與多條件篩選。',
};

export default function CardsPage() {
  return (
    // CardGallery 會讀取網址參數，需要一層 Suspense 才能在建置時預先產生頁面。
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1400px] px-4 py-16 text-sm text-ink-dim sm:px-6">
          載入卡牌資料…
        </div>
      }
    >
      <CardGallery cards={ALL_CARDS} taxonomy={TAXONOMY} />
    </Suspense>
  );
}
