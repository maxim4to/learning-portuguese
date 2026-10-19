import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PageSkeleton } from '@/components/EmptyState'
import { AuthProvider, RepositoryProvider } from '@/data'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DiagnosticPage } from '@/features/diagnostic/DiagnosticPage'
import { TopicPage } from '@/features/lessons/TopicPage'
import { CheatsheetPage } from '@/features/library/CheatsheetPage'
import { LibraryPage } from '@/features/library/LibraryPage'
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
                  <Route path="situations" element={<SituationsPage />} />
                  <Route path="situation/:id" element={<SituationPage />} />
                  <Route path="library" element={<LibraryPage />} />
                  <Route path="library/cheatsheet/:id" element={<CheatsheetPage />} />
                  <Route path="library/vocab/:id" element={<VocabThemePage />} />
                  <Route path="library/reading/:id" element={<ReadingPage />} />
                  <Route path="tutor" element={<TutorHubPage />} />
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
