import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DeckBuilder } from '@/components/DeckBuilder';
import { ALL_CARDS, TAXONOMY } from '@/lib/cards';

export const metadata: Metadata = {
  title: '牌組編輯器',
  description:
    '符文戰場牌組編輯器：依官方核心規則即時檢查構築合法性、記錄收藏與缺卡清單，並可匯出成網址、文字、CSV、PDF 或圖片。無需註冊，資料不離開你的瀏覽器。',
};

export default function DeckPage() {
  return (
    // DeckBuilder 會讀取網址參數，需要一層 Suspense。
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1400px] px-4 py-16 text-sm text-ink-dim sm:px-6">
          載入牌組編輯器…
        </div>
      }
    >
      <DeckBuilder cards={ALL_CARDS} taxonomy={TAXONOMY} />
    </Suspense>
  );
}
