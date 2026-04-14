/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAssessmentSession,
  reportProctoringEvent,
  saveCandidateConfirmation,
  saveConsent,
  saveDeviceCheck,
  saveSectionAnswer,
  startProctoring,
  stopProctoring,
  submitAssessment,
  uploadProctoringChunk,
  uploadSectionMedia,
} from '../api'
import { assessmentSteps, ASSESSMENT_SESSION_STORAGE_KEY } from '../data'

const ASSESSMENT_SECTION_ORDER = ['japanese-qa', 'reading-aloud', 'typing', 'data-task']

const AssessmentContext = createContext(null)

function routeForStep(stepKey) {
  return assessmentSteps.find((step) => step.key === stepKey)?.to || '/candidate'
}

function computeRequiredStep(session) {
  if (!session) return 'entry'
  if (session.submissionStatus === 'submitted') return 'completion'
  if (!session.deviceCheck?.savedAt) return 'device-check'
  if (!session.consentAccepted) return 'consent'
  const confirmation = session.candidateConfirmation || {}
  const confirmAcknowledged =
    confirmation.confirmAcknowledged === undefined ? Boolean(confirmation.savedAt) : Boolean(confirmation.confirmAcknowledged)
  if (!confirmation.savedAt || !confirmAcknowledged) return 'confirm-info'
  const nextPending = ASSESSMENT_SECTION_ORDER.find((key) => !session.sectionResults?.[key]?.completed)
  return nextPending || 'submit'
}

function getSessionIdFromSearch(search) {
  const params = new URLSearchParams(search || '')
  return params.get('session') || ''
}

export function AssessmentProvider({ children, currentPath, search }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(ASSESSMENT_SESSION_STORAGE_KEY) || '')
  const navigate = useNavigate()

  useEffect(() => {
    const searchSessionId = getSessionIdFromSearch(search)
    if (!searchSessionId || searchSessionId === sessionId) return
    setSessionId(searchSessionId)
    localStorage.setItem(ASSESSMENT_SESSION_STORAGE_KEY, searchSessionId)
  }, [search, sessionId])

  useEffect(() => {
    if (!sessionId) {
      setSession(null)
      setLoading(false)
      return
    }
    let cancelled = false

    async function refreshSession() {
      setLoading(true)
      try {
        const nextSession = await getAssessmentSession(sessionId)
        if (!cancelled) {
          setSession(nextSession)
          setError('')
        }
      } catch (requestError) {
        if (!cancelled) {
          setSession(null)
          setError(requestError.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    refreshSession()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!currentPath) return
    if (currentPath === '/candidate') return
    if (!sessionId) {
      navigate('/candidate', { replace: true })
      return
    }
    if (!session) return

    const requiredStep = computeRequiredStep(session)
    const requiredRoute = routeForStep(requiredStep)
    const currentStep = assessmentSteps.find((step) => step.to === currentPath)?.key
    if (!currentStep) return

    if (currentPath === '/candidate/completion' && requiredStep !== 'completion') {
      navigate(requiredRoute, { replace: true })
      return
    }

    if (requiredStep === 'completion' && currentPath !== '/candidate/completion') {
      navigate('/candidate/completion', { replace: true })
      return
    }

    const orderedKeys = assessmentSteps.map((step) => step.key)
    if (orderedKeys.indexOf(currentStep) > orderedKeys.indexOf(requiredStep)) {
      navigate(requiredRoute, { replace: true })
    }
  }, [currentPath, navigate, session, sessionId])

  function requireSessionId() {
    if (!sessionId) {
      throw new Error('Assessment session is missing.')
    }
    return sessionId
  }

  async function refreshSession() {
    const activeSessionId = requireSessionId()
    const nextSession = await getAssessmentSession(activeSessionId)
    setSession(nextSession)
    setError('')
    return nextSession
  }

  async function submitDevice(payload) {
    const response = await saveDeviceCheck(requireSessionId(), payload)
    setSession(response.session)
    return response
  }

  async function submitCandidateConfirmation(payload) {
    const response = await saveCandidateConfirmation(requireSessionId(), payload)
    setSession(response.session)
    return response
  }

  async function submitConsent(consentAccepted) {
    const response = await saveConsent(requireSessionId(), consentAccepted)
    setSession(response.session)
    return response
  }

  async function beginProctoring(payload = {}) {
    const response = await startProctoring(requireSessionId(), payload)
    setSession(response.session)
    return response
  }

  async function pushProctoringEvent(payload) {
    return reportProctoringEvent(requireSessionId(), payload)
  }

  async function pushProctoringChunk(chunk, sequence) {
    return uploadProctoringChunk(requireSessionId(), chunk, sequence)
  }

  async function endProctoring(payload = {}) {
    const response = await stopProctoring(requireSessionId(), payload)
    setSession(response.session)
    return response
  }

  async function submitAnswer(sectionKey, answer, options = {}) {
    const response = await saveSectionAnswer(requireSessionId(), sectionKey, answer, options)
    setSession(response.session)
    return response
  }

  async function submitMedia(sectionKey, file) {
    const response = await uploadSectionMedia(requireSessionId(), sectionKey, file)
    setSession(response.session)
    return response
  }

  async function finalizeSubmission() {
    const response = await submitAssessment(requireSessionId())
    setSession(response.session)
    return response
  }

  const value = {
    session,
    sessionId,
    loading,
    error,
    requiredStep: computeRequiredStep(session),
    setSessionId: (nextSessionId) => {
      setSessionId(nextSessionId)
      if (nextSessionId) {
        localStorage.setItem(ASSESSMENT_SESSION_STORAGE_KEY, nextSessionId)
      } else {
        localStorage.removeItem(ASSESSMENT_SESSION_STORAGE_KEY)
        setSession(null)
      }
    },
    refreshSession,
    submitDevice,
    submitConsent,
    submitCandidateConfirmation,
    submitAnswer,
    submitMedia,
    beginProctoring,
    pushProctoringEvent,
    pushProctoringChunk,
    endProctoring,
    finalizeSubmission,
  }

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>
}

export function useAssessment() {
  const context = useContext(AssessmentContext)
  if (!context) {
    throw new Error('useAssessment must be used inside AssessmentProvider.')
  }
  return context
}
