'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 導覽列的連結 —— 目前所在的頁面會以金色底線標出來。
 *
 * 版面（layout）是伺服器端元件，拿不到目前的網址路徑，
 * 所以這一小段拆成客戶端元件，用 usePathname 判斷。
 */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`border-b-2 pb-0.5 text-sm transition-colors ${
              active
                ? 'border-accent text-accent-soft'
                : 'border-transparent text-ink-dim hover:text-accent-soft'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
