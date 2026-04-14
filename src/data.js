export const DEFAULT_LANGUAGE = 'vi'
export const LANGUAGE_STORAGE_KEY = 'altius-recruit-language'
export const ASSESSMENT_SESSION_STORAGE_KEY = 'altius-recruit-session-id'

export const MATCHING_THRESHOLDS = {
  green: 80,
  yellow: 60,
}

export const languages = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'ja', label: '日本語', short: 'JP' },
  { code: 'en', label: 'English', short: 'EN' },
]

export const assessmentSteps = [
  { key: 'entry', to: '/candidate', label: 'Entry' },
  { key: 'invitation', to: '/candidate/invitation', label: 'Invitation' },
  { key: 'device-check', to: '/candidate/device-check', label: 'Device Check' },
  { key: 'consent', to: '/candidate/consent', label: 'Consent' },
  { key: 'confirm-info', to: '/candidate/confirm-info', label: 'Confirm Info' },
  { key: 'japanese-qa', to: '/candidate/japanese-qa', label: 'Work-Fit Interview' },
  { key: 'reading-aloud', to: '/candidate/reading-aloud', label: 'Reading Aloud' },
  { key: 'typing', to: '/candidate/typing', label: 'Typing Test' },
  { key: 'data-task', to: '/candidate/data-task', label: 'Document Extraction' },
  { key: 'submit', to: '/candidate/submit', label: 'Submit' },
  { key: 'completion', to: '/candidate/completion', label: 'Completion' },
]

export const stageOptions = [
  'applied',
  'cv_screening',
  'assessment_invited',
  'assessment_in_progress',
  'assessment_completed',
  'under_review',
  'shortlisted',
  'final_interview',
  'hired',
  'rejected',
  'expired',
  'abandoned',
]

export const stageOptionMeta = {
  applied: { shortLabel: 'New', fullLabel: 'Applied', hint: 'Moi vao pipeline', tone: 'slate' },
  cv_screening: { shortLabel: 'CV', fullLabel: 'CV Screen', hint: 'Dang loc CV', tone: 'slate' },
  assessment_invited: { shortLabel: 'Test', fullLabel: 'Test Sent', hint: 'Da gui link test', tone: 'blue' },
  assessment_in_progress: { shortLabel: 'Doing', fullLabel: 'Testing', hint: 'Ung vien dang lam bai', tone: 'sky' },
  assessment_completed: { shortLabel: 'Done', fullLabel: 'Test Done', hint: 'Da hoan thanh bai test', tone: 'green' },
  under_review: { shortLabel: 'Review', fullLabel: 'Under Review', hint: 'Cho recruiter review', tone: 'amber' },
  shortlisted: { shortLabel: 'Short', fullLabel: 'Shortlist', hint: 'Da vao shortlist', tone: 'teal' },
  final_interview: { shortLabel: 'PV2', fullLabel: 'Round 2', hint: 'Phong van vong 2', tone: 'navy' },
  hired: { shortLabel: 'Hired', fullLabel: 'Hired', hint: 'Da nhan viec', tone: 'green' },
  rejected: { shortLabel: 'Reject', fullLabel: 'Rejected', hint: 'Dung quy trinh', tone: 'rose' },
  expired: { shortLabel: 'Expire', fullLabel: 'Expired', hint: 'Link da het han', tone: 'slate' },
  abandoned: { shortLabel: 'Drop', fullLabel: 'Abandoned', hint: 'Ung vien bo qua', tone: 'slate' },
}

export function getStageMeta(stage) {
  return (
    stageOptionMeta[stage] || {
      shortLabel: stage || '-',
      fullLabel: stage || '-',
      hint: '',
      tone: 'slate',
    }
  )
}

export const jobStatusOptions = ['open', 'on_hold', 'closed', 'filled', 'archived']

export const copy = {
  vi: {
    brandName: 'Altius Link',
    brandSub: 'Nền tảng tuyển dụng minh bạch cho ứng viên',
    recruiterPortalSub: 'Recruiter Portal',
    publicNav: [
      { to: '/', label: 'Trang chủ' },
      { to: '/jobs', label: 'Việc làm' },
      { to: '/process', label: 'Quy trình ứng tuyển' },
      { to: '/faq', label: 'FAQ' },
      { to: '/contact', label: 'Liên hệ' },
    ],
    recruiterNav: [
      { to: '/recruiter/dashboard', label: 'Dashboard' },
      { to: '/recruiter/jobs', label: 'Jobs' },
      { to: '/recruiter/review/attempt-akari', label: 'Assessment Reviews' },
      { to: '/recruiter/login', label: 'Settings' },
    ],
    heroTitle: 'Tìm đúng công việc và hoàn thành quy trình ứng tuyển rõ ràng, chuyên nghiệp.',
    heroBody:
      'Altius Link giúp ứng viên xem yêu cầu công việc, chuẩn bị thiết bị, xác nhận thông tin và nộp bài đánh giá với trải nghiệm nhất quán.',
    ctaJobs: 'Xem vị trí tuyển dụng',
    ctaAssessment: 'Vào Assessment',
    footerTag: 'Nền tảng tuyển dụng cho các vị trí back-office, data processing và data entry.',
    loginTitle: 'Đăng nhập Recruiter Portal',
    loginBody: 'Khu vực nội bộ dành cho HR, recruiter và hiring manager.',
    assessmentCenter: 'Assessment Center',
    recordingReady: 'Sẵn sàng ghi âm/ghi hình',
    processSummaryTitle: 'Quy trình rõ ràng cho ứng viên',
    processSummarySteps: [
      'Xem mô tả công việc và yêu cầu tuyển dụng.',
      'Nhận link hoặc mã assessment từ recruiter.',
      'Kiểm tra camera, microphone và xác nhận thông tin.',
      'Hoàn thành đầy đủ các phần tiếng Nhật, typing và data task.',
      'Nộp bài và chờ phản hồi từ recruiter.',
    ],
    processDetailTitle: 'Quy trình ứng tuyển dành cho ứng viên',
    processDetailBody:
      'Trang này mô tả những gì bạn sẽ trải qua trước, trong và sau assessment để chuẩn bị tốt nhất.',
    processDetailSteps: [
      'Đọc kỹ job detail và kiểm tra mức độ phù hợp.',
      'Mở assessment bằng link hoặc invitation code.',
      'Hoàn tất device check và consent.',
      'Xác nhận thông tin cá nhân, báo sai thông tin nếu cần.',
      'Hoàn thành toàn bộ bài test và nộp kết quả.',
    ],
    assessmentErrors: {
      incomplete: 'Bạn cần hoàn thành tất cả phần bắt buộc trước khi nộp bài.',
      permission: 'Trình duyệt chưa cấp quyền camera hoặc microphone.',
      upload: 'Tải dữ liệu lên thất bại. Vui lòng thử lại.',
      expired: 'Phiên assessment đã hết hạn hoặc không hợp lệ.',
      backendUnavailable: 'Không kết nối được backend. Vui lòng chạy API server.',
      invalidCode: 'Mã mời không hợp lệ.',
      expiredCode: 'Mã mời đã hết hạn.',
    },
  },
  ja: {
    brandName: 'Altius Link',
    brandSub: '応募者向けの透明性ある採用プラットフォーム',
    recruiterPortalSub: 'Recruiter Portal',
    publicNav: [
      { to: '/', label: 'ホーム' },
      { to: '/jobs', label: '求人一覧' },
      { to: '/process', label: '応募プロセス' },
      { to: '/faq', label: 'FAQ' },
      { to: '/contact', label: 'お問い合わせ' },
    ],
    recruiterNav: [
      { to: '/recruiter/dashboard', label: 'Dashboard' },
      { to: '/recruiter/jobs', label: 'Jobs' },
      { to: '/recruiter/review/attempt-akari', label: 'Assessment Reviews' },
      { to: '/recruiter/login', label: 'Settings' },
    ],
    heroTitle: '自分に合う仕事を見つけ、明確でプロフェッショナルな応募フローを進めましょう。',
    heroBody:
      'Altius Link は、候補者が募集要件を確認し、端末を準備し、プロフィールを確認し、自信を持って assessment を提出できるよう支援します。',
    ctaJobs: '求人を見る',
    ctaAssessment: 'Assessment に入る',
    footerTag: 'バックオフィス・データ処理・データ入力向け採用プラットフォーム。',
    loginTitle: 'Recruiter Portal ログイン',
    loginBody: 'HR・Recruiter・Hiring Manager 向けの内部ワークスペースです。',
    assessmentCenter: 'Assessment Center',
    recordingReady: '録音・録画の準備完了',
    processSummaryTitle: '応募者向けの分かりやすいプロセス',
    processSummarySteps: [
      '求人詳細と要件を確認する。',
      'Recruiter から受け取ったリンクまたはコードを使う。',
      '端末チェックとプロフィール確認を行う。',
      '日本語、タイピング、データタスクを完了する。',
      '提出後、Recruiter からの連絡を待つ。',
    ],
    processDetailTitle: '応募プロセス',
    processDetailBody:
      'このページでは、assessment の前・最中・提出後に何が起こるかを説明します。',
    processDetailSteps: [
      '求人内容を確認し、適性を判断する。',
      'リンクまたはコードで assessment を開始する。',
      'Device check と consent を完了する。',
      'プロフィールを確認し、誤りがあれば報告する。',
      'すべてのセクションを完了して提出する。',
    ],
    assessmentErrors: {
      incomplete: '提出前に必須セクションをすべて完了してください。',
      permission: 'カメラまたはマイクの権限がありません。',
      upload: 'アップロードに失敗しました。もう一度お試しください。',
      expired: 'この assessment セッションは無効または期限切れです。',
      backendUnavailable: 'Backend に接続できません。API server を起動してください。',
      invalidCode: '招待コードが無効です。',
      expiredCode: '招待コードの期限が切れています。',
    },
  },
  en: {
    brandName: 'Altius Link',
    brandSub: 'A transparent recruitment platform for candidates',
    recruiterPortalSub: 'Recruiter Portal',
    publicNav: [
      { to: '/', label: 'Home' },
      { to: '/jobs', label: 'Open Jobs' },
      { to: '/process', label: 'Application Process' },
      { to: '/faq', label: 'FAQ' },
      { to: '/contact', label: 'Contact' },
    ],
    recruiterNav: [
      { to: '/recruiter/dashboard', label: 'Dashboard' },
      { to: '/recruiter/jobs', label: 'Jobs' },
      { to: '/recruiter/review/attempt-akari', label: 'Assessment Reviews' },
      { to: '/recruiter/login', label: 'Settings' },
    ],
    heroTitle: 'Find the right role and complete a clear, professional application flow.',
    heroBody:
      'Altius Link helps candidates review role expectations, prepare devices, confirm profile data, and submit assessment results with confidence.',
    ctaJobs: 'View Open Jobs',
    ctaAssessment: 'Enter Assessment',
    footerTag: 'Recruitment platform for Japanese back-office, data processing and data entry roles.',
    loginTitle: 'Recruiter Portal Login',
    loginBody: 'Internal workspace for recruiters, HR leads and hiring managers.',
    assessmentCenter: 'Assessment Center',
    recordingReady: 'Ready to record',
    processSummaryTitle: 'A clear process for candidates',
    processSummarySteps: [
      'Review job details and requirements.',
      'Use the invitation link/code from recruiter.',
      'Run device checks and confirm your profile.',
      'Complete Japanese, typing and data-task sections.',
      'Submit and wait for recruiter follow-up.',
    ],
    processDetailTitle: 'Candidate application process',
    processDetailBody:
      'This page explains your journey, why camera/microphone may be required, and what happens after submission.',
    processDetailSteps: [
      'Read job detail and confirm fit.',
      'Open invitation via link or code.',
      'Finish device check and consent.',
      'Confirm profile data and report incorrect information.',
      'Complete all sections and submit for recruiter review.',
    ],
    assessmentErrors: {
      incomplete: 'All required sections must be completed before submission.',
      permission: 'Camera or microphone permission is not available.',
      upload: 'Upload failed. Please try again.',
      expired: 'This assessment session is expired or invalid.',
      backendUnavailable: 'Backend is unavailable. Please start the API server.',
      invalidCode: 'Invitation code is invalid.',
      expiredCode: 'Invitation code is expired.',
    },
  },
}
