import { useEffect, useState } from 'react'
import { HashRouter, Outlet, Route, Routes } from 'react-router-dom'
import { getApiHealth, getBootstrap } from './api'
import { copy, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from './data'
import { AssessmentLayout, PublicLayout, RecruiterFreeLayout, RecruiterLayout } from './layouts'
import {
  AssessmentEntryPage,
  ContactPage,
  FaqPage,
  ProcessPage,
  PublicHome,
  PublicJobDetail,
  PublicJobs,
} from './pages/PublicPages'
import {
  AssessmentReview,
  CandidateWorkspace,
  MatchingWorkspace,
  RecruiterDashboard,
  RecruiterJobDetail,
  RecruiterJobs,
  RecruiterLogin,
} from './pages/RecruiterPages'
import {
  CandidateEntryPage,
  CompletionPage,
  ConfirmInfoPage,
  ConsentPage,
  DataTaskPage,
  DeviceCheckPage,
  InvitationPage,
  JapaneseQaPage,
  ReadingAloudPage,
  SubmitPage,
  TypingPage,
} from './pages/CandidatePages'

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE)
  const [apiError, setApiError] = useState('')
  const t = copy[language]

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  useEffect(() => {
    getApiHealth()
      .then(() => setApiError(''))
      .catch((error) => setApiError(error.message || 'Backend unavailable.'))
  }, [])

  useEffect(() => {
    if (localStorage.getItem(LANGUAGE_STORAGE_KEY)) return
    getBootstrap()
      .then((bootstrap) => {
        if (bootstrap.defaultLanguage) {
          setLanguage(bootstrap.defaultLanguage)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <PublicHome language={language} />
            </PublicLayout>
          )}
        />
        <Route
          path="/jobs"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <PublicJobs />
            </PublicLayout>
          )}
        />
        <Route
          path="/jobs/:jobId"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <PublicJobDetail />
            </PublicLayout>
          )}
        />
        <Route
          path="/process"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <ProcessPage language={language} />
            </PublicLayout>
          )}
        />
        <Route
          path="/faq"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <FaqPage />
            </PublicLayout>
          )}
        />
        <Route
          path="/contact"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <ContactPage />
            </PublicLayout>
          )}
        />
        <Route
          path="/assessment-entry"
          element={(
            <PublicLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <AssessmentEntryPage language={language} />
            </PublicLayout>
          )}
        />

        <Route
          path="/recruiter/login"
          element={(
            <RecruiterFreeLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <RecruiterLogin title={t.loginTitle} body={t.loginBody} />
            </RecruiterFreeLayout>
          )}
        />
        <Route
          path="/recruiter/dashboard"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <RecruiterDashboard />
            </RecruiterLayout>
          )}
        />
        <Route
          path="/recruiter/jobs"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <RecruiterJobs />
            </RecruiterLayout>
          )}
        />
        <Route
          path="/recruiter/jobs/:jobId"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <RecruiterJobDetail />
            </RecruiterLayout>
          )}
        />
        <Route
          path="/recruiter/candidates/:candidateId"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <CandidateWorkspace />
            </RecruiterLayout>
          )}
        />
        <Route
          path="/recruiter/matching/:candidateId"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <MatchingWorkspace />
            </RecruiterLayout>
          )}
        />
        <Route
          path="/recruiter/review/:attemptId"
          element={(
            <RecruiterLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <AssessmentReview />
            </RecruiterLayout>
          )}
        />

        <Route
          path="/candidate"
          element={(
            <AssessmentLayout language={language} setLanguage={setLanguage} apiError={apiError}>
              <Outlet />
            </AssessmentLayout>
          )}
        >
          <Route index element={<CandidateEntryPage language={language} />} />
          <Route path="invitation" element={<InvitationPage language={language} />} />
          <Route path="device-check" element={<DeviceCheckPage language={language} />} />
          <Route path="consent" element={<ConsentPage language={language} />} />
          <Route path="confirm-info" element={<ConfirmInfoPage language={language} />} />
          <Route path="japanese-qa" element={<JapaneseQaPage language={language} />} />
          <Route path="reading-aloud" element={<ReadingAloudPage language={language} />} />
          <Route path="typing" element={<TypingPage language={language} />} />
          <Route path="data-task" element={<DataTaskPage language={language} />} />
          <Route path="submit" element={<SubmitPage language={language} />} />
          <Route path="completion" element={<CompletionPage language={language} />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
