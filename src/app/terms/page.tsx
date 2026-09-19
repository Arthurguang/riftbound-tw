import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { TERMS } from '@/lib/legal-content';
import { readTextLang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: '使用條款 Terms of Service',
  description: '守夜圖鑑（Ashvigil）的使用條款：非商業同人專案、內容正確性、智慧財產權與聯絡方式。',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TermsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.lang;
  const lang = readTextLang({ lang: Array.isArray(raw) ? raw[0] : raw });
  return <LegalPage doc={TERMS} lang={lang} />;
}
