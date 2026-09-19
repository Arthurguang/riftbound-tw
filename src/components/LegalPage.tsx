import { CONTACT_URL } from '@/lib/site';
import { LEGAL_STRINGS, LEGAL_UPDATED, type LegalDoc } from '@/lib/legal-content';
import type { TextLang } from '@/lib/i18n';

/**
 * 使用條款與隱私權政策共用的版面。
 *
 * 內容全部是純文字（legal-content.ts），這裡只負責排版 ——
 * 兩份文件長得一樣，改版時只要改一個地方。
 */
export function LegalPage({ doc, lang }: { doc: LegalDoc; lang: TextLang }) {
  return (
    <article className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {doc.title[lang]}
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          {LEGAL_STRINGS.updated[lang]}：<time dateTime={LEGAL_UPDATED}>{LEGAL_UPDATED}</time>
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-dim">{doc.intro[lang]}</p>
      </header>

      <div className="space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading.en}>
            <h2 className="text-lg font-semibold text-ink">{section.heading[lang]}</h2>
            <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-dim">
              {section.body.map((paragraph) => (
                <p key={paragraph.en}>{paragraph[lang]}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8">
        <a
          href={CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-link"
          className="inline-block rounded-lg border border-accent/50 px-4 py-2 text-sm text-accent-soft hover:bg-accent/10"
        >
          {LEGAL_STRINGS.contactLink[lang]}
        </a>
      </p>
    </article>
  );
}
