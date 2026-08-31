import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ReplayBoard } from '@/components/ReplayBoard';
import { ALL_CARDS } from '@/lib/cards';

export const metadata: Metadata = {
  title: '對局復盤',
  description:
    '符文戰場對局復盤板：擺出當下的手牌、場上與廢牌堆，從這個局面算出牌堆剩餘、抽牌機率與可施放的卡。盤面編在網址裡，可直接分享。',
};

export default function ReplayPage() {
  return (
    // ReplayBoard 會讀取網址參數，需要一層 Suspense。
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1500px] px-4 py-16 text-sm text-ink-dim sm:px-6">
          載入復盤板…
        </div>
      }
    >
      <ReplayBoard cards={ALL_CARDS} />
    </Suspense>
  );
}
