function buildErrorMessage(response, payload) {
  if (!response) {
    return 'Backend unavailable. Vui lòng kiểm tra API server.'
  }
  if (payload?.error) {
    return payload.error
  }
  if (response.status === 404) {
    return 'API route not found. Kiểm tra VITE_API_BASE_URL hoặc route /api trên backend.'
  }
  if (response.status === 422) {
    return 'Validation failed.'
  }
  return `Request failed (${response.status}).`
}

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ''}`.trim().replace(/\/+$/, '')

function resolveApiUrl(url) {
  if (/^https?:\/\//i.test(url)) return url
  if (!API_BASE_URL) return url
  const path = `${url || ''}`
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(buildErrorMessage(response, payload))
    error.status = response.status
    error.code = payload?.errorCode || ''
    error.payload = payload
    throw error
  }
  return payload
}

async function request(url, options = {}) {
  try {
    const response = await fetch(resolveApiUrl(url), options)
    return await parseResponse(response)
  } catch (error) {
    if (error?.status) throw error
    const networkError = new Error('Backend unavailable. Kiểm tra API URL/backend hoặc chạy npm run dev:full ở local.')
    networkError.code = 'backend_unavailable'
    throw networkError
  }
}

function jsonBody(method, payload) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

export async function getApiHealth() {
  return request('/api/health')
}

export async function getBootstrap() {
  return request('/api/bootstrap')
}

export async function getJobs() {
  return request('/api/jobs')
}

export async function getJob(jobId) {
  return request(`/api/jobs/${jobId}`)
}

export async function getRecruiterJobs() {
  return request('/api/recruiter/jobs')
}

export async function getRecruiterJob(jobId) {
  return request(`/api/recruiter/jobs/${jobId}`)
}

export async function createRecruiterJob(payload) {
  return request('/api/recruiter/jobs', jsonBody('POST', payload))
}

export async function updateRecruiterJob(jobId, payload) {
  return request(`/api/recruiter/jobs/${jobId}`, jsonBody('PATCH', payload))
}

export async function updateRecruiterJobStatus(jobId, status) {
  return request(`/api/recruiter/jobs/${jobId}/status`, jsonBody('PATCH', { status }))
}

export async function deleteRecruiterJob(jobId) {
  return request(`/api/recruiter/jobs/${jobId}`, { method: 'DELETE' })
}

export async function uploadJobJd(jobId, file) {
  const formData = new FormData()
  formData.append('jd', file, file.name)
  return request(`/api/recruiter/jobs/${jobId}/jd`, {
    method: 'POST',
    body: formData,
  })
}

export async function uploadJobCvs(jobId, files) {
  const formData = new FormData()
  Array.from(files).forEach((file) => {
    formData.append('cvs', file, file.name)
  })
  return request(`/api/recruiter/jobs/${jobId}/cvs`, {
    method: 'POST',
    body: formData,
  })
}

export async function recomputeMatching(jobId) {
  return request(`/api/recruiter/jobs/${jobId}/matching/recompute`, jsonBody('POST', {}))
}

export async function inviteApplication(applicationId) {
  return request(`/api/recruiter/applications/${applicationId}/invite`, jsonBody('POST', {}))
}

export async function updateApplicationStage(applicationId, stage) {
  return request(`/api/recruiter/applications/${applicationId}/stage`, jsonBody('PATCH', { stage }))
}

export async function getRecruiterJobResults(jobId) {
  return request(`/api/recruiter/jobs/${jobId}/results`)
}

export async function getRecruiterCandidate(candidateId) {
  return request(`/api/recruiter/candidates/${candidateId}`)
}

export async function deleteRecruiterCandidate(candidateId) {
  return request(`/api/recruiter/candidates/${candidateId}`, { method: 'DELETE' })
}

export async function getRecruiterReview(attemptId) {
  return request(`/api/recruiter/reviews/${attemptId}`)
}

export async function overrideRecruiterReview(attemptId, payload) {
  return request(`/api/recruiter/reviews/${attemptId}/override`, jsonBody('POST', payload))
}

export async function getAssessmentEntry(code) {
  return request(`/api/assessment/entry?code=${encodeURIComponent(code)}`)
}

export async function getAssessmentSession(sessionId) {
  return request(`/api/assessment/sessions/${sessionId}`)
}

export async function saveDeviceCheck(sessionId, payload) {
  return request(`/api/assessment/sessions/${sessionId}/device-check`, jsonBody('POST', payload))
}

export async function saveCandidateConfirmation(sessionId, payload) {
  return request(`/api/assessment/sessions/${sessionId}/confirm-info`, jsonBody('POST', payload))
}

export async function saveConsent(sessionId, consentAccepted) {
  return request(`/api/assessment/sessions/${sessionId}/consent`, jsonBody('POST', { consentAccepted }))
}

export async function startProctoring(sessionId, payload = {}) {
  return request(`/api/assessment/sessions/${sessionId}/proctoring/start`, jsonBody('POST', payload))
}

export async function reportProctoringEvent(sessionId, payload) {
  return request(`/api/assessment/sessions/${sessionId}/proctoring/event`, jsonBody('POST', payload))
}

export async function uploadProctoringChunk(sessionId, chunk, sequence) {
  const formData = new FormData()
  formData.append('chunk', chunk, `proctoring-${sequence}.webm`)
  formData.append('sequence', `${sequence}`)
  return request(`/api/assessment/sessions/${sessionId}/proctoring/chunk`, {
    method: 'POST',
    body: formData,
  })
}

export async function stopProctoring(sessionId, payload = {}) {
  return request(`/api/assessment/sessions/${sessionId}/proctoring/stop`, jsonBody('POST', payload))
}

export async function uploadSectionMedia(sessionId, sectionKey, file) {
  const formData = new FormData()
  formData.append('media', file, file.name)
  return request(`/api/assessment/sessions/${sessionId}/sections/${sectionKey}/media`, {
    method: 'POST',
    body: formData,
  })
}

export async function scoreSpokenAssessmentItem(sessionId, sectionKey, payload) {
  const formData = new FormData()
  formData.append('media', payload.file, payload.fileName || payload.file?.name || 'spoken-response.webm')
  formData.append('prompt', payload.prompt || '')
  formData.append('referenceText', payload.referenceText || '')
  formData.append('expectedKeywords', JSON.stringify(payload.expectedKeywords || []))
  formData.append('language', payload.language || 'ja')
  return request(`/api/assessment/sessions/${sessionId}/sections/${sectionKey}/score-spoken`, {
    method: 'POST',
    body: formData,
  })
}

export async function saveSectionAnswer(sessionId, sectionKey, answer, options = {}) {
  return request(
    `/api/assessment/sessions/${sessionId}/sections/${sectionKey}/answer`,
    jsonBody('POST', { answer, completed: options.completed }),
  )
}

export async function submitAssessment(sessionId) {
  return request(`/api/assessment/sessions/${sessionId}/submit`, jsonBody('POST', {}))
}
