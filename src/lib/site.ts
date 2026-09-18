/**
 * 本站的正式網址。
 *
 * 2026-09-15 起使用自己的網域 ashvigil.com（在 Porkbun 註冊，DNS 指向 Vercel）。
 * 裸網域 ashvigil.com 由 Vercel 轉到 www —— 那一段設定在 Vercel 後台；
 * 舊的 vercel.app 網址則由 next.config.ts 的 redirects() 轉過來。
 */
export const SITE_ORIGIN = 'https://www.ashvigil.com';
