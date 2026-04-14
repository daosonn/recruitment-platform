import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createRecruiterJob,
  deleteRecruiterCandidate,
  deleteRecruiterJob,
  getRecruiterCandidate,
  getRecruiterJob,
  getRecruiterJobResults,
  getRecruiterJobs,
  getRecruiterReview,
  inviteApplication,
  overrideRecruiterReview,
  recomputeMatching,
  updateApplicationStage,
  updateRecruiterJob,
  updateRecruiterJobStatus,
  uploadJobCvs,
} from '../api'
import { ActivityRow, Badge, DetailPair, Modal, SectionHeader, SimpleTable, StatCard, TrashIcon } from '../components'
import { getStageMeta, jobStatusOptions, MATCHING_THRESHOLDS, stageOptions } from '../data'

const IMPORT_BLOCKED_JOB_STATUSES = new Set(['closed', 'filled', 'archived'])
const CANDIDATE_FACT_KEYS = new Set([
  'candidate name',
  'email',
  'phone',
  'japanese level',
  'full-time availability',
  'available start date',
])

function scoreTone(score) {
  if (score >= MATCHING_THRESHOLDS.green) return 'success'
  if (score >= MATCHING_THRESHOLDS.yellow) return 'warning'
  return 'danger'
}

function scoreLabel(score) {
  if (score >= MATCHING_THRESHOLDS.green) return 'Nên gửi test'
  if (score >= MATCHING_THRESHOLDS.yellow) return 'HR xem xét thêm'
  return 'Từ chối'
}

function jobStatusLabel(status) {
  switch (status) {
    case 'open':
      return 'Đang tuyển'
    case 'on_hold':
      return 'Tạm dừng'
    case 'closed':
      return 'Đã đóng'
    case 'filled':
      return 'Đã tuyển đủ'
    case 'archived':
      return 'Lưu trữ'
    default:
      return status
  }
}

function assessmentStatusLabel(status) {
  switch (status) {
    case 'not_started':
      return 'Chưa làm'
    case 'in_progress':
      return 'Đang làm'
    case 'completed':
      return 'Hoàn thành'
    default:
      return status || 'Chưa làm'
  }
}

function stageShortLabel(stage) {
  return getStageMeta(stage).shortLabel
}

function stageHint(stage) {
  return getStageMeta(stage).hint
}

function primaryActionForStage(stage) {
  switch (stage) {
    case 'applied':
    case 'cv_screening':
      return { label: 'Send test', note: 'Start assessment', variant: 'invite', kind: 'invite' }
    case 'assessment_invited':
      return { label: 'Send again', note: 'Re-send test link', variant: 'followup', kind: 'invite' }
    case 'assessment_in_progress':
      return { label: 'Remind', note: 'Copy test link again', variant: 'followup', kind: 'invite' }
    case 'assessment_completed':
    case 'shortlisted':
      return { label: 'Invite R2', note: 'Open round-2 email', variant: 'interview', kind: 'round2' }
    case 'under_review':
      return { label: 'Review', note: 'Check test result', variant: 'review', kind: 'review' }
    case 'final_interview':
      return { label: 'Send R2', note: 'Re-send interview email', variant: 'interview', kind: 'round2' }
    case 'expired':
    case 'abandoned':
      return { label: 'Re-open', note: 'Create fresh test link', variant: 'followup', kind: 'invite' }
    case 'hired':
      return { label: 'Hired', note: 'Process completed', variant: 'idle', kind: 'none', disabled: true }
    case 'rejected':
      return { label: 'Closed', note: 'Candidate closed', variant: 'idle', kind: 'none', disabled: true }
    default:
      return { label: 'Action', note: '', variant: 'idle', kind: 'none', disabled: true }
  }
}

function buildRound2Mail(candidate, job) {
  const subject = `[${job?.id || 'Job'}] Round 2 interview invitation`
  const body = [
    `Hello ${candidate?.name || 'Candidate'},`,
    '',
    `Thank you for completing the assessment for ${job?.title || 'the role'}.`,
    'We would like to invite you to the round 2 interview.',
    '',
    'Please reply with your availability for the next 2-3 business days.',
    '',
    'Best regards,',
    'Recruitment Team',
  ].join('\n')

  return `mailto:${encodeURIComponent(candidate?.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function StageBadge({ stage }) {
  const meta = getStageMeta(stage)
  return (
    <span className={`stage-pill tone-${meta.tone}`} title={meta.fullLabel}>
      {meta.shortLabel}
    </span>
  )
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function candidateOnlyFacts(rows = []) {
  return rows.filter((row) => {
    const key = `${row?.[0] || ''}`.trim().toLowerCase()
    return CANDIDATE_FACT_KEYS.has(key)
  })
}

function jobReferenceRows(candidate) {
  const hardCriteria = `${candidate?.matching?.hardCriteria || ''}`.trim()
  const softCriteria = `${candidate?.matching?.softCriteria || ''}`.trim()
  return [
    ['Applied Role (Job)', candidate?.role || '-'],
    ['Required Conditions (Job)', candidate?.matching?.requiredConditions || '-'],
    ['Hard Criteria (JD)', hardCriteria ? `${hardCriteria.slice(0, 180)}${hardCriteria.length > 180 ? '...' : ''}` : '-'],
    ['Soft Criteria (JD)', softCriteria ? `${softCriteria.slice(0, 180)}${softCriteria.length > 180 ? '...' : ''}` : '-'],
  ]
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return `${value}`
}

function humanizeKey(value = '') {
  return `${value}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function answerRows(answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return []
  return Object.entries(answer).map(([key, value]) => [humanizeKey(key), formatDisplayValue(value)])
}

function averageScore(rows = [], columnIndex, fallback = null) {
  const values = rows
    .map((row) => Number(row?.[columnIndex]))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return fallback
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function formatDateTime(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return `${value}`
  return parsed.toLocaleString('vi-VN')
}

function reviewScoreRowMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [`${row?.[0] || ''}`, row]))
}

function CandidateProfileModalContent({ candidate, result, onOpenMatching, onOpenReview }) {
  const facts = candidateOnlyFacts(candidate?.parsedFacts || [])
  const matchingRows = candidate?.matching?.requirementRows || []

  return (
    <div className="stack-lg">
      <div className="candidate-summary-grid">
        <div className="section-card inset-card">
          <div className="section-header-inline">
            <div>
              <div className="eyebrow">Candidate Overview</div>
              <h3 className="modal-title-tight">{candidate.name}</h3>
              <p className="lead compact">{candidate.role || 'Ung vien'}</p>
            </div>
            <div className="badge-row wrap">
              <Badge tone={scoreTone(candidate.matchScore || 0)}>{candidate.matchScore || 0}</Badge>
              <StageBadge stage={candidate.stage} />
              {result?.finalReviewedScore !== null && result?.finalReviewedScore !== undefined ? (
                <Badge tone={scoreTone(result.finalReviewedScore)}>{result.finalReviewedScore} test</Badge>
              ) : null}
            </div>
          </div>
          <p className="lead compact">{candidate.summary || candidate.cvSummary || 'Chua co tom tat ung vien.'}</p>
          <div className="detail-grid">
            <DetailPair label="Email" value={formatDisplayValue(candidate.email)} />
            <DetailPair label="Phone" value={formatDisplayValue(candidate.phone)} />
            <DetailPair label="Japanese Level" value={formatDisplayValue(candidate.japaneseLevel)} />
            <DetailPair label="Start Date" value={formatDisplayValue(candidate.startDate)} />
            <DetailPair label="Recommendation" value={formatDisplayValue(candidate.recommendation)} />
            <DetailPair label="Risk" value={formatDisplayValue(candidate.risk)} />
          </div>
          <div className="button-row wrap top-gap">
            {candidate.cvFilePath ? (
              <a className="ghost-button small" href={`http://localhost:3001${candidate.cvFilePath}`} target="_blank" rel="noreferrer">
                Mo CV goc
              </a>
            ) : null}
            <button className="ghost-button small" onClick={() => onOpenMatching(candidate.id)} type="button">
              Xem matching
            </button>
            {result?.attemptId ? (
              <button className="primary-button small" onClick={() => onOpenReview(result.attemptId)} type="button">
                Xem bai test
              </button>
            ) : null}
          </div>
        </div>

        <div className="section-card inset-card">
          <SectionHeader
            eyebrow="Candidate Facts"
            title="Du lieu ung vien trich tu CV"
            body="Chi hien thong tin cua ung vien, khong tron voi noi dung JD."
          />
          <SimpleTable columns={['Field', 'Value']} rows={facts.length ? facts : [['Status', 'Chua co du lieu CV chuan hoa']]} />
        </div>
      </div>

      <div className="candidate-summary-grid">
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Job Reference" title="Thong tin doi chieu voi JD" body="Phuc vu matching score va screening." />
          <SimpleTable columns={['Reference', 'Value']} rows={jobReferenceRows(candidate)} />
        </div>
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Matching Snapshot" title="Bang matching nhanh" body="Click vao diem Match o bang danh sach de mo modal rieng." />
          <SimpleTable
            columns={['Requirement', 'Evidence', 'State']}
            rows={matchingRows.length ? matchingRows : [['Status', 'Chua co matching detail', '-']]}
          />
        </div>
      </div>

      <div className="section-card inset-card">
        <SectionHeader eyebrow="CV Summary" title="Tom tat CV" body="Thong tin tong hop tu file CV va phan tich pipeline." />
        <p className="lead compact">{candidate.cvSummary || candidate.summary || 'Chua co tom tat CV.'}</p>
      </div>

      <div className="candidate-summary-grid">
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Activity" title="Nhat ky ung vien" body="Moc CV, test va cac su kien lien quan." />
          <div className="inline-progress">
            {(candidate.activity || []).length ? (
              candidate.activity.map((item) => <ActivityRow key={`${item.title}-${item.time}`} title={item.title} note={formatDateTime(item.time)} />)
            ) : (
              <div className="empty-state">Chua co activity log.</div>
            )}
          </div>
        </div>
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Stored Records" title="Ho so luu tru" body="Ghi chu va ban ghi lien quan toi ung vien." />
          <ul className="detail-list">
            {(candidate.storedRecords || []).length ? (
              candidate.storedRecords.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>Chua co ban ghi bo sung.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

function AssessmentReviewBody({ review, rows, setRows, message, onSave, saving = false }) {
  const scoreLookup = reviewScoreRowMap(rows)
  const confirmationRows = Object.entries(review.candidateConfirmation || {}).map(([key, value]) => [humanizeKey(key), formatDisplayValue(value)])

  return (
    <div className="stack-lg">
      <div className="review-summary">
        <StatCard label="AI Score" value={`${review.aiScore}`} note={`Recommendation: ${review.aiRecommendation}`} />
        <StatCard label="HR Score" value={`${review.hrAdjustedScore}`} note="Editable by recruiter" />
        <StatCard label="Final Score" value={`${review.finalReviewedScore}`} note="Shown on candidate list" />
        <StatCard label="Risk" value={review.riskLevel} note="Support signal only" />
      </div>

      <div className="candidate-summary-grid">
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Assessment Meta" title="Thong tin bai test" body="Tong quan lan lam bai cua ung vien." />
          <div className="detail-grid">
            <DetailPair label="Candidate" value={formatDisplayValue(review.candidateName)} />
            <DetailPair label="Job" value={formatDisplayValue(review.jobTitle)} />
            <DetailPair label="Submitted At" value={formatDateTime(review.submittedAt)} />
            <DetailPair
              label="Duration"
              value={review.proctoring?.startedAt && review.proctoring?.endedAt
                ? `${Math.max(1, Math.round((new Date(review.proctoring.endedAt) - new Date(review.proctoring.startedAt)) / 60000))} min`
                : '-'}
            />
          </div>
        </div>
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Candidate Confirmation" title="Thong tin ung vien xac nhan" body="Co the doi chieu voi CV/JD neu can." />
          <SimpleTable columns={['Field', 'Value']} rows={confirmationRows.length ? confirmationRows : [['Status', 'Chua co thong tin xac nhan']]} />
        </div>
      </div>

      <div className="candidate-summary-grid">
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Suspicious Signals" title="Cac tin hieu can review" body="Dung lam co so support, khong thay cho quyet dinh HR." />
          <SimpleTable columns={['Signal', 'Status']} rows={(review.suspiciousSignals || []).length ? review.suspiciousSignals : [['Status', 'Khong co du lieu']]} />
        </div>
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Media" title="Mo file ghi hinh/ghi am" body="Bao gom bai noi, reading aloud va chunk proctoring." />
          <div className="button-row wrap">
            {(review.media || []).length ? (
              review.media.map((item) => (
                <a key={item.sectionKey} className="ghost-button small" href={`http://localhost:3001${item.media.path}`} target="_blank" rel="noreferrer">
                  Open {item.sectionKey}
                </a>
              ))
            ) : (
              <div className="empty-state">Chua co media de mo.</div>
            )}
          </div>
        </div>
      </div>

      <div className="section-card inset-card">
        <SectionHeader eyebrow="Score Override" title="Bang diem matching voi review HR" body="Sua diem HR tung phan neu can, diem tong se cap nhat theo bang nay." />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>AI</th>
                <th>HR</th>
                <th>Final</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>
                    <input
                      className="text-input"
                      value={row[2]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], event.target.value, item[3], item[4]] : item)))}
                    />
                  </td>
                  <td>
                    <input
                      className="text-input"
                      value={row[3]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], item[2], event.target.value, item[4]] : item)))}
                    />
                  </td>
                  <td>
                    <input
                      className="text-input"
                      value={row[4]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], item[2], item[3], event.target.value] : item)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row wrap top-gap">
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? 'Dang luu...' : 'Luu diem HR'}
          </button>
          <Badge tone="neutral">HR avg: {averageScore(rows, 2, review.hrAdjustedScore) ?? '-'}</Badge>
          <Badge tone="neutral">Final avg: {averageScore(rows, 3, review.finalReviewedScore) ?? '-'}</Badge>
        </div>
        {message ? <div className="inline-success top-gap">{message}</div> : null}
      </div>

      {(review.sectionDetails || []).map((section) => {
        const scoreRow = scoreLookup[section.label]
        const structuredAnswerRows = answerRows(section.answer)
        const plainAnswer = typeof section.answer === 'string' ? section.answer : ''

        return (
          <div key={section.key} className="section-card inset-card">
            <div className="section-header-inline">
              <div>
                <div className="eyebrow">{section.label}</div>
                <h3 className="modal-title-tight">{section.overview || section.label}</h3>
              </div>
              <div className="badge-row wrap">
                <Badge tone={section.completed ? 'success' : 'warning'}>{section.completed ? 'Completed' : 'Incomplete'}</Badge>
                {scoreRow ? <Badge tone={scoreTone(Number(scoreRow[3]) || Number(scoreRow[1]) || 0)}>{scoreRow[3] || scoreRow[1]}</Badge> : null}
              </div>
            </div>

            {section.instruction ? <p className="lead compact">{section.instruction}</p> : null}
            {section.prompts?.length ? (
              <div>
                <div className="section-subtitle">Questions</div>
                <ul className="detail-list">
                  {section.prompts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {section.content ? (
              <div>
                <div className="section-subtitle">Source Content</div>
                <pre className="answer-surface">{section.content}</pre>
              </div>
            ) : null}
            {section.dataTable ? (
              <div>
                <div className="section-subtitle">Task Data</div>
                <SimpleTable columns={section.dataTable.columns || []} rows={section.dataTable.rows || []} />
                {section.dataTable.expectedHint ? <div className="row-subtitle top-gap">Expected hint: {section.dataTable.expectedHint}</div> : null}
              </div>
            ) : null}
            <div>
              <div className="section-subtitle">Candidate Response</div>
              {structuredAnswerRows.length ? (
                <SimpleTable columns={['Field', 'Value']} rows={structuredAnswerRows} />
              ) : plainAnswer ? (
                <pre className="answer-surface">{plainAnswer}</pre>
              ) : (
                <div className="empty-state">Khong co cau tra loi text cho phan nay.</div>
              )}
            </div>
            {section.media?.path ? (
              <div className="button-row top-gap">
                <a className="ghost-button small" href={`http://localhost:3001${section.media.path}`} target="_blank" rel="noreferrer">
                  Mo media cua phan nay
                </a>
              </div>
            ) : null}
          </div>
        )
      })}

      {(review.transcriptSnippets || []).length ? (
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Transcript" title="Trich doan transcript / notes" body="Dung de review nhanh noi dung bai noi va ghi chu danh gia." />
          <div className="stack-sm">
            {review.transcriptSnippets.map((item, index) => (
              <div key={`${item.who}-${index}`} className="answer-surface">
                <div className="transcript-who">{item.who}</div>
                <div>{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(review.overrideHistory || []).length ? (
        <div className="section-card inset-card">
          <SectionHeader eyebrow="Audit Trail" title="Lich su override" body="Luu vet thay doi cua recruiter." />
          <div className="stack-sm">
            {review.overrideHistory.map((item, index) => (
              <ActivityRow key={`${item.at}-${index}`} title={`${item.by} - ${item.summary}`} note={formatDateTime(item.at)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function RecruiterLogin({ title, body }) {
  return (
    <div className="login-layout">
      <section className="login-panel">
        <div className="eyebrow">Secure Access</div>
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="form-stack">
          <label className="input-block">
            <span>Work email</span>
            <input className="text-input" defaultValue="hr.ops@altiuslink.vn" />
          </label>
          <label className="input-block">
            <span>Password</span>
            <input className="text-input" type="password" defaultValue="123456" />
          </label>
          <Link className="primary-button" to="/recruiter/dashboard">
            Sign In
          </Link>
        </div>
      </section>
      <section className="login-side">
        <div className="login-side-card">
          <ul className="detail-list">
            <li>Quản lý JD và pipeline theo từng job.</li>
            <li>Upload CV theo job, lưu CV gốc và đánh giá matching.</li>
            <li>Gui link test, review ket qua va ra quyet dinh cuoi cung.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

export function RecruiterDashboard() {
  const [payload, setPayload] = useState({ jobs: [] })

  useEffect(() => {
    getRecruiterJobs().then(setPayload).catch(() => setPayload({ jobs: [] }))
  }, [])

  const jobs = useMemo(() => payload.jobs || [], [payload.jobs])
  const metrics = useMemo(() => {
    const activeJobs = jobs.filter((job) => job.status === 'open').length
    const totalApplicants = jobs.reduce((sum, job) => sum + (job.applicantCount || 0), 0)
    const waitingReview = jobs.reduce((sum, job) => sum + (job.candidateStageCounts?.under_review || 0), 0)
    return [
      { label: 'Active Jobs', value: `${activeJobs}`, note: 'Job dang mo', tone: 'warning' },
      { label: 'Total CVs', value: `${totalApplicants}`, note: 'Tổng CV đã import', tone: 'neutral' },
      { label: 'Waiting Review', value: `${waitingReview}`, note: 'Ứng viên chờ review', tone: 'success' },
      {
        label: 'Closed / Filled',
        value: `${jobs.filter((job) => ['closed', 'filled'].includes(job.status)).length}`,
        note: 'Job đã đóng/tuyển đủ',
        tone: 'danger',
      },
    ]
  }, [jobs])

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Recruiter Dashboard"
        title="Tổng quan vận hành tuyển dụng theo job"
        body="Theo dõi danh mục job, trạng thái tuyển dụng và khối lượng ứng viên cần xử lý."
      />
      <div className="metric-grid">
        {metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} tone={metric.tone} />
        ))}
      </div>
      <div className="section-card">
        <SimpleTable
          columns={['Job', 'Owner', 'Applicants', 'Avg Match', 'Status']}
          rows={jobs.map((job) => [job.id, job.owner, `${job.applicantCount || 0}`, `${job.avgMatchScore || 0}`, jobStatusLabel(job.status)])}
        />
        <div className="button-row top-gap">
          <Link className="primary-button small" to="/recruiter/jobs">
            Mở danh sách Jobs
          </Link>
        </div>
      </div>
    </div>
  )
}

export function RecruiterJobs() {
  const navigate = useNavigate()
  const [payload, setPayload] = useState({ jobs: [] })
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    id: '',
    title: '',
    owner: 'HR Team',
    headcount: 1,
    jdText: '',
  })

  async function loadJobs() {
    setPayload(await getRecruiterJobs())
  }

  useEffect(() => {
    loadJobs().catch(() => setPayload({ jobs: [] }))
  }, [])

  async function handleCreate() {
    setCreating(true)
    setMessage('')
    try {
      await createRecruiterJob({
        ...form,
        id: form.id.trim().toUpperCase(),
        title: form.title.trim(),
        jdText: form.jdText.trim(),
      })
      setMessage('Tạo job thành công.')
      setForm({
        id: '',
        title: '',
        owner: 'HR Team',
        headcount: 1,
        jdText: '',
      })
      await loadJobs()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteJob(jobId) {
    const confirmed = window.confirm(`Xoa job ${jobId}? Hanh dong nay se xoa toan bo ung vien, ket qua test va du lieu lien quan.`)
    if (!confirmed) return
    setMessage('')
    try {
      await deleteRecruiterJob(jobId)
      setMessage(`Da xoa job ${jobId}.`)
      await loadJobs()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const filteredJobs = useMemo(() => {
    const jobs = payload.jobs || []
    if (statusFilter === 'all') return jobs
    return jobs.filter((job) => job.status === statusFilter)
  }, [payload.jobs, statusFilter])

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Jobs"
        title="Quản lý theo từng job"
        body="Click trực tiếp vào dòng job để mở Job Detail, chỉnh JD, upload CV và chạy pipeline."
      />

      <div className="section-card">
        <div className="form-grid">
          <label className="input-block">
            <span>Job Code</span>
            <input
              className="text-input"
              value={form.id}
              onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value.toUpperCase() }))}
            />
          </label>
          <label className="input-block">
            <span>Title</span>
            <input
              className="text-input"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="input-block">
            <span>Owner</span>
            <input
              className="text-input"
              value={form.owner}
              onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
            />
          </label>
          <label className="input-block">
            <span>Headcount</span>
            <input
              className="text-input"
              type="number"
              min="1"
              value={form.headcount}
              onChange={(event) => setForm((prev) => ({ ...prev, headcount: Number(event.target.value || 1) }))}
            />
          </label>
        </div>
        <label className="input-block top-gap">
          <span>JD Text</span>
          <textarea
            className="text-area-surface compact"
            value={form.jdText}
            onChange={(event) => setForm((prev) => ({ ...prev, jdText: event.target.value }))}
            placeholder="Nhập JD tóm tắt ngay tại màn tạo job..."
          />
        </label>
        <div className="button-row top-gap">
          <button
            className="primary-button small"
            disabled={!form.id.trim() || !form.title.trim() || creating}
            onClick={handleCreate}
            type="button"
          >
            {creating ? 'Đang tạo...' : 'Tạo job'}
          </button>
        </div>
        {message ? <div className="inline-success top-gap">{message}</div> : null}
      </div>

      <div className="section-card">
        <div className="button-row wrap">
          <button
            className={`ghost-button small ${statusFilter === 'all' ? 'active-filter' : ''}`}
            onClick={() => setStatusFilter('all')}
            type="button"
          >
            Tất cả
          </button>
          {jobStatusOptions.map((status) => (
            <button
              key={status}
              className={`ghost-button small ${statusFilter === status ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {jobStatusLabel(status)}
            </button>
          ))}
        </div>
        <div className="table-wrap top-gap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Requisition</th>
                <th>Role</th>
                <th>Owner</th>
                <th>Headcount</th>
                <th>Applicants</th>
                <th>Status</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  className="clickable-row"
                  onClick={() => navigate(`/recruiter/jobs/${job.id.toLowerCase()}`)}
                >
                  <td>{job.id}</td>
                  <td>{job.title}</td>
                  <td>{job.owner}</td>
                  <td>{job.headcount}</td>
                  <td>{job.applicantCount || 0}</td>
                  <td>
                    <Badge tone={job.status === 'open' ? 'success' : 'neutral'}>{jobStatusLabel(job.status)}</Badge>
                  </td>
                  <td>
                    <button
                      aria-label={`Delete ${job.id}`}
                      className="icon-button danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteJob(job.id)
                      }}
                      title="Xoa job"
                      type="button"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function RecruiterJobDetail() {
  const navigate = useNavigate()
  const { jobId: rawJobId } = useParams()
  const jobId = rawJobId?.toUpperCase() || 'JD-9921'
  const [job, setJob] = useState(null)
  const [resultMap, setResultMap] = useState({})
  const [message, setMessage] = useState('')
  const [analysisHint, setAnalysisHint] = useState('')
  const [recomputing, setRecomputing] = useState(false)
  const [cvFiles, setCvFiles] = useState([])
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [candidateDetail, setCandidateDetail] = useState(null)
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false)
  const [candidateDetailError, setCandidateDetailError] = useState('')
  const [matchingCandidateId, setMatchingCandidateId] = useState('')
  const [matchingCandidate, setMatchingCandidate] = useState(null)
  const [matchingCandidateLoading, setMatchingCandidateLoading] = useState(false)
  const [matchingCandidateError, setMatchingCandidateError] = useState('')
  const [reviewAttemptId, setReviewAttemptId] = useState('')
  const [reviewPayload, setReviewPayload] = useState(null)
  const [reviewRows, setReviewRows] = useState([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')
  const [editForm, setEditForm] = useState({ title: '', jpLevel: '', jdText: '' })

  async function loadJob() {
    const [jobPayload, resultPayload] = await Promise.all([
      getRecruiterJob(jobId),
      getRecruiterJobResults(jobId),
    ])
    setJob(jobPayload)
    setResultMap(resultPayload.results || {})
    setEditForm({
      title: jobPayload.title || '',
      jpLevel: jobPayload.jpLevel || '',
      jdText: jobPayload.jdText || '',
    })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([getRecruiterJob(jobId), getRecruiterJobResults(jobId)])
      .then(([jobPayload, resultPayload]) => {
        if (cancelled) return
        setJob(jobPayload)
        setResultMap(resultPayload.results || {})
        setEditForm({
          title: jobPayload.title || '',
          jpLevel: jobPayload.jpLevel || '',
          jdText: jobPayload.jdText || '',
        })
      })
      .catch(() => {
        if (!cancelled) setJob(null)
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  if (!job) {
    return <div className="section-card inline-error">Không tìm thấy dữ liệu job.</div>
  }

  const stageCards = stageOptions.map((stage) => ({
    key: stage,
    count: Number(job.candidateStageCounts?.[stage] || 0),
    meta: getStageMeta(stage),
  }))
  const isImportBlocked = IMPORT_BLOCKED_JOB_STATUSES.has(job.status)
  const candidateCount = (job.candidates || []).length

  async function handleSaveJob() {
    try {
      await updateRecruiterJob(job.id, editForm)
      setMessage('Đã cập nhật thông tin job/JD.')
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleUploadCvs() {
    if (!cvFiles.length) return
    if (isImportBlocked) {
      setMessage('Job hiện không cho import CV mới. Hãy Re-open job trước.')
      return
    }
    try {
      const uploaded = await uploadJobCvs(job.id, cvFiles)
      const created = Number(uploaded.createdCount || 0)
      if (!created) {
        setMessage('Upload thành công nhưng không tạo được hồ sơ ứng viên. Vui lòng kiểm tra file CV.')
        return
      }
      setMessage(`Đã upload ${created} CV. Bạn có thể bấm Recompute matching ngay.`)
      setCvFiles([])
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleRecompute() {
    setRecomputing(true)
    setMessage('')
    setAnalysisHint('AI đang chuẩn bị dữ liệu matching...')
    try {
      if (!candidateCount && !cvFiles.length) {
        setMessage('Chưa có ứng viên cho job này. Hãy upload CV trước.')
        return
      }
      let autoUploaded = 0
      if (cvFiles.length) {
        if (isImportBlocked) {
          setMessage('Job hiện không cho import CV mới. Hãy Re-open job trước.')
          return
        }
        setAnalysisHint('Đang upload CV trước khi phân tích...')
        const uploaded = await uploadJobCvs(job.id, cvFiles)
        autoUploaded = Number(uploaded.createdCount || 0)
        setCvFiles([])
      }
      setAnalysisHint('AI đang phân tích CV và so sánh với JD...')
      const result = await recomputeMatching(job.id)
      const processed = Number(result.processedCount || 0)
      const uploadNote = autoUploaded ? ` (auto-upload ${autoUploaded} CV)` : ''
      setMessage(`Đã cập nhật matching cho ${processed} ứng viên${uploadNote}.`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setRecomputing(false)
      setAnalysisHint('')
    }
  }

  async function handleStatusChange(status) {
    try {
      await updateRecruiterJobStatus(job.id, status)
      setMessage(`Đã cập nhật trạng thái job: ${jobStatusLabel(status)}.`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleDeleteJob() {
    const confirmed = window.confirm(`Xoa job ${job.id}? Hanh dong nay se xoa toan bo ung vien va du lieu lien quan.`)
    if (!confirmed) return
    setMessage('')
    try {
      await deleteRecruiterJob(job.id)
      navigate('/recruiter/jobs')
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleInvite(applicationId) {
    try {
      const invite = await inviteApplication(applicationId)
      const copied = await copyText(invite.testLink)
      setMessage(copied ? `Đã tạo link test và copy: ${invite.testLink}` : `Đã tạo link test: ${invite.testLink}`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleRound2Invite(candidate) {
    if (!candidate?.email) {
      setMessage('Ung vien chua co email de mo thu moi PV2.')
      return
    }
    try {
      if (candidate.stage !== 'final_interview') {
        await updateApplicationStage(candidate.applicationId, 'final_interview')
      }
      window.location.href = buildRound2Mail(candidate, job)
      setMessage(`Da mo thu moi PV2 cho ${candidate.name}.`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handlePrimaryAction(candidate, result) {
    const action = primaryActionForStage(candidate.stage, result)
    if (action.disabled || action.kind === 'none') return
    if (action.kind === 'invite') {
      await handleInvite(candidate.applicationId)
      return
    }
    if (action.kind === 'round2') {
      await handleRound2Invite(candidate)
      return
    }
    if (action.kind === 'review') {
      if (result?.attemptId) {
        await handleOpenReview(result.attemptId)
      } else {
        setMessage('Ung vien chua co bai test de review.')
      }
    }
  }

  async function handleStageChange(applicationId, stage) {
    try {
      await updateApplicationStage(applicationId, stage)
      setMessage(`Da cap nhat stage sang ${stageShortLabel(stage)}.`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleDeleteCandidate(candidateId, candidateName = '') {
    const confirmed = window.confirm(`Xoa ung vien ${candidateName || candidateId}?`)
    if (!confirmed) return
    setMessage('')
    try {
      await deleteRecruiterCandidate(candidateId)
      if (selectedCandidateId === candidateId) {
        setSelectedCandidateId('')
        setCandidateDetail(null)
        setCandidateDetailError('')
      }
      if (matchingCandidateId === candidateId) {
        setMatchingCandidateId('')
        setMatchingCandidate(null)
        setMatchingCandidateError('')
      }
      if (reviewPayload?.candidateId === candidateId) {
        setReviewAttemptId('')
        setReviewPayload(null)
        setReviewRows([])
        setReviewError('')
        setReviewMessage('')
      }
      setMessage(`Da xoa ung vien ${candidateName || candidateId}.`)
      await loadJob()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleOpenCandidateDetail(candidateId) {
    setSelectedCandidateId(candidateId)
    setCandidateDetail(null)
    setCandidateDetailError('')
    setCandidateDetailLoading(true)
    try {
      const payload = await getRecruiterCandidate(candidateId)
      setCandidateDetail(payload)
    } catch (error) {
      setCandidateDetailError(error.message)
    } finally {
      setCandidateDetailLoading(false)
    }
  }

  async function handleOpenMatching(candidateId) {
    setMatchingCandidateId(candidateId)
    setMatchingCandidate(candidateDetail?.id === candidateId ? candidateDetail : null)
    setMatchingCandidateError('')
    const shouldLoad = candidateDetail?.id !== candidateId
    setMatchingCandidateLoading(shouldLoad)
    if (!shouldLoad) return
    try {
      const payload = await getRecruiterCandidate(candidateId)
      setMatchingCandidate(payload)
    } catch (error) {
      setMatchingCandidateError(error.message)
    } finally {
      setMatchingCandidateLoading(false)
    }
  }

  async function handleOpenReview(attemptId) {
    if (!attemptId) return
    setReviewAttemptId(attemptId)
    setReviewPayload(null)
    setReviewRows([])
    setReviewError('')
    setReviewMessage('')
    setReviewLoading(true)
    try {
      const payload = await getRecruiterReview(attemptId)
      setReviewPayload(payload)
      setReviewRows(payload.scoreComparison || [])
    } catch (error) {
      setReviewError(error.message)
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleSaveReview() {
    if (!reviewAttemptId) return
    setReviewSaving(true)
    setReviewError('')
    setReviewMessage('')
    try {
      const hrAdjustedScore = averageScore(reviewRows, 2, reviewPayload?.hrAdjustedScore)
      const finalReviewedScore = averageScore(reviewRows, 3, reviewPayload?.finalReviewedScore)
      const saved = await overrideRecruiterReview(reviewAttemptId, {
        scoreComparison: reviewRows,
        hrAdjustedScore,
        finalReviewedScore,
        reason: 'Updated from recruiter candidate list modal',
      })
      setReviewPayload(saved.review)
      setReviewRows(saved.review.scoreComparison || [])
      setReviewMessage('Da luu diem HR va final score.')
      await loadJob()
    } catch (error) {
      setReviewError(error.message)
    } finally {
      setReviewSaving(false)
    }
  }

  return (
    <div className="stack-lg">
      <div className="section-card">
        <div className="eyebrow">Jobs / Job Detail</div>
        <h1>
          {job.id} - {job.title}
        </h1>
        <p className="lead">
          Workspace chính của HR: chỉnh JD, upload CV theo job, chạy matching, copy link test và theo dõi trạng thái làm bài.
        </p>
        <div className="test-link-strip top-gap">
          <strong>Link test cố định:</strong>
          <span>{job.testLink || 'http://localhost:5173/#/assessment-entry'}</span>
          <button
            className="ghost-button small"
            onClick={() => copyText(job.testLink || 'http://localhost:5173/#/assessment-entry')}
            type="button"
          >
            Copy link
          </button>
          <Badge tone={job.status === 'open' ? 'success' : 'neutral'}>{jobStatusLabel(job.status)}</Badge>
        </div>
        <div className="button-row top-gap wrap">
          <button className="ghost-button small" onClick={() => handleStatusChange('closed')} type="button">
            Close Job
          </button>
          <button className="ghost-button small" onClick={() => handleStatusChange('filled')} type="button">
            Mark Filled
          </button>
          <button className="ghost-button small" onClick={() => handleStatusChange('archived')} type="button">
            Archive
          </button>
          <button className="ghost-button small" onClick={() => handleStatusChange('open')} type="button">
            Re-open
          </button>
          <button
            aria-label={`Delete job ${job.id}`}
            className="icon-button danger"
            onClick={handleDeleteJob}
            title="Xoa job"
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="section-card">
          <div className="form-stack">
            <label className="input-block">
              <span>Job title</span>
              <input
                className="text-input"
                value={editForm.title}
                onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="input-block">
              <span>Japanese level</span>
              <input
                className="text-input"
                value={editForm.jpLevel}
                onChange={(event) => setEditForm((prev) => ({ ...prev, jpLevel: event.target.value }))}
              />
            </label>
            <label className="input-block">
              <span>JD text</span>
              <textarea
                className="text-area-surface compact"
                value={editForm.jdText}
                onChange={(event) => setEditForm((prev) => ({ ...prev, jdText: event.target.value }))}
              />
            </label>
            <button className="primary-button small" onClick={handleSaveJob} type="button">
              Lưu job/JD
            </button>
          </div>
        </div>
        <div className="section-card">
          <div className="form-stack">
            <label className="input-block">
              <span>Upload CV theo job</span>
              <input
                className="text-input"
                multiple
                type="file"
                accept=".pdf,.docx"
                disabled={isImportBlocked}
                onChange={(event) => setCvFiles(Array.from(event.target.files || []))}
              />
            </label>
            <div className="button-row wrap">
              <button
                className="ghost-button small"
                disabled={!cvFiles.length || isImportBlocked || recomputing}
                onClick={handleUploadCvs}
                type="button"
              >
                Upload CV
              </button>
              <button
                className="primary-button small"
                disabled={recomputing || (!cvFiles.length && candidateCount === 0)}
                onClick={handleRecompute}
                type="button"
              >
                {recomputing ? 'AI đang phân tích...' : 'Recompute matching'}
              </button>
            </div>
            {recomputing ? (
              <div className="inline-progress">
                <span className="loading-spinner" />
                <span>{analysisHint || 'AI đang phân tích CV, vui lòng chờ...'}</span>
              </div>
            ) : null}
            {!cvFiles.length && candidateCount === 0 && !isImportBlocked ? (
              <div className="inline-error">Chưa có ứng viên để tính matching. Vui lòng upload CV trước.</div>
            ) : null}
            {isImportBlocked ? (
              <div className="inline-error">Job đang ở trạng thái đóng/tuyển đủ/lưu trữ nên không nhận CV mới.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="section-card">
          <SectionHeader
            eyebrow="Pipeline"
            title="Stage overview"
            body="Short stage labels keep the recruiter board easy to scan."
          />
          <div className="stage-summary-grid">
            {stageCards.map(({ key, count, meta }) => (
              <div key={key} className={`stage-stat-card tone-${meta.tone}`}>
                <div className="stage-stat-top">
                  <StageBadge stage={key} />
                  <strong>{count}</strong>
                </div>
                <div className="stage-stat-label">{meta.fullLabel}</div>
                <div className="stage-stat-hint">{meta.hint}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-card">
          <div className="stack-sm">
            <DetailPair
              label="Chưa làm"
              value={`${Object.values(resultMap).filter((item) => item.assessmentStatus === 'not_started').length}`}
            />
            <DetailPair
              label="Đang làm"
              value={`${Object.values(resultMap).filter((item) => item.assessmentStatus === 'in_progress').length}`}
            />
            <DetailPair
              label="Hoàn thành"
              value={`${Object.values(resultMap).filter((item) => item.assessmentStatus === 'completed').length}`}
            />
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Match</th>
                <th>Recommendation</th>
                <th>Assessment</th>
                <th>Stage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(job.candidates || []).map((candidate) => {
                const result = resultMap[candidate.applicationId] || { assessmentStatus: 'not_started' }
                const stageMeta = getStageMeta(candidate.stage)
                const primaryAction = primaryActionForStage(candidate.stage, result)
                return (
                  <tr key={candidate.applicationId}>
                    <td>{candidate.name}</td>
                    <td>
                      <button className="score-chip-button" onClick={() => handleOpenMatching(candidate.id)} type="button">
                        <Badge tone={scoreTone(candidate.matchScore)}>{candidate.matchScore}</Badge>
                        <span className="score-chip-meta">Xem matching</span>
                      </button>
                    </td>
                    <td>{scoreLabel(candidate.matchScore)}</td>
                    <td>
                      {result.attemptId ? (
                        <button className="score-chip-button" onClick={() => handleOpenReview(result.attemptId)} type="button">
                          <Badge tone={scoreTone(Number(result.finalReviewedScore) || 0)}>
                            {result.finalReviewedScore ?? 'Open'}
                          </Badge>
                          <span className="score-chip-meta">{assessmentStatusLabel(result.assessmentStatus)}</span>
                        </button>
                      ) : (
                        <div className="table-cell-stack">
                          <span>{assessmentStatusLabel(result.assessmentStatus)}</span>
                          <span className="cell-caption">Chua co diem test</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="stage-cell">
                        <div className="stage-cell-top">
                          <StageBadge stage={candidate.stage} />
                          <span className="stage-full-label">{stageMeta.fullLabel}</span>
                        </div>
                        <div className={`stage-select-wrap tone-${stageMeta.tone}`}>
                          <select
                            className="stage-select"
                            value={candidate.stage}
                            onChange={(event) => handleStageChange(candidate.applicationId, event.target.value)}
                          >
                            {stageOptions.map((stage) => (
                              <option key={stage} value={stage}>
                                {stageShortLabel(stage)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="stage-hint-text">{stageHint(candidate.stage)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <div className="row-actions">
                        <button
                          aria-label={`Mo ho so chi tiet cua ${candidate.name}`}
                          className="action-compact-button"
                          onClick={() => handleOpenCandidateDetail(candidate.id)}
                          type="button"
                        >
                          Xem chi tiết {'>>'}
                        </button>
                        <button
                          className={`stage-action-button ${primaryAction.variant}`}
                          disabled={primaryAction.disabled}
                          onClick={() => handlePrimaryAction(candidate, result)}
                          type="button"
                        >
                          {primaryAction.label}
                        </button>
                        <button
                          aria-label={`Delete candidate ${candidate.name}`}
                          className="icon-button danger"
                          onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                          title="Xoa ung vien"
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                        </div>
                        <span className="row-action-note">{primaryAction.note}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {message ? <div className="inline-success">{message}</div> : null}

      <Modal
        open={Boolean(selectedCandidateId)}
        title="Ho so ung vien"
        onClose={() => {
          setSelectedCandidateId('')
          setCandidateDetail(null)
          setCandidateDetailError('')
        }}
        className="wide-modal"
      >
                {candidateDetailLoading ? (
          <div className="inline-progress">
            <span className="loading-spinner" />
            <span>Dang tai ho so ung vien...</span>
          </div>
        ) : null}
        {!candidateDetailLoading && candidateDetailError ? <div className="inline-error">{candidateDetailError}</div> : null}
        {!candidateDetailLoading && !candidateDetailError && candidateDetail ? (
          <CandidateProfileModalContent
            candidate={candidateDetail}
            result={Object.values(resultMap).find((item) => item.attemptId === candidateDetail.attemptId) || {}}
            onOpenMatching={handleOpenMatching}
            onOpenReview={handleOpenReview}
          />
        ) : null}

      </Modal>

      <Modal
        open={Boolean(matchingCandidateId)}
        title="Bang matching voi JD"
        onClose={() => {
          setMatchingCandidateId('')
          setMatchingCandidate(null)
          setMatchingCandidateError('')
        }}
      >
        {matchingCandidateLoading ? (
          <div className="inline-progress">
            <span className="loading-spinner" />
            <span>Dang tai bang matching...</span>
          </div>
        ) : null}
        {!matchingCandidateLoading && matchingCandidateError ? <div className="inline-error">{matchingCandidateError}</div> : null}
        {!matchingCandidateLoading && !matchingCandidateError && matchingCandidate ? (
          <div className="stack-lg">
            <div className="section-card inset-card">
              <div className="section-header-inline">
                <div>
                  <div className="eyebrow">Match Score</div>
                  <h3 className="modal-title-tight">{matchingCandidate.name}</h3>
                </div>
                <Badge tone={scoreTone(matchingCandidate.matchScore || 0)}>{matchingCandidate.matchScore || 0}</Badge>
              </div>
              <p className="lead compact">{matchingCandidate.cvSummary || matchingCandidate.summary || 'Chua co tom tat CV.'}</p>
            </div>
            <div className="section-card inset-card">
              <SimpleTable
                columns={['Requirement', 'Candidate Evidence', 'State']}
                rows={(matchingCandidate.matching?.requirementRows || []).length
                  ? matchingCandidate.matching.requirementRows
                  : [['Status', 'Chua co bang matching', '-']]}
              />
            </div>
            <div className="section-card inset-card">
              <SectionHeader eyebrow="Strengths" title="Diem noi bat" body="Tom tat nhanh cac diem match cua ung vien." />
              <ul className="detail-list">
                {(matchingCandidate.matching?.standoutStrengths || []).length ? (
                  matchingCandidate.matching.standoutStrengths.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>Chua co standout strengths.</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(reviewAttemptId)}
        title="Chi tiet bai test ung vien"
        onClose={() => {
          setReviewAttemptId('')
          setReviewPayload(null)
          setReviewRows([])
          setReviewError('')
          setReviewMessage('')
        }}
        className="wide-modal"
      >
        {reviewLoading ? (
          <div className="inline-progress">
            <span className="loading-spinner" />
            <span>Dang tai chi tiet bai test...</span>
          </div>
        ) : null}
        {!reviewLoading && reviewError ? <div className="inline-error">{reviewError}</div> : null}
        {!reviewLoading && !reviewError && reviewPayload ? (
          <AssessmentReviewBody
            review={reviewPayload}
            rows={reviewRows}
            setRows={setReviewRows}
            message={reviewMessage}
            onSave={handleSaveReview}
            saving={reviewSaving}
          />
        ) : null}
      </Modal>
    </div>
  )
}

export function CandidateWorkspace() {
  const navigate = useNavigate()
  const { candidateId = 'cand-sato' } = useParams()
  const [candidate, setCandidate] = useState(null)
  const [openModal, setOpenModal] = useState(false)

  useEffect(() => {
    getRecruiterCandidate(candidateId).then(setCandidate).catch(() => setCandidate(null))
  }, [candidateId])

  async function handleDeleteCurrentCandidate() {
    const confirmed = window.confirm(`Xoa ung vien ${candidate?.name || candidateId}?`)
    if (!confirmed) return
    try {
      await deleteRecruiterCandidate(candidateId)
      if (candidate?.jobId) {
        navigate(`/recruiter/jobs/${candidate.jobId.toLowerCase()}`)
      } else {
        navigate('/recruiter/jobs')
      }
    } catch (error) {
      window.alert(error.message || 'Khong the xoa ung vien.')
    }
  }

  if (!candidate) return <div className="section-card inline-error">Không tìm thấy ứng viên.</div>

  return (
    <div className="stack-lg">
      <div className="hero-strip">
        <div>
          <div className="eyebrow">Candidate Review</div>
          <h1>{candidate.name}</h1>
          <p>{candidate.role}</p>
        </div>
        <div className="badge-row">
          <Badge tone={scoreTone(candidate.matchScore || 0)}>{candidate.matchScore || 0}</Badge>
          <StageBadge stage={candidate.stage} />
          <button
            aria-label={`Delete candidate ${candidate.name}`}
            className="icon-button danger"
            onClick={handleDeleteCurrentCandidate}
            title="Xoa ung vien"
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="section-card">
          <SectionHeader eyebrow="Summary" title="Candidate profile" body={candidate.summary} />
          <div className="detail-grid">
            <DetailPair label="Email" value={candidate.email} />
            <DetailPair label="Phone" value={candidate.phone} />
            <DetailPair label="Japanese Level" value={candidate.japaneseLevel} />
            <DetailPair label="Start Date" value={candidate.startDate} />
          </div>
          <div className="button-row top-gap">
            {candidate.cvFilePath ? (
              <a className="ghost-button small" href={`http://localhost:3001${candidate.cvFilePath}`} target="_blank" rel="noreferrer">
                Mở CV gốc
              </a>
            ) : null}
            <button className="ghost-button small" onClick={() => setOpenModal(true)} type="button">
              Xem thêm {'>>'}
            </button>
          </div>
        </div>
        <div className="section-card">
          <SectionHeader
            eyebrow="Candidate Facts"
            title="Thong tin trich tu CV ung vien"
            body="Chi gom du lieu cua ung vien, khong gom thong tin cong ty/JD."
          />
          <SimpleTable
            columns={['Field', 'Value']}
            rows={candidateOnlyFacts(candidate.parsedFacts || []).length
              ? candidateOnlyFacts(candidate.parsedFacts || [])
              : [['Status', 'Chua co du lieu CV chuan hoa']]}
          />
          <div className="top-gap">
            <SectionHeader
              eyebrow="Job/JD Reference"
              title="Thong tin job/JD tham chieu"
              body="Dung de doi chieu matching, khong phai du lieu profile ung vien."
            />
            <SimpleTable columns={['Reference', 'Value']} rows={jobReferenceRows(candidate)} />
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="section-card">
          {(candidate.activity || []).map((item) => (
            <ActivityRow key={item.title + item.time} title={item.title} note={item.time} />
          ))}
        </div>
        <div className="section-card">
          <div className="button-column">
            <Link className="primary-button" to={`/recruiter/matching/${candidate.id}`}>
              Open JD vs CV
            </Link>
            <Link className="ghost-button" to={`/recruiter/review/${candidate.attemptId || 'attempt-akari'}`}>
              Review assessment
            </Link>
          </div>
        </div>
      </div>
      <Modal open={openModal} title="JD vs CV mapping quick view" onClose={() => setOpenModal(false)}>
        <SimpleTable columns={['Requirement', 'Evidence', 'State']} rows={candidate.matching?.requirementRows || []} />
      </Modal>
    </div>
  )
}

export function MatchingWorkspace() {
  const { candidateId = 'cand-sato' } = useParams()
  const [candidate, setCandidate] = useState(null)

  useEffect(() => {
    getRecruiterCandidate(candidateId).then(setCandidate).catch(() => setCandidate(null))
  }, [candidateId])

  if (!candidate) return <div className="section-card inline-error">Không tìm thấy dữ liệu matching.</div>

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="JD vs CV"
        title="Mapping chi tiết theo requirement"
        body="HR scan nhanh matched / partial / missing / uncertain."
      />
      <div className="matching-grid">
        <div className="section-card">
          <SimpleTable columns={['Field', 'Evidence']} rows={candidateOnlyFacts(candidate.parsedFacts || [])} />
        </div>
        <div className="section-card">
          <SimpleTable columns={['Requirement', 'Candidate Evidence', 'State']} rows={candidate.matching?.requirementRows || []} />
        </div>
        <div className="section-card">
          <ul className="detail-list">
            {(candidate.matching?.standoutStrengths || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function AssessmentReview() {
  const { attemptId = 'attempt-akari' } = useParams()
  const [review, setReview] = useState(null)
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    getRecruiterReview(attemptId)
      .then((payload) => {
        setReview(payload)
        setRows(payload.scoreComparison || [])
      })
      .catch(() => setReview(null))
  }, [attemptId])

  if (!review) return <div className="section-card inline-error">Không tìm thấy assessment review.</div>

  async function handleSave() {
    try {
      const saved = await overrideRecruiterReview(attemptId, { scoreComparison: rows })
      setReview(saved.review)
      setRows(saved.review.scoreComparison || [])
      setMessage('Đã lưu HR override.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Assessment Review"
        title="AI score vs HR-adjusted vs Final"
        body="HR có thể chỉnh điểm và lưu lý do để audit trail."
      />
      <div className="review-summary">
        <StatCard label="AI Score" value={`${review.aiScore}`} note={`Recommendation: ${review.aiRecommendation}`} />
        <StatCard label="HR Score" value={`${review.hrAdjustedScore}`} note="Manual review" />
        <StatCard label="Final Score" value={`${review.finalReviewedScore}`} note="Decision input" />
        <StatCard label="Risk" value={review.riskLevel} note="Support signal only" />
      </div>
      <div className="dashboard-grid">
        <div className="section-card">
          <SimpleTable columns={['Signal', 'Status']} rows={review.suspiciousSignals || []} />
        </div>
        <div className="section-card">
          <div className="stack-sm">
            {(review.media || []).map((item) => (
              <a key={item.sectionKey} className="ghost-button small" href={`http://localhost:3001${item.media.path}`} target="_blank" rel="noreferrer">
                Open {item.sectionKey}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="section-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>AI</th>
                <th>HR</th>
                <th>Final</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>
                    <input
                      className="text-input"
                      value={row[2]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], event.target.value, item[3], item[4]] : item)))}
                    />
                  </td>
                  <td>
                    <input
                      className="text-input"
                      value={row[3]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], item[2], event.target.value, item[4]] : item)))}
                    />
                  </td>
                  <td>
                    <input
                      className="text-input"
                      value={row[4]}
                      onChange={(event) => setRows((prev) => prev.map((item, itemIndex) => (itemIndex === index ? [item[0], item[1], item[2], item[3], event.target.value] : item)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row top-gap">
          <button className="primary-button" onClick={handleSave} type="button">
            Lưu override
          </button>
        </div>
        {message ? <div className="inline-success top-gap">{message}</div> : null}
      </div>
    </div>
  )
}



