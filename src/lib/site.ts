/**
 * 本站的正式網址。
 *
 * 2026-09-15 起使用自己的網域 ashvigil.com（在 Porkbun 註冊，DNS 指向 Vercel）。
 * 裸網域 ashvigil.com 由 Vercel 轉到 www —— 那一段設定在 Vercel 後台；
 * 舊的 vercel.app 網址則由 next.config.ts 的 redirects() 轉過來。
 */
export const SITE_ORIGIN = 'https://www.ashvigil.com';

/**
 * 聯絡管道：GitHub Issues。
 *
 * 刻意不用 email：ashvigil.com 設了 null MX ＋ SPF -all ＋ DMARC reject
 * （防止別人冒用網域寄信），所以這個網域不收信；也不公開站長的個人信箱。
 * GitHub Issues 是公開的，條款與隱私權頁都有提醒不要在上面留個人資料。
 */
export const CONTACT_URL = 'https://github.com/Arthurguang/riftbound-tw/issues';

/** 原始碼。條款頁說明「程式碼公開」時連到這裡。 */
export const SOURCE_URL = 'https://github.com/Arthurguang/riftbound-tw';
