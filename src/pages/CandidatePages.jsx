import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getAssessmentEntry, scoreSpokenAssessmentItem } from '../api'
import { AssessmentCardLayout, Badge, RunnerWorkspace, SimpleTable } from '../components'
import { copy, DEFAULT_LANGUAGE } from '../data'
import { useAssessment } from '../context/AssessmentContext'
import { useMediaRecorder } from '../hooks/useMediaRecorder'

function entryErrorMessage(error, language) {
  const dict = copy[language]?.assessmentErrors || copy.vi.assessmentErrors
  if (error?.code === 'invalid_code') return dict.invalidCode
  if (error?.code === 'expired_code') return dict.expiredCode
  if (error?.code === 'backend_unavailable') return dict.backendUnavailable
  return error?.message || dict.upload
}

function useStreamPreview(stream) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])
  return videoRef
}

function useAudioLevel(stream) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream?.getAudioTracks().length) {
      setLevel(0)
      return undefined
    }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    const source = context.createMediaStreamSource(stream)
    const buffer = new Uint8Array(analyser.frequencyBinCount)
    source.connect(analyser)
    let frameId = 0
    const update = () => {
      analyser.getByteFrequencyData(buffer)
      const avg = buffer.reduce((sum, item) => sum + item, 0) / buffer.length
      setLevel(Math.round((avg / 255) * 100))
      frameId = requestAnimationFrame(update)
    }
    update()
    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      analyser.disconnect()
      context.close()
    }
  }, [stream])
  return level
}

function useAssessmentPageState(language) {
  const ctx = useAssessment()
  const t = copy[language] || copy[DEFAULT_LANGUAGE]
  if (ctx.loading) return { ...ctx, statusNode: <div className="section-card">Đang tải assessment session...</div> }
  if (ctx.error) return { ...ctx, statusNode: <div className="section-card inline-error">{ctx.error}</div> }
  if (!ctx.session) return { ...ctx, statusNode: <div className="section-card inline-error">{t.assessmentErrors.expired}</div> }
  return { ...ctx, statusNode: null }
}

function SpokenWorkspace({ sectionKey, title, subtitle, promptNode, language }) {
  const { session, submitAnswer } = useAssessment()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const completed = Boolean(session?.sectionResults?.[sectionKey]?.completed)
  const proctorReady = Boolean(session?.proctoring?.startedAt)

  async function complete() {
    setSaving(true)
    setMessage('')
    try {
      await submitAnswer(sectionKey, { spokenCompleted: true, note: note.trim(), completedAt: new Date().toISOString() })
      setMessage('Đã ghi nhận phần thi.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <RunnerWorkspace
      title={title}
      subtitle={subtitle}
      leftContent={(
        <>
          {promptNode}
          <div className="detail-list-box top-gap">
            <div>Giám sát toàn phiên: {proctorReady ? 'Đang hoạt động' : 'Chưa bắt đầu'}</div>
            <div>Gói ghi hình đã lưu: {session?.proctoring?.chunks?.length || 0}</div>
          </div>
          {!proctorReady ? <div className="inline-error top-gap">Bạn cần bật toàn màn hình để tiếp tục.</div> : null}
        </>
      )}
      rightContent={(
        <div className="answer-panel">
          <div className="panel-title">Ghi chú (tùy chọn)</div>
          <textarea className="text-area-surface compact" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="button-row top-gap">
            <button className="primary-button" disabled={completed || saving || !proctorReady} type="button" onClick={complete}>
              {saving ? 'Đang lưu...' : completed ? 'Đã hoàn thành' : 'Xác nhận hoàn thành phần này'}
            </button>
          </div>
          {message ? <div className="inline-success top-gap">{message}</div> : null}
        </div>
      )}
    />
  )
}

function TextAnswerWorkspace({ sectionKey, title, subtitle, promptNode, placeholder, language }) {
  const { session, submitAnswer } = useAssessment()
  const [draft, setDraft] = useState(session?.sectionResults?.[sectionKey]?.answer || '')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await submitAnswer(sectionKey, draft)
      setMessage('Đã lưu câu trả lời.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    } finally {
      setSaving(false)
    }
  }
  return (
    <RunnerWorkspace
      title={title}
      subtitle={subtitle}
      leftContent={promptNode}
      rightContent={(
        <div className="answer-panel">
          <textarea className="text-area-surface" placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="button-row top-gap">
            <button className="primary-button" disabled={!`${draft}`.trim() || saving} onClick={save} type="button">
              {saving ? 'Đang lưu...' : 'Lưu phần trả lời'}
            </button>
          </div>
          {message ? <div className="inline-success top-gap">{message}</div> : null}
        </div>
      )}
    />
  )
}

function typingMetrics(sourceText, inputText, elapsedSec) {
  const src = [...(sourceText || '')]
  const typed = [...(inputText || '')]
  let matches = 0
  for (let i = 0; i < typed.length; i += 1) if (typed[i] === src[i]) matches += 1
  const safeElapsed = Math.max(1, Math.floor(elapsedSec || 0))
  return {
    accuracyPercent: typed.length ? Math.round((matches / typed.length) * 100) : 0,
    completenessPercent: src.length ? Math.min(100, Math.round((typed.length / src.length) * 100)) : 0,
    cpm: Math.round((typed.length / safeElapsed) * 60),
    charactersTyped: typed.length,
  }
}

const EXTRACTION_FIELDS = [
  { key: 'companyName', label: 'Company Name' },
  { key: 'invoiceNumber', label: 'Invoice / Document Number' },
  { key: 'customerCode', label: 'Customer Code' },
  { key: 'date', label: 'Date' },
  { key: 'totalAmount', label: 'Total Amount' },
  { key: 'taxAmount', label: 'Tax Amount' },
  { key: 'address', label: 'Address' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'personInCharge', label: 'Person In Charge' },
]

function clampStepIndex(value, total) {
  if (!total) return 0
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(total - 1, numeric))
}

function normalizeCompareValue(value) {
  return `${value || ''}`.trim().toLowerCase().replace(/\s+/g, '')
}

function countObjectCharacters(record = {}) {
  return Object.values(record).reduce((sum, value) => sum + `${value || ''}`.length, 0)
}

function fieldFormatStatus(fieldKey, value) {
  const text = `${value || ''}`.trim()
  if (!text) return 'missing'
  if (fieldKey === 'date') return /^\d{4}[/-]\d{2}[/-]\d{2}$/.test(text) ? 'ok' : 'format_warning'
  if (fieldKey === 'phoneNumber') return /^[\d\-+() ]+$/.test(text) ? 'ok' : 'format_warning'
  if (fieldKey === 'totalAmount' || fieldKey === 'taxAmount') return /[\d,]+/.test(text) ? 'ok' : 'format_warning'
  return 'ok'
}

function buildFieldReport(expectedFields = {}, submittedFields = {}) {
  const keys = Object.keys(expectedFields)
  const rows = keys.map((key) => {
    const expected = `${expectedFields[key] || ''}`
    const entered = `${submittedFields[key] || ''}`
    const formatStatus = fieldFormatStatus(key, entered)
    return {
      key,
      expected,
      entered,
      correct: normalizeCompareValue(expected) === normalizeCompareValue(entered),
      formatStatus,
    }
  })
  const correctCount = rows.filter((row) => row.correct).length
  const missingFields = rows.filter((row) => !row.entered.trim()).map((row) => row.key)
  const formatWarnings = rows.filter((row) => row.formatStatus === 'format_warning').map((row) => row.key)
  return {
    rows,
    correctCount,
    total: rows.length,
    accuracyPercent: rows.length ? Math.round((correctCount / rows.length) * 100) : 0,
    missingFields,
    formatWarnings,
  }
}

function buildTypingTaskScore(task, draft, elapsedSec, corrections, pasteAttempts) {
  if (task?.type === 'structured-form') {
    const fields = Array.isArray(task?.fields) ? task.fields : []
    const values = draft?.fieldValues || {}
    const correctCount = fields.filter((field) => normalizeCompareValue(field.expectedValue) === normalizeCompareValue(values[field.key])).length
    const accuracyPercent = fields.length ? Math.round((correctCount / fields.length) * 100) : 0
    const charactersTyped = countObjectCharacters(values)
    const cpm = Math.round((charactersTyped / Math.max(1, elapsedSec || 1)) * 60)
    const speedScore = Math.min(100, Math.round((Math.min(cpm, 180) / 180) * 100))
    const taskScore = Math.max(
      0,
      Math.min(100, Math.round(accuracyPercent * 0.8 + speedScore * 0.2 - Math.min(12, corrections * 0.4) - pasteAttempts * 10)),
    )
    return {
      fieldValues: values,
      accuracyPercent,
      cpm,
      corrections,
      pasteAttempts,
      elapsedSec,
      taskScore,
    }
  }

  const sourceText = task?.sourceText || ''
  const inputText = `${draft?.inputText || ''}`
  const metrics = typingMetrics(sourceText, inputText, elapsedSec)
  const speedScore = Math.min(100, Math.round((Math.min(metrics.cpm, 220) / 220) * 100))
  const taskScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        metrics.accuracyPercent * 0.65 +
          metrics.completenessPercent * 0.2 +
          speedScore * 0.15 -
          Math.min(12, corrections * 0.4) -
          pasteAttempts * 10,
      ),
    ),
  )
  return {
    inputText,
    sourceText,
    ...metrics,
    corrections,
    pasteAttempts,
    elapsedSec,
    taskScore,
  }
}

function documentPreviewRows(documentText = '') {
  return `${documentText || ''}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/[:：]/)
      if (parts.length >= 2) {
        return { key: `row-${index}`, label: parts[0].trim(), value: parts.slice(1).join(':').trim() }
      }
      return { key: `row-${index}`, label: '', value: line }
    })
}

function attemptCloseWindow() {
  try {
    window.close()
  } catch {
    return false
  }
  return window.closed
}

function SectionTaskHeader({ eyebrow, title, description, stepLabel, currentIndex, total }) {
  return (
    <div className="section-card inset-card">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p className="lead">{description}</p>
      <div className="assessment-task-strip top-gap">
        <div>
          <strong>{stepLabel}</strong>
          <div className="row-subtitle">Step {currentIndex + 1} / {total}</div>
        </div>
        <div className="progress-track slim">
          <div className="progress-fill" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function SpokenStepperSection({ sectionKey, title, subtitle, items, intro, language, renderPrompt }) {
  const { session, submitAnswer, statusNode } = useAssessmentPageState(language)
  const recorder = useMediaRecorder()
  const videoRef = useStreamPreview(recorder.stream)
  const audioLevel = useAudioLevel(recorder.stream)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const storedAnswer = session?.sectionResults?.[sectionKey]?.answer
  const storedResponses = Array.isArray(storedAnswer?.responses) ? storedAnswer.responses : []
  const [currentIndex, setCurrentIndex] = useState(() => clampStepIndex(storedAnswer?.currentIndex, items.length))

  useEffect(() => {
    setCurrentIndex(clampStepIndex(storedAnswer?.currentIndex, items.length))
  }, [storedAnswer?.currentIndex, items.length])

  if (statusNode) return statusNode
  if (!items.length) return <div className="section-card inline-error">Question set is not available.</div>

  const currentItem = items[currentIndex]
  const isLast = currentIndex === items.length - 1

  async function handleAdvance() {
    if (recorder.isRecording) {
      setMessageTone('error')
      setMessage('Please stop recording before continuing.')
      return
    }
    if (!recorder.blob) {
      setMessageTone('error')
      setMessage('Please record your answer before continuing.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const scored = await scoreSpokenAssessmentItem(session.id, sectionKey, {
        file: recorder.blob,
        fileName: `${sectionKey}-${currentItem.id || currentIndex + 1}.webm`,
        prompt: currentItem.prompt || currentItem.title || '',
        referenceText: currentItem.referenceText || currentItem.passageText || '',
        expectedKeywords: currentItem.expectedKeywords || [],
        language: 'ja',
      })
      const existing = storedResponses.filter((item) => item.itemId !== currentItem.id)
      const nextResponses = [
        ...existing,
        {
          itemId: currentItem.id,
          prompt: currentItem.prompt || currentItem.title || '',
          referenceText: currentItem.referenceText || currentItem.passageText || '',
          durationSec: recorder.elapsed,
          recordedAt: new Date().toISOString(),
          recordingStatus: 'captured',
          transcript: scored?.result?.transcript || '',
          summary: scored?.result?.summary || '',
          aiScore: scored?.result?.score ?? null,
          accuracyScore: scored?.result?.accuracyScore ?? null,
          fluencyScore: scored?.result?.fluencyScore ?? null,
          omissionRate: scored?.result?.omissionRate ?? null,
          majorMisreadings: scored?.result?.majorMisreadings || [],
          matchedPhrases: scored?.result?.matchedPhrases || [],
          correctness: scored?.result?.correctness ?? null,
          clarity: scored?.result?.clarity ?? null,
          keywordCoverage: scored?.result?.keywordCoverage ?? null,
        },
      ]
      await submitAnswer(
        sectionKey,
        {
          currentIndex: isLast ? currentIndex : currentIndex + 1,
          responses: nextResponses,
        },
        { completed: isLast },
      )
      recorder.clearRecording()
      setMessageTone('success')
      setMessage(isLast ? 'Section completed successfully.' : 'Answer saved and scored. Move to the next question.')
      if (!isLast) {
        setCurrentIndex((value) => Math.min(value + 1, items.length - 1))
      }
    } catch {
      setMessageTone('error')
      setMessage(copy[language].assessmentErrors.upload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <RunnerWorkspace
      title={title}
      subtitle={subtitle}
      leftContent={(
        <div className="stack-lg">
          <SectionTaskHeader
            eyebrow="Assessment Section"
            title={title}
            description={intro}
            stepLabel="Current Question"
            currentIndex={currentIndex}
            total={items.length}
          />
          {renderPrompt(currentItem, currentIndex)}
        </div>
      )}
      rightContent={(
        <div className="stack-lg">
          <div className="section-card inset-card">
            <div className="section-header-inline">
              <h3>Recording Status</h3>
              <Badge tone={recorder.isRecording ? 'danger' : recorder.blob ? 'success' : 'warning'}>
                {recorder.isRecording ? 'Recording' : recorder.blob ? 'Ready' : 'Waiting'}
              </Badge>
            </div>
            <div className="top-gap">
              {recorder.stream ? <video ref={videoRef} className="live-preview small" autoPlay muted playsInline /> : <div className="typing-surface">Camera preview will appear here.</div>}
            </div>
            <div className="detail-list-box top-gap">
              <div>Elapsed: {recorder.elapsed}s</div>
              <div>Microphone level: {audioLevel}%</div>
              <div>Full-session proctoring remains active in the background.</div>
            </div>
            <div className="button-row wrap top-gap">
              <button className="ghost-button small" onClick={recorder.requestStream} type="button">Prepare Camera</button>
              <button className="ghost-button small" disabled={recorder.isRecording} onClick={recorder.startRecording} type="button">Start</button>
              <button className="ghost-button small" disabled={!recorder.isRecording} onClick={recorder.stopRecording} type="button">Stop</button>
              <button className="primary-button small" disabled={saving || recorder.isRecording || !recorder.blob} onClick={handleAdvance} type="button">
                {saving ? 'Saving...' : isLast ? 'Complete Section' : 'Next Question'}
              </button>
            </div>
            {message ? <div className={`${messageTone === 'error' ? 'inline-error' : 'inline-success'} top-gap`}>{message}</div> : null}
            {recorder.error ? <div className="inline-error top-gap">{recorder.error}</div> : null}
          </div>
        </div>
      )}
    />
  )
}

export function CandidateEntryPage({ language = DEFAULT_LANGUAGE }) {
  const [code, setCode] = useState('ALR-AKIRA-9921')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const { setSessionId } = useAssessment()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const codeFromQuery = new URLSearchParams(location.search || '').get('code')
    if (!codeFromQuery) return
    setCode(codeFromQuery)
    setLoading(true)
    getAssessmentEntry(codeFromQuery)
      .then((entry) => {
        setSessionId(entry.sessionId)
        navigate(`/candidate/invitation?session=${encodeURIComponent(entry.sessionId)}`, { replace: true })
      })
      .catch((error) => setMessage(entryErrorMessage(error, language)))
      .finally(() => setLoading(false))
  }, [language, location.search, navigate, setSessionId])

  async function handleContinue() {
    setLoading(true)
    setMessage('')
    try {
      const entry = await getAssessmentEntry(code.trim())
      setSessionId(entry.sessionId)
      navigate(`/candidate/invitation?session=${encodeURIComponent(entry.sessionId)}`, { replace: true })
    } catch (error) {
      setMessage(entryErrorMessage(error, language))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AssessmentCardLayout
      eyebrow="Assessment Entry"
      title="Nhập mã bài thi để bắt đầu"
      body="Bạn có thể dùng link recruiter gửi hoặc nhập invitation code để mở đúng phiên assessment."
      asideTitle="Hướng dẫn nhanh"
      asideItems={['Chuẩn bị camera/microphone', 'Bật toàn màn hình khi được yêu cầu', 'Không copy/paste trong bài thi']}
    >
      <div className="form-stack top-gap">
        <label className="input-block">
          <span>Invitation code</span>
          <input className="text-input" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button className="primary-button" disabled={!code.trim() || loading} onClick={handleContinue} type="button">
          {loading ? 'Đang kiểm tra...' : 'Mở phiên assessment'}
        </button>
        {message ? <div className="inline-error">{message}</div> : null}
      </div>
    </AssessmentCardLayout>
  )
}

export function InvitationPage({ language = DEFAULT_LANGUAGE }) {
  const { session, statusNode } = useAssessmentPageState(language)
  if (statusNode) return statusNode
  return (
    <AssessmentCardLayout
      eyebrow="Invitation Landing"
      title={session.jobTitle}
      body="Hệ thống sẽ hướng dẫn từng bước. Bài thi áp dụng giám sát toàn phiên để đảm bảo công bằng."
      asideTitle="Assessment Overview"
      asideItems={['35-45 phút', 'Japanese + Typing + Data task', 'Theo dõi fullscreen/tab trong suốt phiên']}
    />
  )
}

export function DeviceCheckPage({ language = DEFAULT_LANGUAGE }) {
  const { session, submitDevice, statusNode } = useAssessmentPageState(language)
  const recorder = useMediaRecorder()
  const videoRef = useStreamPreview(recorder.stream)
  const audioLevel = useAudioLevel(recorder.stream)
  const [networkReady, setNetworkReady] = useState(() => navigator.onLine)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const onConnectionChange = () => setNetworkReady(navigator.onLine)
    window.addEventListener('online', onConnectionChange)
    window.addEventListener('offline', onConnectionChange)
    return () => {
      window.removeEventListener('online', onConnectionChange)
      window.removeEventListener('offline', onConnectionChange)
    }
  }, [])

  async function handleSave() {
    try {
      await submitDevice({
        microphone: recorder.stream?.getAudioTracks()?.length > 0,
        camera: recorder.stream?.getVideoTracks()?.length > 0,
        network: networkReady,
      })
      setMessage('Đã lưu kết quả kiểm tra thiết bị.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    }
  }

  if (statusNode) return statusNode

  return (
    <AssessmentCardLayout
      eyebrow="Device Check"
      title="Kiểm tra thiết bị trước khi bắt đầu"
      body="Kiểm tra camera, microphone và kết nối mạng trước khi sang bước tiếp theo."
      asideTitle="Live Status"
      asideItems={[
        `Microphone: ${session.deviceCheck.microphone ? 'Ready' : 'Pending'}`,
        `Camera: ${session.deviceCheck.camera ? 'Ready' : 'Pending'}`,
        `Network: ${networkReady ? 'Stable' : 'Offline'}`,
      ]}
    >
      <div className="device-check-grid top-gap">
        <div className="device-card">
          <div className="section-header-inline"><h3>Camera</h3><Badge tone={recorder.stream?.getVideoTracks()?.length ? 'success' : 'warning'}>{recorder.stream?.getVideoTracks()?.length ? 'Ready' : 'Pending'}</Badge></div>
          {recorder.stream ? <video ref={videoRef} className="live-preview small" autoPlay muted playsInline /> : <div className="typing-surface">Chưa có preview</div>}
        </div>
        <div className="device-card">
          <div className="section-header-inline"><h3>Microphone</h3><Badge tone={audioLevel > 0 ? 'success' : 'warning'}>{audioLevel > 0 ? 'Detected' : 'No signal'}</Badge></div>
          <div className="audio-meter"><div className="audio-meter-fill" style={{ width: `${audioLevel}%` }} /></div>
        </div>
        <div className="device-card">
          <div className="section-header-inline"><h3>Network</h3><Badge tone={networkReady ? 'success' : 'danger'}>{networkReady ? 'Stable' : 'Offline'}</Badge></div>
          <p>{networkReady ? 'Đã kết nối Internet' : 'Không có kết nối mạng'}</p>
        </div>
      </div>
      <div className="button-row top-gap">
        
          
        
        <button className="ghost-button" type="button" onClick={recorder.requestStream}>Kiểm tra camera/microphone</button>
        <button className="primary-button" type="button" onClick={handleSave}>Lưu kết quả kiểm tra</button>
      </div>
      {message ? <div className="inline-success top-gap">{message}</div> : null}
      {recorder.error ? <div className="inline-error top-gap">{copy[language].assessmentErrors.permission}</div> : null}
    </AssessmentCardLayout>
  )
}

export function ConsentPage({ language = DEFAULT_LANGUAGE }) {
  const { session, submitConsent, statusNode } = useAssessmentPageState(language)
  const [checked, setChecked] = useState(Boolean(session?.consentAccepted))
  const [message, setMessage] = useState('')
  if (statusNode) return statusNode

  async function handleSave() {
    try {
      await submitConsent(checked)
      setMessage('Đã lưu xác nhận consent.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    }
  }

  return (
    <AssessmentCardLayout
      eyebrow="Consent"
      title="Xác nhận giám sát toàn phiên"
      body="Bài thi ghi hình/ghi âm xuyên suốt và theo dõi thoát fullscreen, rời tab, copy/paste để đảm bảo công bằng."
      asideTitle="Consent Summary"
      asideItems={['Ghi hình liên tục trong toàn bộ thời gian làm bài', 'Theo dõi sự kiện tab/fullscreen', 'Dữ liệu dùng cho mục đích tuyển dụng']}
    >
      <div className="consent-box top-gap">
        <label className="checkbox-row">
          <input checked={checked} onChange={(event) => setChecked(event.target.checked)} type="checkbox" />
          <span>Tôi đồng ý với chính sách giám sát bài thi.</span>
        </label>
      </div>
      <div className="button-row top-gap">
        <button className="primary-button" disabled={!checked} type="button" onClick={handleSave}>Xác nhận consent</button>
      </div>
      {message ? <div className="inline-success top-gap">{message}</div> : null}
    </AssessmentCardLayout>
  )
}

export function ConfirmInfoPage({ language = DEFAULT_LANGUAGE }) {
  const { session, submitCandidateConfirmation, statusNode } = useAssessmentPageState(language)
  const [draft, setDraft] = useState({})
  const [message, setMessage] = useState('')
  if (statusNode) return statusNode

  const base = session?.candidateConfirmation || {}
  const form = {
    appliedRole: draft.appliedRole ?? base.appliedRole ?? '',
    japaneseLevel: draft.japaneseLevel ?? base.japaneseLevel ?? '',
    fullTimeAvailability: draft.fullTimeAvailability ?? Boolean(base.fullTimeAvailability),
    availableStartDate: draft.availableStartDate ?? base.availableStartDate ?? '',
    shiftFit: draft.shiftFit ?? base.shiftFit ?? '',
    reportIncorrectInfo: draft.reportIncorrectInfo ?? base.reportIncorrectInfo ?? '',
    confirmAcknowledged: draft.confirmAcknowledged ?? Boolean(base.confirmAcknowledged),
  }

  async function handleSave() {
    try {
      await submitCandidateConfirmation(form)
      setDraft({})
      setMessage('Đã lưu xác nhận thông tin.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    }
  }

  return (
    <AssessmentCardLayout
      eyebrow="Candidate Information"
      title="Xác nhận thông tin và điều kiện làm việc"
      body="Nếu thông tin chưa đúng, bạn có thể chỉnh sửa hoặc ghi chú để recruiter kiểm tra lại."
      asideTitle="Current Profile"
      asideItems={[
        `Applied role: ${form.appliedRole}`,
        `Japanese level: ${form.japaneseLevel}`,
        `Start date: ${form.availableStartDate}`,
      ]}
    >
      <div className="form-stack top-gap">
        <label className="input-block"><span>Applied role</span><input className="text-input" value={form.appliedRole} onChange={(event) => setDraft((prev) => ({ ...prev, appliedRole: event.target.value }))} /></label>
        <label className="input-block"><span>Japanese level</span><input className="text-input" value={form.japaneseLevel} onChange={(event) => setDraft((prev) => ({ ...prev, japaneseLevel: event.target.value }))} /></label>
        <label className="input-block"><span>Available start date</span><input className="text-input" value={form.availableStartDate} onChange={(event) => setDraft((prev) => ({ ...prev, availableStartDate: event.target.value }))} /></label>
        <label className="input-block"><span>Shift fit</span><input className="text-input" value={form.shiftFit} onChange={(event) => setDraft((prev) => ({ ...prev, shiftFit: event.target.value }))} /></label>
        <label className="checkbox-row"><input checked={form.fullTimeAvailability} onChange={(event) => setDraft((prev) => ({ ...prev, fullTimeAvailability: event.target.checked }))} type="checkbox" /><span>Tôi có thể làm việc full-time.</span></label>
        <label className="input-block"><span>Report Incorrect Information</span><textarea className="text-area-surface compact" value={form.reportIncorrectInfo} onChange={(event) => setDraft((prev) => ({ ...prev, reportIncorrectInfo: event.target.value }))} /></label>
        <label className="checkbox-row"><input checked={form.confirmAcknowledged} onChange={(event) => setDraft((prev) => ({ ...prev, confirmAcknowledged: event.target.checked }))} type="checkbox" /><span>Tôi xác nhận thông tin trên là đúng hoặc đã báo sai lệch.</span></label>
      </div>
      <div className="button-row top-gap">
        <button className="primary-button" disabled={!form.confirmAcknowledged} type="button" onClick={handleSave}>Lưu xác nhận thông tin</button>
      </div>
      {message ? <div className="inline-success top-gap">{message}</div> : null}
    </AssessmentCardLayout>
  )
}

export function JapaneseQaPage({ language = DEFAULT_LANGUAGE }) {
  const { session, statusNode } = useAssessmentPageState(language)
  if (statusNode) return statusNode
  const qa = session?.questionSet?.japaneseQa || {}
  return (
    <SpokenStepperSection
      sectionKey="japanese-qa"
      title="Section 1. Self-introduction / motivation / work-fit"
      subtitle="Answer one interview question at a time in Japanese. Each response is transcribed and AI-scored individually."
      items={qa.questions || []}
      intro={
        qa.introduction ||
        'This section checks question understanding, relevance, clarity, logical structure, motivation, and work-fit for a Japanese data-entry role.'
      }
      renderPrompt={(item, index) => (
        <div className="section-card inset-card">
          <div className="eyebrow">Question {index + 1}</div>
          <h3>{item.prompt}</h3>
          <p className="lead">{qa.answerGuide || 'Please answer clearly and logically in Japanese.'}</p>
        </div>
      )}
      language={language}
    />
  )
}

export function ReadingAloudPage({ language = DEFAULT_LANGUAGE }) {
  const { session, statusNode } = useAssessmentPageState(language)
  if (statusNode) return statusNode
  const reading = session?.questionSet?.readingAloud || {}
  return (
    <SpokenStepperSection
      sectionKey="reading-aloud"
      title="Section 2. Japanese reading aloud"
      subtitle="Read each Japanese passage aloud. Proceed one passage at a time after stopping your recording."
      items={reading.items || []}
      intro={reading.instruction || 'This section checks reading accuracy, omissions, pace, and basic fluency.'}
      renderPrompt={(item, index) => (
        <div className="section-card inset-card">
          <div className="eyebrow">Passage {index + 1}</div>
          <h3>{item.title || 'Reading passage'}</h3>
          <p className="lead">{item.sourceType || 'Business text'}</p>
          <div className="question-box top-gap">{item.passageText || '...'}</div>
        </div>
      )}
      language={language}
    />
  )
}

export function ReadingComprehensionPage({ language = DEFAULT_LANGUAGE }) {
  const { session, statusNode } = useAssessmentPageState(language)
  if (statusNode) return statusNode
  const readingComp = session?.questionSet?.readingComprehension
  return (
    <TextAnswerWorkspace
      sectionKey="reading-comprehension"
      title="Reading Comprehension"
      subtitle="Trả lời theo C1, C2, C3 dựa trên đoạn văn."
      placeholder="C1: ...\nC2: ...\nC3: ..."
      promptNode={(
        <div className="section-card inset-card">
          <div className="panel-title">{readingComp?.passageTitle || 'Comprehension Passage'}</div>
          <div className="question-box top-gap">{readingComp?.passageText || '...'}</div>
          <ol className="detail-list top-gap">
            {(readingComp?.questions || []).map((item) => <li key={item.id || item.prompt}>{item.prompt}</li>)}
          </ol>
        </div>
      )}
      language={language}
    />
  )
}

export function TypingPage({ language = DEFAULT_LANGUAGE }) {
  const { session, submitAnswer, statusNode, pushProctoringEvent } = useAssessmentPageState(language)
  const [draftValue, setDraftValue] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [startedAtMs, setStartedAtMs] = useState(0)
  const [corrections, setCorrections] = useState(0)
  const [pasteAttempts, setPasteAttempts] = useState(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!startedAtMs) return undefined
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [startedAtMs])

  if (statusNode) return statusNode
  const typingSet = session?.questionSet?.typing || {}
  const tasks = typingSet.tasks || []
  const stored = session?.sectionResults?.typing?.answer || {}
  const storedTasks = Array.isArray(stored.tasks) ? stored.tasks : []
  const currentIndex = clampStepIndex(stored.currentIndex, tasks.length)
  const currentTask = tasks[currentIndex]
  const savedTaskResult = storedTasks.find((item) => item.taskId === currentTask?.id) || {}
  const elapsedSec = startedAtMs ? Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)) : Number(savedTaskResult.elapsedSec || 0)
  const inputText = `${draftValue.inputText ?? savedTaskResult.inputText ?? ''}`
  const fieldValues = draftValue.fieldValues || savedTaskResult.fieldValues || {}
  const currentResult = buildTypingTaskScore(
    currentTask,
    currentTask?.type === 'structured-form' ? { fieldValues } : { inputText },
    elapsedSec,
    corrections,
    pasteAttempts,
  )
  const isLast = currentIndex === tasks.length - 1

  function reportRestricted(type, detail) {
    void pushProctoringEvent({ type, detail, stepKey: 'typing' }).catch(() => {})
  }

  function preventAction(event, type, detail) {
    event.preventDefault()
    reportRestricted(type, detail)
  }

  useEffect(() => {
    setDraftValue({})
    setStartedAtMs(0)
    setCorrections(0)
    setPasteAttempts(0)
    setMessage('')
  }, [currentIndex])

  if (!tasks.length || !currentTask) {
    return <div className="section-card inline-error">Typing task is not available.</div>
  }

  async function handleAdvance() {
    setSaving(true)
    setMessage('')
    try {
      const nextTasks = [
        ...storedTasks.filter((item) => item.taskId !== currentTask.id),
        {
          taskId: currentTask.id,
          type: currentTask.type,
          completedAt: new Date().toISOString(),
          ...currentResult,
        },
      ]
      await submitAnswer(
        'typing',
        {
          currentIndex: isLast ? currentIndex : currentIndex + 1,
          tasks: nextTasks,
        },
        { completed: isLast },
      )
      setMessage(isLast ? 'Typing section completed.' : 'Task saved. Move to the next typing task.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <RunnerWorkspace
      title="Section 3. Japanese typing test"
      subtitle="Complete one typing task at a time. Accuracy is more important than speed, and paste remains blocked."
      leftContent={(
        <div className="stack-lg">
          <SectionTaskHeader
            eyebrow="Assessment Section"
            title={typingSet.title || 'Japanese typing test'}
            description={typingSet.instruction || 'Complete each typing task carefully.'}
            stepLabel="Current Task"
            currentIndex={currentIndex}
            total={tasks.length}
          />
          <div className="section-card inset-card">
            <div className="eyebrow">{currentTask.type === 'structured-form' ? 'Structured Form' : 'Copy Typing'}</div>
            <h3>{currentTask.title || 'Typing task'}</h3>
            <p className="lead">{currentTask.instruction || 'Type the content exactly as shown.'}</p>
            <div className="question-box top-gap document-source-block">{currentTask.sourceText || '...'}</div>
          </div>
          <div className="section-card inset-card">
            <div className="section-header-inline">
              <h3>Live metrics</h3>
              <Badge tone={currentResult.taskScore >= 80 ? 'success' : currentResult.taskScore >= 60 ? 'warning' : 'danger'}>
                {currentResult.taskScore}
              </Badge>
            </div>
            <div className="detail-list-box top-gap">
              <div>Elapsed: {elapsedSec}s</div>
              <div>Accuracy: {currentResult.accuracyPercent || 0}%</div>
              <div>Speed: {currentResult.cpm || 0} CPM</div>
              {currentTask.type === 'structured-form' ? null : <div>Completeness: {currentResult.completenessPercent || 0}%</div>}
              <div>Corrections: {corrections}</div>
              <div>Paste attempts: {pasteAttempts}</div>
            </div>
          </div>
        </div>
      )}
      rightContent={(
        <div className="answer-panel">
          <div className="panel-title">Your Input</div>
          {currentTask.type === 'structured-form' ? (
            <div className="form-stack">
              {currentTask.fields.map((field) => (
                <label key={field.key} className="input-block">
                  <span>{field.label}</span>
                  <input
                    className="text-input"
                    value={fieldValues[field.key] || ''}
                    onChange={(event) => {
                      if (!startedAtMs) setStartedAtMs(Date.now())
                      setDraftValue((prev) => ({
                        ...prev,
                        fieldValues: {
                          ...(prev.fieldValues || fieldValues),
                          [field.key]: event.target.value,
                        },
                      }))
                    }}
                    onPaste={(event) => {
                      setPasteAttempts((value) => value + 1)
                      preventAction(event, 'paste_attempt', `paste blocked in typing field ${field.key}`)
                    }}
                    onCopy={(event) => preventAction(event, 'copy_attempt', `copy blocked in typing field ${field.key}`)}
                    onCut={(event) => preventAction(event, 'copy_attempt', `cut blocked in typing field ${field.key}`)}
                    onDrop={(event) => {
                      setPasteAttempts((value) => value + 1)
                      preventAction(event, 'paste_attempt', `drop blocked in typing field ${field.key}`)
                    }}
                    onKeyDown={(event) => {
                      const key = event.key.toLowerCase()
                      if (key === 'backspace' || key === 'delete') setCorrections((value) => value + 1)
                      if ((event.ctrlKey || event.metaKey) && ['v', 'c', 'x', 'insert'].includes(key)) {
                        if (key === 'v') setPasteAttempts((value) => value + 1)
                        preventAction(event, key === 'v' ? 'paste_attempt' : 'copy_attempt', `blocked keyboard shortcut ${key}`)
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          ) : (
            <textarea
              className="text-area-surface"
              value={inputText}
              placeholder="Type the source text here."
              onChange={(event) => {
                if (!startedAtMs) setStartedAtMs(Date.now())
                setDraftValue({ inputText: event.target.value })
              }}
              onPaste={(event) => {
                setPasteAttempts((value) => value + 1)
                preventAction(event, 'paste_attempt', 'paste blocked in typing field')
              }}
              onCopy={(event) => preventAction(event, 'copy_attempt', 'copy blocked in typing field')}
              onCut={(event) => preventAction(event, 'copy_attempt', 'cut blocked in typing field')}
              onDrop={(event) => {
                setPasteAttempts((value) => value + 1)
                preventAction(event, 'paste_attempt', 'drop blocked in typing field')
              }}
              onKeyDown={(event) => {
                const key = event.key.toLowerCase()
                if (key === 'backspace' || key === 'delete') setCorrections((value) => value + 1)
                if ((event.ctrlKey || event.metaKey) && ['v', 'c', 'x', 'insert'].includes(key)) {
                  if (key === 'v') setPasteAttempts((value) => value + 1)
                  preventAction(event, key === 'v' ? 'paste_attempt' : 'copy_attempt', `blocked keyboard shortcut ${key}`)
                }
              }}
            />
          )}
          <div className="button-row top-gap">
            <button
              className="primary-button"
              disabled={saving || (currentTask.type === 'structured-form' ? countObjectCharacters(fieldValues) === 0 : !inputText.trim())}
              type="button"
              onClick={handleAdvance}
            >
              {saving ? 'Saving...' : isLast ? 'Complete Section' : 'Next Task'}
            </button>
          </div>
          {message ? <div className="inline-success top-gap">{message}</div> : null}
        </div>
      )}
    />
  )
}

export function DataTaskPage({ language = DEFAULT_LANGUAGE }) {
  const { session, submitAnswer, statusNode } = useAssessmentPageState(language)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  if (statusNode) return statusNode

  const task = session?.questionSet?.dataTask || {}
  const documents = task.documents || []
  const stored = session?.sectionResults?.['data-task']?.answer || {}
  const storedTasks = Array.isArray(stored.tasks) ? stored.tasks : []
  const currentIndex = clampStepIndex(stored.currentIndex, documents.length)
  const currentDocument = documents[currentIndex]
  const savedTaskResult = storedTasks.find((item) => item.documentId === currentDocument?.id) || {}
  const form = EXTRACTION_FIELDS.reduce((acc, field) => ({
    ...acc,
    [field.key]: draft[field.key] ?? savedTaskResult?.fieldValues?.[field.key] ?? '',
  }), {})
  const report = buildFieldReport(currentDocument?.expectedFields || {}, form)
  const isLast = currentIndex === documents.length - 1
  const previewRows = documentPreviewRows(currentDocument?.documentText || '')

  useEffect(() => {
    setDraft({})
    setMessage('')
  }, [currentIndex])

  if (!documents.length || !currentDocument) {
    return <div className="section-card inline-error">Document task is not available.</div>
  }

  async function handleAdvance() {
    setSaving(true)
    setMessage('')
    try {
      const nextTasks = [
        ...storedTasks.filter((item) => item.documentId !== currentDocument.id),
        {
          documentId: currentDocument.id,
          completedAt: new Date().toISOString(),
          fieldValues: form,
          report,
          taskScore: report.accuracyPercent,
        },
      ]
      await submitAnswer(
        'data-task',
        {
          currentIndex: isLast ? currentIndex : currentIndex + 1,
          tasks: nextTasks,
        },
        { completed: isLast },
      )
      setMessage(isLast ? 'Document section completed.' : 'The answer has been saved. Please continue to the next question.')
    } catch {
      setMessage(copy[language].assessmentErrors.upload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <RunnerWorkspace
      title="Section 4. Information extraction from business documents"
      subtitle="Review one Japanese document at a time and enter the requested fields accurately."
      leftContent={(
        <div className="stack-lg">
          <SectionTaskHeader
            eyebrow="Assessment Section"
            title={task.title || 'Information extraction'}
            description={task.instruction || 'Extract the required fields from each document.'}
            stepLabel="Current Document"
            currentIndex={currentIndex}
            total={documents.length}
          />
          <div className="section-card inset-card">
            <div className="eyebrow">{currentDocument.title || `Document ${currentIndex + 1}`}</div>
            <h3>{currentDocument.instruction || 'Review the source document carefully.'}</h3>
            <div className="document-preview-card top-gap">
              {previewRows.map((row) => (
                <div key={row.key} className={`document-preview-row ${row.label ? '' : 'single'}`.trim()}>
                  {row.label ? <span>{row.label}</span> : null}
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
            <div className="question-box top-gap document-source-block">{currentDocument.documentText || '...'}</div>
          </div>
        </div>
      )}
      rightContent={(
        <div className="answer-panel">
          <div className="panel-title">Extraction Form</div>
          <div className="form-stack">
            {EXTRACTION_FIELDS.map((field) => (
              <label key={field.key} className="input-block">
                <span>{field.label}</span>
                <input
                  className="text-input"
                  value={form[field.key] || ''}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="button-row top-gap">
            <button className="primary-button" disabled={saving || countObjectCharacters(form) === 0} type="button" onClick={handleAdvance}>
              {saving ? 'Saving...' : isLast ? 'Complete Section' : 'Next Document'}
            </button>
          </div>
          {message ? <div className="inline-success top-gap">{message}</div> : null}
        </div>
      )}
    />
  )
}

export function SubmitPage({ language = DEFAULT_LANGUAGE }) {
  const { session, endProctoring, finalizeSubmission, statusNode } = useAssessmentPageState(language)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const isReady = useMemo(() => session && Object.values(session.sectionResults).every((section) => section.completed), [session])
  if (statusNode) return statusNode

  async function handleSubmit() {
    setSubmitting(true)
    setMessage('')
    try {
      await endProctoring({ stepKey: 'submit' })
      await finalizeSubmission()
      window.setTimeout(() => {
        attemptCloseWindow()
      }, 500)
      setMessage('Assessment submitted successfully.')
    } catch (error) {
      setMessage(error.message || copy[language].assessmentErrors.incomplete)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AssessmentCardLayout
      eyebrow="Submit Confirmation"
      title="Xác nhận nộp bài"
      body="Kiểm tra trạng thái tổng phần trước khi nộp."
      asideTitle="Saved Records"
      asideItems={['Full-session proctoring video/audio', 'Typing + data task answers', 'Fullscreen/tab/copy-paste events']}
    >
      <div className="section-card inset-card top-gap">
        <SimpleTable columns={['Section', 'Status']} rows={Object.entries(session.sectionResults).map(([key, value]) => [key, value.completed ? 'Completed' : 'Incomplete'])} />
      </div>
      <div className="detail-list-box top-gap">
        <div>Proctoring chunks: {session.proctoring?.chunks?.length || 0}</div>
        <div>Fullscreen exits: {session.proctoring?.violations?.fullscreenExit || 0}</div>
        <div>Tab hidden: {session.proctoring?.violations?.tabHidden || 0}</div>
        <div>Paste attempts: {session.proctoring?.violations?.pasteAttempt || 0}</div>
      </div>
      <div className="button-row top-gap">
        <button className="primary-button" disabled={!isReady || submitting} type="button" onClick={handleSubmit}>
          {submitting ? 'Đang nộp...' : 'Nộp assessment'}
        </button>
      </div>
      {message ? <div className={isReady ? 'inline-success top-gap' : 'inline-error top-gap'}>{message}</div> : null}
      {!isReady ? <div className="inline-error top-gap">{copy[language].assessmentErrors.incomplete}</div> : null}
    </AssessmentCardLayout>
  )
}

export function CompletionPage({ language = DEFAULT_LANGUAGE }) {
  const { session, statusNode } = useAssessmentPageState(language)
  const [closing, setClosing] = useState(false)
  if (statusNode) return statusNode

  useEffect(() => {
    setClosing(true)
    const timer = window.setTimeout(() => {
      const closed = attemptCloseWindow()
      if (!closed) setClosing(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <AssessmentCardLayout
      eyebrow="Completion"
      title="Cảm ơn bạn đã hoàn thành bài assessment"
      body="Kết quả đã được ghi nhận thành công. Đội ngũ tuyển dụng sẽ xem xét và liên hệ lại sau."
      asideTitle="Bước tiếp theo"
      asideItems={[
        `Thời điểm nộp: ${session.submittedAt || 'Đang cập nhật...'}`,
        'Recruiter sẽ review toàn bộ bài làm và bằng chứng đi kèm.',
        'Nếu phù hợp, bạn sẽ nhận lịch cho vòng tiếp theo.',
      ]}
    >
      <div className="button-row top-gap">
        <button className="primary-button" type="button" onClick={attemptCloseWindow}>
          {closing ? 'Closing...' : 'Close Window'}
        </button>
        <Link className="ghost-button" to="/">Quay về trang chủ</Link>
      </div>
    </AssessmentCardLayout>
  )
}
