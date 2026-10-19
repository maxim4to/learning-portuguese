import { useEffect, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { listReadingTexts, listSituations, listVocabThemes } from '@/content'
import { SubNav } from '@/components/SubNav'
import { listParsedCheatsheets } from '@/features/library/cheatsheets'
import { PRACTICE_LABEL as LABEL, practicePath, type PracticeSection } from './paths'

const ORDER: PracticeSection[] = ['situations', 'cheatsheets', 'vocab', 'reading', 'tutor']

/** Counts for the sub-navigation (content is bundled, so this is synchronous and cheap). */
function counts(): Partial<Record<PracticeSection, number>> {
  return {
    situations: listSituations().length,
    cheatsheets: listParsedCheatsheets().length,
    vocab: listVocabThemes().length,
    reading: listReadingTexts().length,
  }
}

/**
 * Start of every «Практика» index page: the section title, the second-level navigation between its
 * sub-sections (route links, quiet underline row), then the sub-section's own lead (description, counts)
 * and optional controls (level filter). The sub-section name is the h2 the content hangs from.
 */
export function PracticeHeader({
  section,
  lead,
  children,
}: {
  section: PracticeSection
  /** One or two sentences about the sub-section. */
  lead: ReactNode
  /** Counts line / filters under the lead. */
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `${LABEL[section]} · Практика — Learning Portuguese`
    return () => {
      document.title = 'Learning Portuguese'
    }
  }, [section])
  const n = counts()
  return (
    <header className="space-y-5">
      <h1>Практика</h1>
      <SubNav
        label="Разделы практики"
        active={section}
        items={ORDER.map((s) => ({
          value: s,
          to: practicePath(s),
          label:
            s === 'tutor' ? (
              <>
                <Sparkles aria-hidden className="size-4 text-terracotta" />
                {LABEL[s]}
              </>
            ) : (
              LABEL[s]
            ),
          meta: n[s] || undefined,
        }))}
      />
      <div className="space-y-4 pt-1">
        <div className="space-y-1">
          <div className="measure text-ink-muted">{lead}</div>
        </div>
        {children}
      </div>
    </header>
  )
}
