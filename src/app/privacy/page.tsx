import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { PRIVACY } from '@/lib/legal-content';
import { readTextLang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: '隱私權政策 Privacy Policy',
  description: '守夜圖鑑（Ashvigil）的隱私權政策：不收集個人資料、不用 cookie、不做追蹤，資料只存在你的瀏覽器。',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PrivacyPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.lang;
  const lang = readTextLang({ lang: Array.isArray(raw) ? raw[0] : raw });
  return <LegalPage doc={PRIVACY} lang={lang} />;
}
