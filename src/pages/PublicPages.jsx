import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAssessmentEntry, getJob, getJobs } from '../api'
import { Badge, DetailPair, FilterChip, InfoCard, InputBlock, SectionHeader } from '../components'
import { copy, DEFAULT_LANGUAGE } from '../data'

function entryErrorMessage(error, language) {
  const dict = copy[language]?.assessmentErrors || copy.vi.assessmentErrors
  if (error?.code === 'invalid_code') return dict.invalidCode
  if (error?.code === 'expired_code') return dict.expiredCode
  if (error?.code === 'backend_unavailable') return dict.backendUnavailable
  return error?.message || dict.upload
}

export function PublicHome({ language = DEFAULT_LANGUAGE }) {
  const [jobs, setJobs] = useState([])
  const t = copy[language]

  useEffect(() => {
    getJobs().then(setJobs).catch(() => setJobs([]))
  }, [])

  return (
    <div className="stack-xl">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">Altius Link</div>
          <h1>{t.heroTitle}</h1>
          <p className="lead hero-lead">{t.heroBody}</p>
          <div className="button-row top-gap">
            <Link className="primary-button" to="/jobs">
              {t.ctaJobs}
            </Link>
            <Link className="ghost-button" to="/assessment-entry">
              {t.ctaAssessment}
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-panel-header">
            <span>Candidate Journey</span>
            <Badge tone="success">Clear Steps</Badge>
          </div>
          <SectionHeader
            eyebrow="Ứng viên"
            title={t.processSummaryTitle}
            body="Bạn luôn biết bước tiếp theo cần làm gì trước khi vào bài đánh giá chính thức."
          />
          <ul className="detail-list">
            {t.processSummarySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <div className="button-row top-gap">
            <Link className="ghost-button" to="/process">
              Xem quy trình chi tiết
            </Link>
          </div>
        </div>
      </section>

      <section className="section-card">
        <SectionHeader
          eyebrow="Trải nghiệm ứng tuyển"
          title="Nghiêm túc, rõ ràng và tập trung vào năng lực công việc"
          body="Assessment được thiết kế theo mô phỏng công việc thực tế: tiếng Nhật, typing và xử lý dữ liệu."
        />
        <div className="feature-grid">
          <InfoCard title="Mô tả job rõ ràng" body="Yêu cầu tiếng Nhật, điều kiện làm việc và trách nhiệm được trình bày minh bạch." />
          <InfoCard title="Chuẩn bị trước khi test" body="Ứng viên kiểm tra camera, microphone và mạng trước khi bắt đầu." />
          <InfoCard title="Báo sai thông tin dễ dàng" body="Có sẵn mục báo sai thông tin trước khi vào phần thi chính." />
          <InfoCard title="Kết quả được lưu đầy đủ" body="Dữ liệu bài thi được lưu nhất quán để recruiter review sau đó." />
        </div>
      </section>

      <section className="section-card">
        <SectionHeader eyebrow="Open Jobs" title="Vị trí đang tuyển" body="Tham khảo nhanh các vị trí phù hợp trước khi ứng tuyển." />
        <div className="job-grid">
          {jobs.slice(0, 4).map((job) => (
            <article key={job.id} className="job-card">
              <div className="job-card-head">
                <div>
                  <div className="job-code">{job.id}</div>
                  <h3>{job.title}</h3>
                </div>
                <Badge>{job.jpLevel}</Badge>
              </div>
              <p>{job.summary}</p>
              <div className="meta-row">
                <span>{job.location}</span>
                <span>{job.employment}</span>
                <span>{job.shift}</span>
              </div>
              <Link className="text-link" to={`/jobs/${job.id}`}>
                Xem chi tiết
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function PublicJobs() {
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    getJobs().then(setJobs).catch(() => setJobs([]))
  }, [])

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Open Jobs"
        title="Danh sách vị trí tuyển dụng"
        body="Lọc theo vị trí, trình độ tiếng Nhật và điều kiện làm việc."
      />
      <div className="filter-row">
        <FilterChip label="Địa điểm" value="Hà Nội / Hybrid" />
        <FilterChip label="Tiếng Nhật" value="N3 - N1" />
        <FilterChip label="Hình thức" value="Full-time" />
        <FilterChip label="Ca làm" value="Office / Rotational" />
      </div>
      <div className="job-list">
        {jobs.map((job) => (
          <article key={job.id} className="job-list-item">
            <div>
              <div className="job-code">{job.id}</div>
              <h3>{job.title}</h3>
              <p>{job.summary}</p>
            </div>
            <div className="job-list-aside">
              <Badge>{job.jpLevel}</Badge>
              <div className="meta-column">
                <span>{job.location}</span>
                <span>{job.employment}</span>
                <span>{job.shift}</span>
              </div>
              <Link className="primary-button small" to={`/jobs/${job.id}`}>
                Xem job detail
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function PublicJobDetail() {
  const { jobId = 'JD-9921' } = useParams()
  const [job, setJob] = useState(null)

  useEffect(() => {
    getJob(jobId).then(setJob).catch(() => setJob(null))
  }, [jobId])

  if (!job) {
    return <div className="section-card inline-error">Không tìm thấy thông tin công việc.</div>
  }

  const entryLink = `#/assessment-entry`

  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Job Detail"
        title={job.title}
        body="Thông tin công việc được trình bày rõ ràng để bạn chuẩn bị tốt trước khi vào assessment."
      />
      <div className="two-column-layout">
        <div className="section-card">
          <div className="detail-grid">
            <DetailPair label="Địa điểm" value={job.location} />
            <DetailPair label="Tiếng Nhật" value={job.jpLevel} />
            <DetailPair label="Hình thức" value={job.employment} />
            <DetailPair label="Ca làm việc" value={job.shift} />
          </div>
          <h3 className="section-subtitle">Trách nhiệm công việc</h3>
          <ul className="detail-list">
            {(job.responsibilities || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3 className="section-subtitle">Yêu cầu ứng viên</h3>
          <ul className="detail-list">
            {(job.requirements || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <aside className="side-stack">
          <div className="section-card">
            <div className="eyebrow">Chuẩn bị trước khi làm assessment</div>
            <ul className="detail-list">
              <li>Đảm bảo kết nối mạng ổn định và không gian yên tĩnh.</li>
              <li>Kiểm tra camera/microphone trước khi bắt đầu.</li>
              <li>Nếu thông tin cá nhân sai, dùng mục báo sai thông tin trước khi thi.</li>
            </ul>
          </div>
          <div className="section-card">
            <div className="eyebrow">Assessment Entry</div>
            <div className="meta-column">
              <span>{entryLink}</span>
            </div>
            <div className="button-column top-gap">
              <Link className="primary-button" to="/assessment-entry">
                Vào assessment
              </Link>
              <Link className="ghost-button" to="/contact">
                Liên hệ hỗ trợ tuyển dụng
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export function ProcessPage({ language = DEFAULT_LANGUAGE }) {
  const t = copy[language]
  return (
    <div className="stack-lg">
      <SectionHeader eyebrow="Application Process" title={t.processDetailTitle} body={t.processDetailBody} />
      <div className="timeline-grid">
        {t.processDetailSteps.map((step, index) => (
          <div key={step} className="timeline-card">
            <div className="timeline-index">0{index + 1}</div>
            <p>{step}</p>
          </div>
        ))}
      </div>
      <div className="section-card">
        <SectionHeader
          eyebrow="Lưu ý"
          title="Vì sao có thể cần camera/microphone"
          body="Một số phần đánh giá tiếng Nhật cần ghi âm/ghi hình để đội tuyển dụng review nhất quán."
        />
        <ul className="detail-list">
          <li>Hệ thống chỉ yêu cầu quyền camera/microphone ở các phần cần ghi nhận bằng chứng.</li>
          <li>Nếu thông tin ứng tuyển chưa đúng, bạn có thể báo lại trước khi bắt đầu phần thi chính.</li>
          <li>Sau khi nộp bài, recruiter sẽ review kết quả và phản hồi theo quy trình tuyển dụng.</li>
        </ul>
      </div>
    </div>
  )
}

export function FaqPage() {
  return (
    <div className="stack-lg">
      <SectionHeader
        eyebrow="Candidate FAQ"
        title="Câu hỏi thường gặp trước khi làm assessment"
        body="Thông tin về link mời, thiết bị, lỗi kết nối và dữ liệu lưu trữ."
      />
      <div className="feature-grid">
        <InfoCard title="Nếu thông tin ứng tuyển bị sai?" body="Bạn có thể báo lại ngay ở bước xác nhận thông tin trước khi bắt đầu bài test." />
        <InfoCard title="Camera và microphone có bắt buộc?" body="Có ở các phần ghi âm/ghi hình để phục vụ review chất lượng." />
        <InfoCard title="Link assessment có hết hạn không?" body="Có. Hệ thống sẽ hiển thị trạng thái hết hạn rõ ràng khi quá hạn." />
        <InfoCard title="Dữ liệu có được lưu lại không?" body="Có. Kết quả từng phần và bằng chứng liên quan được lưu để recruiter review." />
      </div>
    </div>
  )
}

export function ContactPage() {
  return (
    <div className="two-column-layout">
      <div className="section-card">
        <SectionHeader
          eyebrow="Contact & Support"
          title="Liên hệ bộ phận tuyển dụng Altius Link"
          body="Kênh hỗ trợ chính thức dành cho ứng viên khi cần hỗ trợ về job hoặc assessment."
        />
        <div className="detail-grid">
          <DetailPair label="Recruitment Email" value="recruitment@altiuslink.vn" />
          <DetailPair label="Support Hotline" value="+84 24 3333 1818" />
          <DetailPair label="Office" value="Ha Noi, Viet Nam" />
          <DetailPair label="Business Hours" value="08:30 - 17:30" />
        </div>
      </div>
      <div className="section-card">
        <div className="eyebrow">Support Form</div>
        <div className="form-stack">
          <InputBlock label="Họ và tên" />
          <InputBlock label="Email" />
          <InputBlock label="Nội dung hỗ trợ" tall />
          <button className="primary-button" type="button">
            Gửi yêu cầu hỗ trợ
          </button>
        </div>
      </div>
    </div>
  )
}

export function AssessmentEntryPage({ language = DEFAULT_LANGUAGE }) {
  const [code, setCode] = useState('ALR-AKIRA-9921')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const disabled = useMemo(() => !code.trim() || loading, [code, loading])

  async function handleContinue() {
    setLoading(true)
    setMessage('')
    try {
      const entry = await getAssessmentEntry(code.trim())
      navigate(`/candidate?code=${encodeURIComponent(entry.code)}&session=${encodeURIComponent(entry.sessionId)}`)
    } catch (error) {
      setMessage(entryErrorMessage(error, language))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="two-column-layout">
      <div className="section-card">
        <SectionHeader
          eyebrow="Assessment Entry"
          title="Nhập mã mời hoặc mở link assessment"
          body="Ứng viên dùng mã/link do recruiter gửi để vào đúng phiên làm bài."
        />
        <div className="form-stack">
          <label className="input-block">
            <span>Invitation Code</span>
            <input className="text-input" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button className="primary-button" disabled={disabled} onClick={handleContinue} type="button">
            {loading ? 'Đang kiểm tra...' : 'Tiếp tục vào assessment'}
          </button>
          {message ? <div className="inline-error">{message}</div> : null}
        </div>
      </div>
      <div className="section-card">
        <div className="eyebrow">Trước khi bắt đầu</div>
        <ul className="detail-list">
          <li>Dùng kết nối mạng ổn định.</li>
          <li>Chuẩn bị camera và microphone.</li>
          <li>Dành đủ thời gian để hoàn thành toàn bộ bài test.</li>
          <li>Nếu thông tin cá nhân sai, hãy báo lại ở bước xác nhận thông tin.</li>
        </ul>
      </div>
    </div>
  )
}
