import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PageSkeleton } from '@/components/EmptyState'
import { AuthProvider, RepositoryProvider } from '@/data'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CheatsheetsPage } from '@/features/practice/CheatsheetsPage'
import { cheatsheetHref, practicePath, readingHref, situationHref, vocabHref } from '@/features/practice/paths'
import { ReadingIndexPage } from '@/features/practice/ReadingIndexPage'
import { RedirectTo } from '@/features/practice/redirects'
import { VocabIndexPage } from '@/features/practice/VocabIndexPage'
import { DiagnosticPage } from '@/features/diagnostic/DiagnosticPage'
import { TopicPage } from '@/features/lessons/TopicPage'
import { CheatsheetPage } from '@/features/library/CheatsheetPage'
import { ReadingPage } from '@/features/library/ReadingPage'
import { VocabThemePage } from '@/features/library/VocabThemePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { SituationPage } from '@/features/situations/SituationPage'
import { SituationsPage } from '@/features/situations/SituationsPage'
import { ReviewPage } from '@/features/srs/ReviewPage'
import { SyllabusPage } from '@/features/syllabus/SyllabusPage'
import { TutorHubPage } from '@/features/tutor/TutorHubPage'
import { WordsProvider } from '@/features/words/WordsProvider'
import { AuthGate } from './AuthGate'
import { Layout } from './Layout'
import { NotFoundPage } from './NotFoundPage'

// «Мой словарь» is loaded on demand (keeps the main chunk small).
const WordsPage = lazy(() => import('@/features/words/WordsPage').then((m) => ({ default: m.WordsPage })))
const WordPage = lazy(() => import('@/features/words/WordPage').then((m) => ({ default: m.WordPage })))
const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton cards={2} />}>{el}</Suspense>

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AuthGate>
          <RepositoryProvider>
            <WordsProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="syllabus" element={<SyllabusPage />} />
                  <Route path="topic/:id" element={<TopicPage />} />
                  <Route path="diagnostic" element={<DiagnosticPage />} />
                  <Route path="review" element={<ReviewPage />} />
                  <Route path="words" element={page(<WordsPage />)} />
                  <Route path="words/:id" element={page(<WordPage />)} />
                  {/* «Практика»: five sub-sections, each an index + its detail pages. */}
                  <Route path="practice">
                    <Route index element={<Navigate replace to={practicePath('situations')} />} />
                    <Route path="situations" element={<SituationsPage />} />
                    <Route path="situations/:id" element={<SituationPage />} />
                    <Route path="cheatsheets" element={<CheatsheetsPage />} />
                    <Route path="cheatsheets/:id" element={<CheatsheetPage />} />
                    <Route path="vocab" element={<VocabIndexPage />} />
                    <Route path="vocab/:id" element={<VocabThemePage />} />
                    <Route path="reading" element={<ReadingIndexPage />} />
                    <Route path="reading/:id" element={<ReadingPage />} />
                    <Route path="tutor" element={<TutorHubPage />} />
                  </Route>
                  {/* Old URLs (saved words and cards keep links to them). */}
                  <Route path="situations" element={<RedirectTo to={() => practicePath('situations')} />} />
                  <Route path="situation/:id" element={<RedirectTo to={(p) => situationHref(p.id ?? '')} />} />
                  <Route path="library" element={<RedirectTo to={() => practicePath('cheatsheets')} />} />
                  <Route path="library/cheatsheet/:id" element={<RedirectTo to={(p) => cheatsheetHref(p.id ?? '')} />} />
                  <Route path="library/vocab/:id" element={<RedirectTo to={(p) => vocabHref(p.id ?? '')} />} />
                  <Route path="library/reading/:id" element={<RedirectTo to={(p) => readingHref(p.id ?? '')} />} />
                  <Route path="tutor" element={<RedirectTo to={() => practicePath('tutor')} />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </WordsProvider>
          </RepositoryProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  )
}
