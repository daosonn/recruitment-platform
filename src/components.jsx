import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import altiusLogo from './assets/altius-logo.png'
import { languages } from './data'

export function BrandLockup({ title, subtitle, to = '/', compact = false }) {
  const content = (
    <div className={`brand-block ${compact ? 'compact' : ''}`}>
      <img alt="Altius Link logo" className="brand-logo" src={altiusLogo} />
      <div>
        <div className="brand-name">{title}</div>
        {subtitle ? <div className="brand-sub">{subtitle}</div> : null}
      </div>
    </div>
  )

  if (!to) return content
  return <Link to={to}>{content}</Link>
}

export function LanguageSwitcher({ language, setLanguage, compact = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = languages.find((item) => item.code === language) || languages[0]

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div ref={rootRef} className={`language-switcher ${compact ? 'compact' : ''}`}>
      <button
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`lang-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <FlagIcon code={current.code} />
      </button>
      {open ? (
        <div className="lang-menu" role="listbox">
          {languages.map((item) => (
            <button
              aria-label={item.label}
              key={item.code}
              className={`lang-option ${language === item.code ? 'active' : ''}`}
              onClick={() => {
                setLanguage(item.code)
                setOpen(false)
              }}
              type="button"
            >
              <FlagIcon code={item.code} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FlagIcon({ code }) {
  const flags = {
    vi: (
      <svg viewBox="0 0 32 24" aria-hidden="true">
        <rect width="32" height="24" rx="4" fill="#da251d" />
        <polygon points="16,5 18.7,12 26,12 20.2,16.4 22.4,23 16,18.8 9.6,23 11.8,16.4 6,12 13.3,12" fill="#ffdd00" />
      </svg>
    ),
    ja: (
      <svg viewBox="0 0 32 24" aria-hidden="true">
        <rect width="32" height="24" rx="4" fill="#ffffff" stroke="#d9dee7" />
        <circle cx="16" cy="12" r="6" fill="#bc002d" />
      </svg>
    ),
    en: (
      <svg viewBox="0 0 32 24" aria-hidden="true">
        <rect width="32" height="24" rx="4" fill="#0a3b8f" />
        <path d="M0 2h32v3H0zm0 8h32v3H0zm0 8h32v3H0z" fill="#fff" />
        <path d="M0 3h32v1H0zm0 11h32v1H0z" fill="#c8102e" />
        <rect width="13" height="10" fill="#012169" />
        <path d="M0 0l13 10M13 0L0 10" stroke="#fff" strokeWidth="2" />
        <path d="M6.5 0v10M0 5h13" stroke="#fff" strokeWidth="3" />
        <path d="M6.5 0v10M0 5h13" stroke="#c8102e" strokeWidth="1.4" />
      </svg>
    ),
  }

  return <span className="flag-icon">{flags[code]}</span>
}

export function TrashIcon({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function Modal({ open, title, onClose, children, className = '' }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className={`modal-panel ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="section-header-inline">
          <h3>{title}</h3>
          <button className="ghost-button small" onClick={onClose} type="button">
            Đóng
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function SectionHeader({ eyebrow, title, body }) {
  return (
    <div className="section-header-block">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p className="lead">{body}</p>
    </div>
  )
}

export function StatCard({ label, value, note, tone = 'neutral' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  )
}

export function InfoCard({ title, body }) {
  return (
    <article className="info-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  )
}

export function FilterChip({ label, value }) {
  return (
    <div className="filter-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function DetailPair({ label, value }) {
  return (
    <div className="detail-pair">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function SimpleTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('-')}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ActivityRow({ title, note }) {
  return (
    <div className="activity-row">
      <div className="activity-dot" />
      <div>
        <div className="row-title">{title}</div>
        <div className="row-subtitle">{note}</div>
      </div>
    </div>
  )
}

export function CandidateMiniRow({ name, note, to = '/recruiter/candidates/cand-sato' }) {
  return (
    <div className="list-row">
      <div>
        <div className="row-title">{name}</div>
        <div className="row-subtitle">{note}</div>
      </div>
      <Link className="text-link" to={to}>
        Open
      </Link>
    </div>
  )
}

export function WizardStep({ number, title, body }) {
  return (
    <div className="wizard-step">
      <div className="wizard-number">{number}</div>
      <div className="row-title">{title}</div>
      <div className="row-subtitle">{body}</div>
    </div>
  )
}

export function DeviceCard({ title, status, note }) {
  return (
    <div className="device-card">
      <div className="section-header-inline">
        <h3>{title}</h3>
        <Badge tone={status === 'Ready' ? 'success' : 'warning'}>{status}</Badge>
      </div>
      <p>{note}</p>
    </div>
  )
}

export function InfoRow({ title, body }) {
  return (
    <div className="info-row">
      <div className="row-title">{title}</div>
      <div className="row-subtitle">{body}</div>
    </div>
  )
}

export function InputBlock({ label, value = '', tall = false }) {
  return (
    <label className="input-block">
      <span>{label}</span>
      <div className={`input-surface ${tall ? 'tall' : ''}`}>{value}</div>
    </label>
  )
}

export function AssessmentCardLayout({ eyebrow, title, body, asideTitle, asideItems, children }) {
  return (
    <div className="assessment-card-layout">
      <section className="section-card">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="lead">{body}</p>
        {children}
      </section>
      <aside className="section-card">
        <div className="eyebrow">{asideTitle}</div>
        <ul className="detail-list">
          {asideItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

export function RunnerWorkspace({ title, subtitle, leftContent, rightContent }) {
  return (
    <div className="runner-grid">
      <section className="runner-panel runner-left">
        <h1>{title}</h1>
        <p className="lead">{subtitle}</p>
        {leftContent}
      </section>
      <section className="runner-panel runner-right">{rightContent}</section>
    </div>
  )
}

export function RecordingPanel({ label }) {
  return (
    <div className="recording-surface">
      <div className="rec-top">
        <span className="recording-dot" />
        <span>REC</span>
      </div>
      <div className="recording-center">{label}</div>
      <div className="audio-wave">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
