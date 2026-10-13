import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Scoreboard } from '@/components/Scoreboard';

export const metadata: Metadata = {
  title: '計分板',
  description:
    '符文戰場實體對戰用的手機計分板：雙方加減分、回合計數、對坐模式與螢幕不休眠。分數只留在你的瀏覽器裡，不需要帳號。',
};

export default function ScorePage() {
  return (
    // Scoreboard 會讀取網址的語言參數，需要一層 Suspense。
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[900px] px-4 py-16 text-sm text-ink-dim sm:px-6">
          載入計分板…
        </div>
      }
    >
      <Scoreboard />
    </Suspense>
  );
}
