import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BrandLockup, LanguageSwitcher } from './components'
import { assessmentSteps, copy } from './data'
import { AssessmentProvider, useAssessment } from './context/AssessmentContext'

function stepIndexFromPath(pathname) {
  const found = assessmentSteps.findIndex((step) => step.to === pathname)
  return found < 0 ? 0 : found
}

function stepOrderIndex(stepKey) {
  const index = assessmentSteps.findIndex((step) => step.key === stepKey)
  return index < 0 ? 0 : index
}

export function PublicLayout({ children, language, setLanguage, apiError = '' }) {
  const t = copy[language]

  return (
    <div className="app-shell">
      <header className="public-header">
        <BrandLockup title={t.brandName} subtitle={t.brandSub} to="/" />
        <nav className="public-nav">
          {t.publicNav.map((item) => (
            <NavLink key={item.to} className="nav-link" to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
          <Link className="ghost-button" to="/recruiter/login">
            HR Portal
          </Link>
          <Link className="primary-button" to="/assessment-entry">
            {t.ctaAssessment}
          </Link>
        </div>
      </header>
      <main className="page-content public-page">{children}</main>
      {apiError ? <div className="global-api-warning">{apiError}</div> : null}
      <footer className="site-footer">
        <div>
          <div className="footer-title">Altius Link</div>
          <div className="footer-note">{t.footerTag}</div>
        </div>
        <div className="footer-links">
          <Link to="/jobs">Jobs</Link>
          <Link to="/process">Process</Link>
          <Link to="/assessment-entry">Assessment Entry</Link>
        </div>
      </footer>
    </div>
  )
}

export function RecruiterFreeLayout({ children, language, setLanguage, apiError = '' }) {
  const t = copy[language]

  return (
    <div className="simple-shell">
      <div className="free-header">
        <BrandLockup title={t.brandName} subtitle={t.recruiterPortalSub} to="/" />
        <LanguageSwitcher language={language} setLanguage={setLanguage} />
      </div>
      {apiError ? <div className="global-api-warning">{apiError}</div> : null}
      {children}
    </div>
  )
}

export function RecruiterLayout({ children, language, setLanguage, apiError = '' }) {
  const t = copy[language]

  return (
    <div className="recruiter-shell">
      <aside className="recruiter-sidebar">
        <BrandLockup title={t.brandName} subtitle={t.recruiterPortalSub} to="/recruiter/dashboard" />
        <div className="sidebar-section-label">Operations</div>
        <nav className="sidebar-nav">
          {t.recruiterNav.map((item) => (
            <NavLink key={item.label + item.to} className="sidebar-link" to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="profile-avatar">HR</div>
          <div>
            <div className="profile-name">Tanaka Kenji</div>
            <div className="profile-role">Senior Recruiter</div>
          </div>
        </div>
      </aside>
      <div className="recruiter-main">
        <header className="recruiter-topbar">
          <div>
            <div className="eyebrow">Internal Command Center</div>
            <div className="topbar-title">Altius Link Recruitment Operations</div>
          </div>
          <div className="header-actions">
            <div className="search-pill">Search jobs, candidates, attempt IDs</div>
            <LanguageSwitcher language={language} setLanguage={setLanguage} compact />
          </div>
        </header>
        <main className="page-content recruiter-page">{children}</main>
        {apiError ? <div className="global-api-warning">{apiError}</div> : null}
      </div>
    </div>
  )
}

function isProtectedExamStep(stepKey) {
  return ['confirm-info', 'japanese-qa', 'reading-aloud', 'typing', 'data-task', 'submit'].includes(stepKey)
}

function AssessmentShell({ children, language, setLanguage, apiError = '', location }) {
  const {
    requiredStep,
    session,
    beginProctoring,
    pushProctoringEvent,
    pushProctoringChunk,
    endProctoring,
  } = useAssessment()
  const t = copy[language]
  const currentStepKey = assessmentSteps.find((step) => step.to === location.pathname)?.key || 'entry'
  const currentIndex = stepIndexFromPath(location.pathname)
  const prev = assessmentSteps[currentIndex - 1]
  const next = assessmentSteps[currentIndex + 1]
  const isEntry = location.pathname === '/candidate'
  const proctorStarted = Boolean(session?.proctoring?.startedAt)
  const requiresProtection = Boolean(session) && isProtectedExamStep(currentStepKey) && session.submissionStatus !== 'submitted'
  const [fullscreenActive, setFullscreenActive] = useState(() => Boolean(document.fullscreenElement))
  const [starting, setStarting] = useState(false)
  const [guardError, setGuardError] = useState('')
  const [localRecording, setLocalRecording] = useState(false)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunkSequenceRef = useRef(0)
  const reportLockRef = useRef(false)
  const lastActivityAtRef = useRef(Date.now())
  const inactivityReportedAtRef = useRef(0)

  const guardVisible = requiresProtection && (!proctorStarted || !fullscreenActive || Boolean(guardError))
  const canGoNextByStep = !next || stepOrderIndex(next.key) <= stepOrderIndex(requiredStep)
  const canGoNext = canGoNextByStep && !guardVisible

  async function reportEvent(type, detail = '') {
    if (!session) return
    if (reportLockRef.current) return
    reportLockRef.current = true
    try {
      await pushProctoringEvent({ type, detail, stepKey: currentStepKey })
    } catch {
      // Best-effort event logging.
    } finally {
      setTimeout(() => { reportLockRef.current = false }, 250)
    }
  }

  async function requestFullscreenMode() {
    if (document.fullscreenElement) return
    await document.documentElement.requestFullscreen()
  }

  async function ensureStream() {
    if (streamRef.current) return streamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt không hỗ trợ quay video/ghi âm.')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    streamRef.current = stream
    return stream
  }

  async function startProctoringFlow() {
    if (!session) return
    setStarting(true)
    setGuardError('')
    try {
      await requestFullscreenMode()
      const stream = await ensureStream()
      await beginProctoring({
        stepKey: currentStepKey,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })

      if (!recorderRef.current || recorderRef.current.state === 'inactive') {
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size <= 0) return
          const nextSeq = chunkSequenceRef.current + 1
          chunkSequenceRef.current = nextSeq
          void pushProctoringChunk(event.data, nextSeq).catch(() => {})
        }
        recorder.start(8000)
        recorderRef.current = recorder
      }
      setFullscreenActive(Boolean(document.fullscreenElement))
      setLocalRecording(true)
    } catch (error) {
      setGuardError(error.message || 'Không thể bật chế độ chống gian lận.')
    } finally {
      setStarting(false)
    }
  }

  async function stopLocalRecorder(sendStop = false) {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setLocalRecording(false)
    if (sendStop && session?.proctoring?.startedAt) {
      try {
        await endProctoring({ stepKey: currentStepKey })
      } catch {
        // Best-effort stop.
      }
    }
  }

  useEffect(() => {
    function onFullscreenChange() {
      const active = Boolean(document.fullscreenElement)
      setFullscreenActive(active)
      if (!active && requiresProtection && proctorStarted) {
        setGuardError('Bạn đã thoát toàn màn hình. Vui lòng bật lại để tiếp tục.')
        void reportEvent('fullscreen_exit', 'candidate exited fullscreen')
      }
    }
    function onVisibilityChange() {
      if (document.hidden && requiresProtection && proctorStarted) {
        void reportEvent('tab_hidden', 'document.hidden true')
      }
    }
    function onWindowBlur() {
      if (requiresProtection && proctorStarted) {
        void reportEvent('window_blur', 'window blur detected')
      }
    }
    function onPasteCopy(event) {
      if (!requiresProtection) return
      event.preventDefault()
      const type = event.type === 'copy' || event.type === 'cut' ? 'copy_attempt' : 'paste_attempt'
      void reportEvent(type, `blocked ${event.type} at shell level`)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('paste', onPasteCopy)
    document.addEventListener('copy', onPasteCopy)
    document.addEventListener('cut', onPasteCopy)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('paste', onPasteCopy)
      document.removeEventListener('copy', onPasteCopy)
      document.removeEventListener('cut', onPasteCopy)
    }
  }, [proctorStarted, requiresProtection])

  useEffect(() => {
    function markActivity() {
      lastActivityAtRef.current = Date.now()
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))

    const timer = window.setInterval(() => {
      if (!requiresProtection || !proctorStarted) return
      const now = Date.now()
      const inactiveForMs = now - lastActivityAtRef.current
      if (inactiveForMs < 90000) return
      if (now - inactivityReportedAtRef.current < 90000) return
      inactivityReportedAtRef.current = now
      void reportEvent('inactivity_detected', `no activity for ${Math.round(inactiveForMs / 1000)}s`)
    }, 15000)

    return () => {
      window.clearInterval(timer)
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity))
    }
  }, [proctorStarted, requiresProtection])

  useEffect(() => {
    if (session?.submissionStatus === 'submitted') {
      void stopLocalRecorder(false)
    }
  }, [session?.submissionStatus])

  useEffect(() => {
    return () => {
      void stopLocalRecorder(false)
    }
  }, [])

  const proctorChunks = session?.proctoring?.chunks?.length || 0
  const recordingLabel = localRecording || proctorStarted
    ? `Đang ghi toàn phiên (${proctorChunks})`
    : t.recordingReady

  return (
    <div className="assessment-shell">
      <header className="assessment-header">
        <div className="assessment-brand">
          <BrandLockup title={t.brandName} subtitle={t.assessmentCenter} to="/" compact />
          <div className="assessment-progress">
            <span>Progress</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${((currentIndex + 1) / assessmentSteps.length) * 100}%` }} />
            </div>
            <span>{currentIndex + 1}/{assessmentSteps.length}</span>
          </div>
        </div>
        <div className="assessment-actions">
          <div className="recording-pill">
            <span className="recording-dot" />
            {recordingLabel}
          </div>
          <LanguageSwitcher language={language} setLanguage={setLanguage} compact />
        </div>
      </header>
      <main className="assessment-content">{children}</main>
      {apiError ? <div className="global-api-warning">{apiError}</div> : null}

      {guardVisible ? (
        <div className="fullscreen-guard-backdrop">
          <section className="fullscreen-guard-panel">
            <div className="eyebrow">Anti-Cheat Guard</div>
            <h2>Bật toàn màn hình để tiếp tục bài thi</h2>
            <p className="lead">
              Hệ thống yêu cầu ghi hình/ghi âm toàn phiên và khóa copy-paste trong suốt bài thi.
              Nếu thoát fullscreen hoặc rời tab, sự kiện sẽ được ghi nhận.
            </p>
            <div className="button-row top-gap">
              <button className="primary-button" disabled={starting} type="button" onClick={startProctoringFlow}>
                {starting ? 'Đang khởi tạo...' : proctorStarted ? 'Tiếp tục toàn màn hình' : 'Bắt đầu toàn màn hình'}
              </button>
            </div>
            {guardError ? <div className="inline-error top-gap">{guardError}</div> : null}
          </section>
        </div>
      ) : null}

      {isEntry ? null : (
        <footer className="assessment-footer">
          {prev ? <Link className="ghost-button" to={prev.to}>Previous</Link> : <span />}
          <div className="assessment-step-label">{assessmentSteps[currentIndex]?.label}</div>
          {next ? (
            <Link
              aria-disabled={!canGoNext}
              className={`primary-button ${canGoNext ? '' : 'disabled-button'}`.trim()}
              onClick={(event) => {
                if (!canGoNext) event.preventDefault()
              }}
              to={next.to}
            >
              Next
            </Link>
          ) : currentStepKey === 'completion' ? (
            <Link className="ghost-button" to="/">Finish</Link>
          ) : (
            <span />
          )}
        </footer>
      )}
    </div>
  )
}

export function AssessmentLayout({ children, language, setLanguage, apiError = '' }) {
  const location = useLocation()
  return (
    <AssessmentProvider currentPath={location.pathname} search={location.search}>
      <AssessmentShell language={language} setLanguage={setLanguage} apiError={apiError} location={location}>
        {children}
      </AssessmentShell>
    </AssessmentProvider>
  )
}
