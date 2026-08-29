import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-ink">找不到這個頁面</h1>
      <p className="mt-2 text-sm text-ink-dim">
        這張卡片可能不存在，或是網址打錯了。
      </p>
      <Link
        href="/cards"
        className="mt-8 inline-block rounded-lg border border-line px-5 py-2.5 text-sm text-ink-dim transition-colors hover:border-surface-3 hover:text-ink"
      >
        回到卡牌圖鑑
      </Link>
    </div>
  );
}
