import cors from 'cors'
import express from 'express'
import fs from 'fs/promises'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { evaluateAssessmentSpeech, parseCvWithFallback } from './aiProvider.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.join(__dirname, '..')
const dataDir = path.join(__dirname, 'data')
const storageDir = path.join(__dirname, 'storage')
const runtimeEnv = globalThis.process?.env || {}

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/storage', express.static(storageDir))

const upload = multer({ storage: multer.memoryStorage() })

const dataFiles = {
  bootstrap: 'bootstrap.json',
  jobs: 'jobs.json',
  candidates: 'candidates.json',
  applications: 'applications.json',
  sessions: 'sessions.json',
  reviews: 'reviews.json',
  submissions: 'submissions.json',
}

const sectionOrder = ['japanese-qa', 'reading-aloud', 'typing', 'data-task']
const jobStatuses = new Set(['open', 'on_hold', 'closed', 'filled', 'archived'])
const blockedImportStatuses = new Set(['closed', 'filled', 'archived'])
const QUESTION_SET_VERSION = 'v3-2026-04-14'

const QUESTION_BANK = {
  japaneseQaFollowUps: [
    { id: 'qa-1', prompt: '志望動機を1分で説明してください。' },
    { id: 'qa-2', prompt: '前職で担当したデータ入力業務を具体的に話してください。' },
    { id: 'qa-3', prompt: '品質を守るために普段どんな確認を行いますか。' },
    { id: 'qa-4', prompt: '納期が厳しい時の優先順位の付け方を説明してください。' },
    { id: 'qa-5', prompt: 'チームで報連相を行う時に意識していることは何ですか。' },
    { id: 'qa-6', prompt: 'Excelを使った作業で得意なことを説明してください。' },
  ],
  readingPassages: [
    {
      id: 'read-a',
      title: '社内連絡メール',
      text:
        '本日16時までに、4月分の受注データを確認してください。重複レコードが見つかった場合は、備考欄に理由を記入し、担当者へ共有してください。完了後、チェックシートを更新してから退勤してください。',
    },
    {
      id: 'read-b',
      title: '業務手順メモ',
      text:
        '顧客情報を登録する前に、氏名・生年月日・電話番号の3項目を必ず照合してください。入力後はステータスを「確認済み」に変更し、誤入力がある場合は修正ログを残してください。',
    },
    {
      id: 'read-c',
      title: 'シフト案内',
      text:
        '来週から新しいシフトが開始されます。早番は8時30分開始、遅番は13時開始です。体調不良や遅刻の見込みがある場合は、開始30分前までに必ず連絡してください。',
    },
  ],
  readingComprehensionByPassage: {
    'read-a': [
      '何時までに受注データを確認する必要がありますか。',
      '重複レコードを見つけた時に最初に行うことは何ですか。',
      '退勤前に必ず完了すべき作業は何ですか。',
      'この連絡の目的を1文で説明してください。',
    ],
    'read-b': [
      '登録前に必須で照合する3項目は何ですか。',
      '入力後に変更するステータスは何ですか。',
      '誤入力があった時に残すべき記録は何ですか。',
      'この手順を守ることで防げるリスクを1つ挙げてください。',
    ],
    'read-c': [
      '早番と遅番の開始時刻は何時ですか。',
      '遅刻の見込みがある時、いつまでに連絡する必要がありますか。',
      'この案内で最も重要なルールを1つ説明してください。',
      '体調不良時の対応を1文でまとめてください。',
    ],
  },
  typingSamples: [
    {
      id: 'typing-a',
      title: 'Kanji Copy 01',
      text:
        '本日の確認対象は顧客情報一覧です。氏名、住所、電話番号、登録日を正確に入力し、重複データがあれば備考欄に記録してください。',
    },
    {
      id: 'typing-b',
      title: 'Kanji Copy 02',
      text:
        '受注管理システムへ入力する際は、注文番号、商品名、数量、出荷予定日を順番どおりに登録し、入力後に必ず再確認を行ってください。',
    },
    {
      id: 'typing-c',
      title: 'Kanji Copy 03',
      text:
        '業務品質を維持するため、入力内容の誤字脱字を確認し、修正履歴を残したうえで担当者へ完了報告を提出してください。',
    },
  ],
  dataTasks: [
    {
      id: 'data-a',
      title: 'Customer Search Task',
      instruction:
        'Tìm record có chi nhánh Tokyo, trạng thái Pending, và ngày cập nhật mới nhất. Trả về Record ID và nêu lý do chọn.',
      columns: ['Record ID', 'Name', 'Branch', 'Status', 'Updated'],
      rows: [
        ['JP-4102', '田中太郎', 'Tokyo', 'Pending', '2026-04-08'],
        ['JP-4103', '鈴木花子', 'Osaka', 'Pending', '2026-04-10'],
        ['JP-4104', '佐藤健一', 'Tokyo', 'Pending', '2026-04-11'],
        ['JP-4105', '山本美咲', 'Tokyo', 'Verified', '2026-04-12'],
      ],
      expectedHint: 'JP-4104',
    },
    {
      id: 'data-b',
      title: 'Data Correction Task',
      instruction:
        'So sánh 2 dòng có cùng Customer ID, xác định dòng đúng và ghi nội dung cần sửa cho dòng còn lại.',
      columns: ['Customer ID', 'Kana Name', 'Start Date', 'Status'],
      rows: [
        ['JP-2026-1104', 'サトウ ノボル', '2026-05-05', 'Verified'],
        ['JP-2026-1104', 'サトウ ノボリ', '2026-05-15', 'Pending'],
      ],
      expectedHint: 'Kana Name va Start Date',
    },
    {
      id: 'data-c',
      title: 'Form Mapping Task',
      instruction:
        'Chọn mã hồ sơ phù hợp với điều kiện: JLPT N2, có kinh nghiệm data entry, có thể làm full-time.',
      columns: ['Profile ID', 'JLPT', 'Experience', 'Availability'],
      rows: [
        ['PF-771', 'N3', '1 year customer support', 'Full-time'],
        ['PF-772', 'N2', '2 years data entry', 'Full-time'],
        ['PF-773', 'N2', 'No experience', 'Part-time'],
      ],
      expectedHint: 'PF-772',
    },
  ],
}

function randomInt(max) {
  return Math.floor(Math.random() * max)
}

function pickOne(items = []) {
  if (!items.length) return null
  return items[randomInt(items.length)]
}

function pickRandom(items = [], count = 1) {
  if (!items.length || count <= 0) return []
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

function buildQuestionSet({ jobTitle = '' } = {}) {
  const reading = pickOne(QUESTION_BANK.readingPassages) || QUESTION_BANK.readingPassages[0]
  const typing = pickOne(QUESTION_BANK.typingSamples) || QUESTION_BANK.typingSamples[0]
  const dataTask = pickOne(QUESTION_BANK.dataTasks) || QUESTION_BANK.dataTasks[0]
  const readingQuestions = QUESTION_BANK.readingComprehensionByPassage[reading.id] || []
  const followUpQuestions = pickRandom(QUESTION_BANK.japaneseQaFollowUps, 3)
  const compQuestions = pickRandom(readingQuestions, 3).map((prompt, index) => ({
    id: `rc-${index + 1}`,
    prompt,
  }))

  return {
    version: QUESTION_SET_VERSION,
    generatedAt: nowIso(),
    japaneseQa: {
      fixedIntro: `自己紹介をしてください。氏名、学歴、現在の状況、${jobTitle || '応募職種'}への志望理由を含めてください。`,
      followUpQuestions,
      answerGuide: 'Tra loi bang tieng Nhat, ro rang va ngan gon.',
    },
    japaneseQa: buildInterviewQuestionSection(),
    readingAloud: {
      passageId: reading.id,
      title: reading.title,
      passageText: reading.text,
      instruction: 'Doc to doan van tren man hinh voi toc do on dinh va phat am ro rang.',
    },
    readingComprehension: {
      passageId: reading.id,
      passageTitle: reading.title,
      passageText: reading.text,
      questions: compQuestions,
      instruction: 'Tra loi ngan gon theo thu tu C1, C2, C3.',
    },
    typing: {
      sampleId: typing.id,
      title: typing.title,
      copyText: typing.text,
      instruction: 'Nhap lai doan van dung chinh ta Kanji/Kana. He thong do do chinh xac va toc do.',
    },
    dataTask: {
      taskId: dataTask.id,
      title: dataTask.title,
      instruction: dataTask.instruction,
      columns: dataTask.columns,
      rows: dataTask.rows,
      expectedHint: dataTask.expectedHint,
    },
  }
}

function buildAssessmentQuestionSet({ jobTitle = '' } = {}) {
  const readingItems = pickRandom(QUESTION_BANK.readingPassages, 2)
  const typing = pickOne(QUESTION_BANK.typingSamples) || QUESTION_BANK.typingSamples[0]

  return {
    version: QUESTION_SET_VERSION,
    generatedAt: nowIso(),
    japaneseQa: {
      title: 'Self-introduction / motivation / work-fit',
      introduction: `以下の質問に日本語で回答してください。${jobTitle || 'Japanese data-entry role'}への適性と仕事理解を確認します。`,
      answerGuide: '各質問に対して、簡潔かつ論理的に回答してください。',
      questions: [
        { id: 'qa-1', prompt: '自己紹介をしてください。' },
        { id: 'qa-2', prompt: 'なぜこの仕事に応募しましたか。' },
        { id: 'qa-3', prompt: 'あなたの強みと弱みを教えてください。' },
        { id: 'qa-4', prompt: '細かい作業を続けるとき、どのように集中力を保ちますか。' },
      ],
    },
    readingAloud: {
      title: 'Japanese reading aloud',
      instruction: '表示された文章をそのまま読み上げてください。各パッセージは1つずつ進みます。',
      items: readingItems.map((item, index) => ({
        id: item.id || `read-${index + 1}`,
        title: item.title,
        passageText: item.text,
        sourceType: index === 0 ? 'Work instruction' : 'Internal notice',
      })),
    },
    typing: {
      title: 'Japanese typing test',
      instruction: '各タスクを順番に完了してください。コピー入力とフォーム入力の両方を評価します。',
      tasks: [
        {
          id: typing.id || 'typing-copy',
          type: 'copy-typing',
          title: typing.title || 'Copy typing',
          instruction: '以下の日本語テキストをそのまま正確に入力してください。',
          sourceText: typing.text,
        },
        {
          id: 'typing-form-1',
          type: 'structured-form',
          title: 'Structured form input',
          instruction: '元データを見て、各項目を正しいフィールドに入力してください。',
          sourceText:
            '会社名: 株式会社東和ビジネス\n担当者: 鈴木一郎\n電話番号: 03-6811-2205\nメール: support@towa-biz.jp\n依頼番号: REF-22018',
          fields: [
            { key: 'companyName', label: 'Company Name', expectedValue: '株式会社東和ビジネス' },
            { key: 'contactPerson', label: 'Contact Person', expectedValue: '鈴木一郎' },
            { key: 'phoneNumber', label: 'Phone Number', expectedValue: '03-6811-2205' },
            { key: 'email', label: 'Email', expectedValue: 'support@towa-biz.jp' },
            { key: 'referenceCode', label: 'Reference Code', expectedValue: 'REF-22018' },
          ],
        },
      ],
    },
    dataTask: {
      title: 'Information extraction from business documents',
      instruction: '書類を確認し、指定された項目を正確に抽出してください。',
      documents: [
        {
          id: 'invoice-a',
          title: '請求書 A',
          instruction: '請求書を確認し、必要項目を正確に入力してください。',
          documentText:
            '株式会社青空商事\n請求書番号: INV-2026-0418\n得意先コード: C-1182\n発行日: 2026/04/18\n合計金額: 154,000円\n消費税: 14,000円\n住所: 東京都千代田区丸の内1-8-2\n電話番号: 03-5561-8821\n担当者: 佐藤恵',
          expectedFields: {
            companyName: '株式会社青空商事',
            invoiceNumber: 'INV-2026-0418',
            customerCode: 'C-1182',
            date: '2026/04/18',
            totalAmount: '154,000円',
            taxAmount: '14,000円',
            address: '東京都千代田区丸の内1-8-2',
            phoneNumber: '03-5561-8821',
            personInCharge: '佐藤恵',
          },
        },
        {
          id: 'invoice-b',
          title: '納品関連書類 B',
          instruction: '書類から会社情報・金額・担当者情報を抽出してください。',
          documentText:
            '株式会社みなとデータサービス\n管理番号: SL-88-203\n顧客コード: TK-2047\n作成日: 2026/05/02\n請求総額: 87,450円\n税額: 7,950円\n所在地: 大阪府大阪市北区梅田2-4-9\n連絡先: 06-6123-4400\n担当: 田中由美',
          expectedFields: {
            companyName: '株式会社みなとデータサービス',
            invoiceNumber: 'SL-88-203',
            customerCode: 'TK-2047',
            date: '2026/05/02',
            totalAmount: '87,450円',
            taxAmount: '7,950円',
            address: '大阪府大阪市北区梅田2-4-9',
            phoneNumber: '06-6123-4400',
            personInCharge: '田中由美',
          },
        },
      ],
    },
  }
}

function buildInterviewQuestionSection() {
  const prompts = [
    String.fromCodePoint(0x81ea, 0x5df1, 0x7d39, 0x4ecb, 0x3092, 0x3057, 0x3066, 0x304f, 0x3060, 0x3055, 0x3044, 0x3002),
    String.fromCodePoint(0x306a, 0x305c, 0x3053, 0x306e, 0x4ed5, 0x4e8b, 0x306b, 0x5fdc, 0x52df, 0x3057, 0x307e, 0x3057, 0x305f, 0x304b, 0x3002),
    String.fromCodePoint(0x3042, 0x306a, 0x305f, 0x306e, 0x5f37, 0x307f, 0x3068, 0x5f31, 0x307f, 0x3092, 0x6559, 0x3048, 0x3066, 0x304f, 0x3060, 0x3055, 0x3044, 0x3002),
    String.fromCodePoint(0x7d30, 0x304b, 0x3044, 0x4f5c, 0x696d, 0x3092, 0x7d9a, 0x3051, 0x308b, 0x3068, 0x304d, 0x3001, 0x3069, 0x306e, 0x3088, 0x3046, 0x306b, 0x96c6, 0x4e2d, 0x529b, 0x3092, 0x4fdd, 0x3061, 0x307e, 0x3059, 0x304b, 0x3002),
  ]

  return {
    title: 'Self-introduction / motivation / work-fit',
    introduction:
      'Answer each question in Japanese by audio or video. Provide a clear, relevant, and professional response before moving to the next question.',
    answerGuide:
      'Please answer clearly and logically in Japanese. Stay relevant to the question and speak in a professional tone.',
    questions: prompts.map((prompt, index) => ({ id: `qa-${index + 1}`, prompt })),
  }
}

function buildAssessmentQuestionSetV2({ jobTitle = '', candidateName = '' } = {}) {
  const readingItems = pickRandom(QUESTION_BANK.readingPassages, 2)
  const typing = pickOne(QUESTION_BANK.typingSamples) || QUESTION_BANK.typingSamples[0]
  const safeCandidateName = `${candidateName || '応募者名'}`.trim() || '応募者名'
  const safeJobTitle = `${jobTitle || 'Japanese data-entry role'}`.trim() || 'Japanese data-entry role'

  return {
    version: QUESTION_SET_VERSION,
    generatedAt: nowIso(),
    japaneseQa: {
      title: 'Basic Japanese work response',
      introduction:
        'Answer one short Japanese prompt at a time. Each answer is fixed or near-fixed so the system can check it clearly.',
      answerGuide:
        'Please answer exactly to the point. If a sentence is shown on screen, read it as written.',
      questions: [
        {
          id: 'qa-1',
          prompt: '画面に表示された氏名を、そのまま読んでください。',
          referenceText: safeCandidateName,
          expectedKeywords: safeCandidateName.split(/\s+/).filter(Boolean),
        },
        {
          id: 'qa-2',
          prompt: '応募職種を、そのまま読んでください。',
          referenceText: safeJobTitle,
          expectedKeywords: safeJobTitle.split(/\s+/).filter(Boolean),
        },
        {
          id: 'qa-3',
          prompt: '次の文をそのまま読んでください。',
          referenceText: 'フルタイム勤務が可能です。',
          expectedKeywords: ['フルタイム', '勤務', '可能'],
        },
        {
          id: 'qa-4',
          prompt: '次の文をそのまま読んでください。',
          referenceText: '数字・日付・氏名を正確に確認して入力します。',
          expectedKeywords: ['数字', '日付', '氏名', '正確', '入力'],
        },
      ],
    },
    readingAloud: {
      title: 'Japanese reading aloud',
      instruction: 'Read each business passage aloud. Complete one passage before moving to the next.',
      items: readingItems.map((item, index) => ({
        id: item.id || `read-${index + 1}`,
        title: item.title,
        passageText: item.text,
        sourceType: index === 0 ? 'Work instruction' : 'Internal notice',
      })),
    },
    typing: {
      title: 'Japanese typing test',
      instruction: 'Complete one typing task at a time. Accuracy is more important than rushing.',
      tasks: [
        {
          id: typing.id || 'typing-copy',
          type: 'copy-typing',
          title: typing.title || 'Copy typing',
          instruction: 'Type the Japanese text exactly as shown.',
          sourceText: typing.text,
        },
        {
          id: 'typing-form-1',
          type: 'structured-form',
          title: 'Structured form input',
          instruction: 'Read the source note and enter each value into the correct field.',
          sourceText:
            '会社名: 東和ビジネスサービス\n担当者: 鈴木一郎\n電話番号: 03-6811-2205\nメール: support@towa-biz.jp\n参照番号: REF-22018',
          fields: [
            { key: 'companyName', label: 'Company Name', expectedValue: '東和ビジネスサービス' },
            { key: 'contactPerson', label: 'Contact Person', expectedValue: '鈴木一郎' },
            { key: 'phoneNumber', label: 'Phone Number', expectedValue: '03-6811-2205' },
            { key: 'email', label: 'Email', expectedValue: 'support@towa-biz.jp' },
            { key: 'referenceCode', label: 'Reference Code', expectedValue: 'REF-22018' },
          ],
        },
      ],
    },
    dataTask: {
      title: 'Information extraction from business documents',
      instruction: 'Review each Japanese invoice or business document and extract the requested fields accurately.',
      documents: [
        {
          id: 'invoice-a',
          title: '請求書 A',
          instruction: '請求書を確認し、指定された項目をフォームに入力してください。',
          documentText:
            '株式会社青空商事\n請求番号: INV-2026-0418\n得意先コード: C-1182\n発行日: 2026/04/18\n合計金額: 154,000円\n消費税: 14,000円\n住所: 東京都千代田区丸の内1-8-2\n電話番号: 03-5561-8821\n担当者: 佐藤恵',
          expectedFields: {
            companyName: '株式会社青空商事',
            invoiceNumber: 'INV-2026-0418',
            customerCode: 'C-1182',
            date: '2026/04/18',
            totalAmount: '154,000円',
            taxAmount: '14,000円',
            address: '東京都千代田区丸の内1-8-2',
            phoneNumber: '03-5561-8821',
            personInCharge: '佐藤恵',
          },
        },
        {
          id: 'invoice-b',
          title: '納品関連書類 B',
          instruction: '書類を確認し、各フィールドに正しい情報を入力してください。',
          documentText:
            '株式会社みなとデータサービス\n管理番号: SL-88-203\n顧客コード: TK-2047\n作成日: 2026/05/02\n請求総額: 87,450円\n税額: 7,950円\n所在地: 大阪府大阪市北区梅田2-4-9\n連絡先: 06-6123-4400\n担当: 田中美',
          expectedFields: {
            companyName: '株式会社みなとデータサービス',
            invoiceNumber: 'SL-88-203',
            customerCode: 'TK-2047',
            date: '2026/05/02',
            totalAmount: '87,450円',
            taxAmount: '7,950円',
            address: '大阪府大阪市北区梅田2-4-9',
            phoneNumber: '06-6123-4400',
            personInCharge: '田中美',
          },
        },
      ],
    },
  }
}

function nowIso() {
  return new Date().toISOString()
}

function averageScoreColumn(rows = [], columnIndex, fallback = null) {
  const values = rows
    .map((row) => Number(row?.[columnIndex]))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return fallback
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function sectionLabel(sectionKey) {
  switch (sectionKey) {
    case 'japanese-qa':
      return 'Self-introduction / motivation / work-fit'
    case 'reading-aloud':
      return 'Reading Aloud'
    case 'typing':
      return 'Japanese Typing Test'
    case 'data-task':
      return 'Information Extraction'
    default:
      return sectionKey
  }
}

function sectionConfigFromQuestionSet(questionSet = {}, sectionKey) {
  switch (sectionKey) {
    case 'japanese-qa':
      return {
        instruction: questionSet.japaneseQa?.answerGuide || '',
        overview: questionSet.japaneseQa?.introduction || '',
        prompts: (questionSet.japaneseQa?.questions || []).map((item) => item.prompt).filter(Boolean),
        content: '',
        dataTable: null,
      }
    case 'reading-aloud':
      return {
        instruction: questionSet.readingAloud?.instruction || '',
        overview: questionSet.readingAloud?.title || '',
        prompts: (questionSet.readingAloud?.items || []).map((item) => `${item.title}: ${item.sourceType || ''}`.trim()).filter(Boolean),
        content: (questionSet.readingAloud?.items || []).map((item) => item.passageText).filter(Boolean).join('\n\n'),
        dataTable: null,
      }
    case 'typing':
      return {
        instruction: questionSet.typing?.instruction || '',
        overview: questionSet.typing?.title || '',
        prompts: (questionSet.typing?.tasks || []).map((item) => item.title).filter(Boolean),
        content: (questionSet.typing?.tasks || [])
          .map((item) => item.sourceText)
          .filter(Boolean)
          .join('\n\n'),
        dataTable: null,
      }
    case 'data-task':
      return {
        instruction: questionSet.dataTask?.instruction || '',
        overview: questionSet.dataTask?.title || '',
        prompts: (questionSet.dataTask?.documents || []).map((item) => item.title).filter(Boolean),
        content: (questionSet.dataTask?.documents || []).map((item) => item.documentText).filter(Boolean).join('\n\n'),
        dataTable: questionSet.dataTask?.documents?.[0]
          ? {
            columns: ['Field', 'Expected Value'],
            rows: Object.entries(questionSet.dataTask.documents[0].expectedFields || {}),
            expectedHint: questionSet.dataTask.documents[0].title || '',
          }
          : null,
      }
    default:
      return {
        instruction: '',
        overview: '',
        prompts: [],
        content: '',
        dataTable: null,
      }
  }
}

function buildSectionDetails(sessionLike) {
  const questionSet = sessionLike?.questionSet || {}
  const sectionResults = sessionLike?.sectionResults || {}
  return sectionOrder
    .map((sectionKey) => {
      const config = sectionConfigFromQuestionSet(questionSet, sectionKey)
      const result = sectionResults[sectionKey] || {}
      const hasContent = Boolean(
        result.completed ||
          result.media ||
          result.answer != null ||
          config.instruction ||
          config.overview ||
          config.content ||
          config.prompts?.length ||
          config.dataTable,
      )
      if (!hasContent) return null
      return {
        key: sectionKey,
        label: sectionLabel(sectionKey),
        completed: Boolean(result.completed),
        instruction: config.instruction,
        overview: config.overview,
        prompts: config.prompts,
        content: config.content,
        dataTable: config.dataTable,
        answer: result.answer ?? null,
        media: result.media || null,
      }
    })
    .filter(Boolean)
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function slugify(input) {
  return `${input || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
}

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase()
  if (ext === '.pdf' || ext === '.docx' || ext === '.webm' || ext === '.mp4' || ext === '.mp3' || ext === '.wav') {
    return ext
  }
  return '.bin'
}

function buildTestLink(code) {
  return `http://localhost:5173/#/candidate?code=${encodeURIComponent(code)}`
}

function levelToRank(levelText) {
  const text = `${levelText || ''}`.toUpperCase()
  if (text.includes('N1')) return 5
  if (text.includes('N2')) return 4
  if (text.includes('N3')) return 3
  if (text.includes('N4')) return 2
  if (text.includes('N5')) return 1
  return 0
}

function parseCandidateFromFilename(fileName) {
  const base = path.basename(fileName, path.extname(fileName))
  const parts = base.split(/[_\-\s]+/).filter(Boolean)
  const name = parts.length
    ? parts.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(' ')
    : 'Candidate'
  return {
    name,
    email: `${slugify(name)}@example.com`,
    phone: '',
    japaneseLevel: 'Unknown',
    startDate: '',
    summary: 'CV mới được upload, chờ parse chi tiết.',
  }
}

function extractTextSnippet(buffer) {
  if (!buffer) return ''
  const text = buffer
    .toString('utf8')
    .split('\0')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 12000)
}

function localMatch(job, candidate) {
  const factsText = (candidate.parsedFacts || []).map((row) => row.join(' ')).join(' ').toLowerCase()
  const insights = candidate.cvInsights || {}
  const insightText = `${(insights.skills || []).join(' ')} ${insights.experience || ''} ${insights.location || ''} ${
    insights.fullTime ? 'full-time' : ''
  }`.toLowerCase()
  const summary = `${candidate.summary || ''} ${candidate.cvSummary || ''}`.toLowerCase()
  const evidenceText = `${summary} ${factsText} ${insightText}`
  const requiredRank = levelToRank(job.jpLevel)
  const candidateRank = levelToRank(candidate.japaneseLevel)

  const japaneseScore = candidateRank >= requiredRank ? 30 : candidateRank === requiredRank - 1 ? 18 : 8
  const experienceScore = /back-office|data|qa|processing|entry/.test(evidenceText) ? 24 : 14
  const computerScore = /excel|google sheets|office/.test(evidenceText) ? 18 : 10
  const conditionScore = /ha noi|hanoi|full-time|full time/.test(evidenceText) ? 24 : 14
  const total = Math.max(0, Math.min(100, japaneseScore + experienceScore + computerScore + conditionScore))

  const requirementRows = [
    [
      `Japanese level required (${job.jpLevel || 'N/A'})`,
      candidate.japaneseLevel || 'Unknown',
      candidateRank >= requiredRank ? 'matched' : candidateRank === requiredRank - 1 ? 'partial' : 'missing',
    ],
    [
      'Full-time availability',
      /full-time|full time/.test(evidenceText) ? 'Full-time' : 'Unclear',
      /full-time|full time/.test(evidenceText) ? 'matched' : 'uncertain',
    ],
    [
      'Excel / office skill',
      /excel|office/.test(evidenceText) ? 'Evidence found' : 'No clear evidence',
      /excel|office/.test(evidenceText) ? 'matched' : 'missing',
    ],
    [
      'Relevant back-office/data experience',
      /data|back-office|processing|entry/.test(evidenceText) ? 'Evidence found' : 'Need review',
      /data|back-office|processing|entry/.test(evidenceText) ? 'matched' : 'partial',
    ],
  ]

  const strengths = []
  if (/excel/.test(evidenceText)) strengths.push('Excel proficiency highlighted in CV.')
  if (/japanese|n1|n2/.test(evidenceText)) strengths.push('Strong Japanese-language capability.')
  if (/process|sop|qa/.test(evidenceText)) strengths.push('Process-oriented working style.')
  if (strengths.length === 0) strengths.push('Candidate has baseline profile for manual HR review.')

  return {
    total,
    recommendation: total >= 80 ? 'proceed' : total >= 60 ? 'manual_review' : 'reject',
    requirementRows,
    strengths,
  }
}

function assessmentStatusFromStage(stage) {
  if (stage === 'assessment_in_progress') return 'in_progress'
  if (['assessment_completed', 'under_review', 'shortlisted', 'final_interview', 'hired'].includes(stage)) {
    return 'completed'
  }
  return 'not_started'
}

function stageCountTemplate() {
  return {
    applied: 0,
    cv_screening: 0,
    assessment_invited: 0,
    assessment_in_progress: 0,
    assessment_completed: 0,
    under_review: 0,
    shortlisted: 0,
    final_interview: 0,
    hired: 0,
    rejected: 0,
    expired: 0,
    abandoned: 0,
  }
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true })
}

async function removeDirIfExists(target) {
  try {
    await fs.rm(target, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors on local storage.
  }
}

async function ensureDataFiles() {
  await ensureDir(dataDir)
  await ensureDir(storageDir)
  await Promise.all(
    Object.values(dataFiles).map(async (fileName) => {
      const target = path.join(dataDir, fileName)
      try {
        await fs.access(target)
      } catch {
        const defaultValue = fileName === dataFiles.bootstrap ? '{"defaultLanguage":"vi"}' : '[]'
        await fs.writeFile(target, defaultValue, 'utf8')
      }
    }),
  )
}

async function loadEnvFile() {
  const envPath = path.join(appRoot, '.env')
  try {
    const content = await fs.readFile(envPath, 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const separator = trimmed.indexOf('=')
      if (separator <= 0) return
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim()
      if (key && runtimeEnv[key] === undefined) {
        runtimeEnv[key] = value
      }
    })
  } catch {
    // .env is optional in local setup
  }
}

async function readJson(name) {
  const filePath = path.join(dataDir, name)
  const content = await fs.readFile(filePath, 'utf8')
  return JSON.parse(content)
}

async function writeJson(name, data) {
  const filePath = path.join(dataDir, name)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

async function readState() {
  const [jobs, candidates, applications, sessions, reviews, submissions] = await Promise.all([
    readJson(dataFiles.jobs),
    readJson(dataFiles.candidates),
    readJson(dataFiles.applications),
    readJson(dataFiles.sessions),
    readJson(dataFiles.reviews),
    readJson(dataFiles.submissions),
  ])
  return { jobs, candidates, applications, sessions, reviews, submissions }
}

async function saveState(state) {
  await Promise.all([
    writeJson(dataFiles.jobs, state.jobs),
    writeJson(dataFiles.candidates, state.candidates),
    writeJson(dataFiles.applications, state.applications),
    writeJson(dataFiles.sessions, state.sessions),
    writeJson(dataFiles.reviews, state.reviews),
    writeJson(dataFiles.submissions, state.submissions),
  ])
}

function withDerivedJobs(jobs, applications) {
  return jobs.map((job) => {
    const byJob = applications.filter((appItem) => appItem.jobId === job.id)
    const candidateStageCounts = stageCountTemplate()
    byJob.forEach((appItem) => {
      if (candidateStageCounts[appItem.stage] !== undefined) {
        candidateStageCounts[appItem.stage] += 1
      }
    })
    const applicantCount = byJob.length
    const avgMatchScore = applicantCount
      ? Math.round(byJob.reduce((sum, appItem) => sum + Number(appItem.matchScore || 0), 0) / applicantCount)
      : 0
    const completionCount = byJob.filter((item) => item.assessmentStatus === 'completed').length
    const invitedCount = byJob.filter((item) =>
      ['assessment_invited', 'assessment_in_progress', 'assessment_completed', 'under_review', 'shortlisted', 'final_interview', 'hired'].includes(item.stage))
      .length
    const assessmentCompletionRate = invitedCount ? Math.round((completionCount / invitedCount) * 100) : 0

    return {
      ...job,
      applicantCount,
      avgMatchScore,
      assessmentCompletionRate,
      candidateStageCounts,
      candidateIds: byJob.map((item) => item.candidateId),
      canImportCV: !blockedImportStatuses.has(job.status),
    }
  })
}

async function saveBufferFile(parts, originalName, buffer) {
  const ext = safeExt(originalName)
  const fileName = `${Date.now()}-${Math.floor(Math.random() * 100000)}${ext}`
  const targetDir = path.join(storageDir, ...parts)
  await ensureDir(targetDir)
  const filePath = path.join(targetDir, fileName)
  await fs.writeFile(filePath, buffer)
  const relative = path.relative(__dirname, filePath).replaceAll('\\', '/')
  return `/${relative}`
}

function defaultSectionResults() {
  return {
    'japanese-qa': { completed: false, media: null, answer: { currentIndex: 0, responses: [] } },
    'reading-aloud': { completed: false, media: null, answer: { currentIndex: 0, responses: [] } },
    typing: { completed: false, media: null, answer: { currentIndex: 0, tasks: [] } },
    'data-task': { completed: false, media: null, answer: { currentIndex: 0, tasks: [] } },
  }
}

function ensureSectionResults(session) {
  if (!session) return false
  const previous = session.sectionResults || {}
  const defaults = defaultSectionResults()
  const next = {
    'japanese-qa': { ...defaults['japanese-qa'], ...(previous['japanese-qa'] || {}) },
    'reading-aloud': { ...defaults['reading-aloud'], ...(previous['reading-aloud'] || {}) },
    typing: { ...defaults.typing, ...(previous.typing || {}) },
    'data-task': { ...defaults['data-task'], ...(previous['data-task'] || {}) },
  }
  const changed = JSON.stringify(previous) !== JSON.stringify(next)
  if (changed) {
    session.sectionResults = next
  }
  return changed
}

function defaultProctoringState() {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    chunks: [],
    events: [],
    violations: {
      fullscreenExit: 0,
      tabHidden: 0,
      windowBlur: 0,
      pasteAttempt: 0,
      copyAttempt: 0,
    },
  }
}

function createAssessmentSession({ assessmentCode, candidate, job }) {
  const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  return {
    id: sessionId,
    assessmentCode,
    jobId: job.id,
    candidateId: candidate.id,
    candidateName: candidate.name,
    jobTitle: job.title,
    status: 'invited',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    consentAccepted: false,
    deviceCheck: { microphone: false, camera: false, network: false, savedAt: null },
    candidateConfirmation: {
      appliedRole: job.title,
      japaneseLevel: candidate.japaneseLevel || '',
      fullTimeAvailability: true,
      availableStartDate: candidate.startDate || '',
      shiftFit: '',
      reportIncorrectInfo: '',
      confirmAcknowledged: false,
      savedAt: null,
    },
    questionSet: {
      ...buildAssessmentQuestionSetV2({ jobTitle: job.title, candidateName: candidate.name }),
      japaneseQa: buildInterviewQuestionSection(),
    },
    sectionResults: defaultSectionResults(),
    proctoring: defaultProctoringState(),
    submissionStatus: 'draft',
    submittedAt: null,
  }
}

function ensureSessionQuestionSet(session) {
  if (!session) return false
  const generated = {
    ...buildAssessmentQuestionSetV2({
      jobTitle: session.jobTitle || '',
      candidateName: session.candidateName || '',
    }),
    japaneseQa: buildInterviewQuestionSection(),
  }
  const previous = session.questionSet || {}
  if (previous.version !== QUESTION_SET_VERSION) {
    session.questionSet = generated
    return true
  }
  const next = {
    version: QUESTION_SET_VERSION,
    generatedAt: previous.generatedAt || generated.generatedAt,
    japaneseQa: generated.japaneseQa,
    readingAloud: previous.readingAloud?.items?.length ? previous.readingAloud : generated.readingAloud,
    typing: previous.typing?.tasks?.length ? previous.typing : generated.typing,
    dataTask: previous.dataTask?.documents?.length ? previous.dataTask : generated.dataTask,
  }
  const changed = JSON.stringify(previous) !== JSON.stringify(next)
  if (changed) {
    session.questionSet = next
  }
  return changed
}

function ensureSessionProctoring(session) {
  if (!session) return false
  const previous = session.proctoring || {}
  const next = {
    ...defaultProctoringState(),
    ...previous,
    violations: {
      ...defaultProctoringState().violations,
      ...(previous.violations || {}),
    },
    chunks: Array.isArray(previous.chunks) ? previous.chunks : [],
    events: Array.isArray(previous.events) ? previous.events : [],
  }
  const changed = JSON.stringify(previous) !== JSON.stringify(next)
  if (changed) {
    session.proctoring = next
  }
  return changed
}

function clampNumber(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)))
}

function normalizeAnswerText(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function averageNumbers(values = [], fallback = 0) {
  const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
  if (!numeric.length) return fallback
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length)
}

function buildTypingCopyScore(task = {}, result = {}) {
  const sourceText = `${task.sourceText || result.sourceText || ''}`
  const inputText = `${result.inputText || ''}`
  const src = [...sourceText]
  const typed = [...inputText]
  let matches = 0
  for (let i = 0; i < typed.length; i += 1) {
    if (typed[i] === src[i]) matches += 1
  }
  const accuracyPercent = typed.length ? Math.round((matches / typed.length) * 100) : 0
  const completenessPercent = src.length ? Math.min(100, Math.round((typed.length / src.length) * 100)) : 0
  const elapsedSec = Math.max(1, Number(result.elapsedSec || 0) || 1)
  const cpm = Math.round((typed.length / elapsedSec) * 60)
  const speedScore = Math.min(100, Math.round((Math.min(cpm, 220) / 220) * 100))
  const correctionPenalty = Math.min(10, Math.floor(Number(result.corrections || 0) / 10) * 2)
  const pastePenalty = Math.min(25, Number(result.pasteAttempts || 0) * 10)
  const taskScore = clampNumber(accuracyPercent * 0.65 + completenessPercent * 0.2 + speedScore * 0.15 - correctionPenalty - pastePenalty)
  return {
    accuracyPercent,
    completenessPercent,
    cpm,
    elapsedSec,
    corrections: Number(result.corrections || 0),
    pasteAttempts: Number(result.pasteAttempts || 0),
    taskScore,
    note: `Accuracy ${accuracyPercent}%, speed ${cpm} CPM, completeness ${completenessPercent}%.`,
  }
}

function buildTypingFormScore(task = {}, result = {}) {
  const fields = Array.isArray(task.fields) ? task.fields : []
  const fieldValues = result.fieldValues || {}
  const rows = fields.map((field) => {
    const expected = `${field.expectedValue || ''}`
    const entered = `${fieldValues[field.key] || ''}`
    return {
      key: field.key,
      correct: normalizeAnswerText(expected) === normalizeAnswerText(entered),
    }
  })
  const accuracyPercent = rows.length ? Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) : 0
  const elapsedSec = Math.max(1, Number(result.elapsedSec || 0) || 1)
  const characterCount = Object.values(fieldValues).reduce((sum, value) => sum + `${value || ''}`.length, 0)
  const cpm = Math.round((characterCount / elapsedSec) * 60)
  const speedScore = Math.min(100, Math.round((Math.min(cpm, 180) / 180) * 100))
  const correctionPenalty = Math.min(10, Math.floor(Number(result.corrections || 0) / 10) * 2)
  const pastePenalty = Math.min(25, Number(result.pasteAttempts || 0) * 10)
  const taskScore = clampNumber(accuracyPercent * 0.8 + speedScore * 0.2 - correctionPenalty - pastePenalty)
  return {
    accuracyPercent,
    cpm,
    elapsedSec,
    corrections: Number(result.corrections || 0),
    pasteAttempts: Number(result.pasteAttempts || 0),
    taskScore,
    note: `Field accuracy ${accuracyPercent}% across ${rows.length} fields.`,
  }
}

function summarizeTypingSection(questionSet = {}, answer = {}) {
  const taskMap = new Map((questionSet.typing?.tasks || []).map((task) => [task.id, task]))
  const taskResults = (answer.tasks || []).map((result) => {
    const task = taskMap.get(result.taskId) || {}
    if (result.type === 'structured-form') {
      return { label: task.title || result.taskId || 'Structured form', ...buildTypingFormScore(task, result) }
    }
    return { label: task.title || result.taskId || 'Copy typing', ...buildTypingCopyScore(task, result) }
  })
  const sectionScore = averageNumbers(taskResults.map((item) => item.taskScore), 0)
  return {
    label: sectionLabel('typing'),
    score: sectionScore,
    note: taskResults.length ? taskResults.map((item) => `${item.label}: ${item.taskScore}`).join(' | ') : 'No typing data',
    details: taskResults,
  }
}

function summarizeDataTaskSection(questionSet = {}, answer = {}) {
  const documentMap = new Map((questionSet.dataTask?.documents || []).map((document) => [document.id, document]))
  const taskResults = (answer.tasks || []).map((result) => {
    const document = documentMap.get(result.documentId) || {}
    const expectedFields = document.expectedFields || {}
    const fieldValues = result.fieldValues || {}
    const keys = Object.keys(expectedFields)
    const correctCount = keys.filter((key) => normalizeAnswerText(expectedFields[key]) === normalizeAnswerText(fieldValues[key])).length
    const accuracyPercent = keys.length ? Math.round((correctCount / keys.length) * 100) : 0
    const missingCount = keys.filter((key) => !`${fieldValues[key] || ''}`.trim()).length
    const taskScore = clampNumber(accuracyPercent - missingCount * 3)
    return {
      label: document.title || result.documentId || 'Document',
      accuracyPercent,
      missingCount,
      taskScore,
      note: `${correctCount}/${keys.length} fields correct.`,
    }
  })
  const sectionScore = averageNumbers(taskResults.map((item) => item.taskScore), 0)
  return {
    label: sectionLabel('data-task'),
    score: sectionScore,
    note: taskResults.length ? taskResults.map((item) => `${item.label}: ${item.taskScore}`).join(' | ') : 'No extraction data',
    details: taskResults,
  }
}

function summarizeSpokenSection(sectionKey, answer = {}) {
  const responses = Array.isArray(answer.responses) ? answer.responses : []
  const scores = responses.map((item) => Number(item.aiScore || item.score || 0)).filter((value) => Number.isFinite(value) && value > 0)
  const sectionScore = averageNumbers(scores, 0)
  const transcriptSnippets = responses
    .filter((item) => item.transcript)
    .slice(0, 6)
    .map((item) => ({
      who: sectionKey === 'reading-aloud' ? 'Reading' : 'Candidate',
      text: `${item.prompt || item.itemId || ''}: ${item.transcript}`.trim(),
    }))
  return {
    label: sectionLabel(sectionKey),
    score: sectionScore,
    note: responses.length ? `${responses.length} item(s) captured.` : 'No spoken data',
    transcriptSnippets,
    details: responses,
  }
}

function riskLevelFromViolations(violations = {}) {
  const riskPoints =
    Number(violations.fullscreenExit || 0) * 3 +
    Number(violations.tabHidden || 0) * 2 +
    Number(violations.windowBlur || 0) * 1 +
    Number(violations.pasteAttempt || 0) * 3 +
    Number(violations.copyAttempt || 0) * 1
  if (riskPoints >= 12) return 'High'
  if (riskPoints >= 5) return 'Medium'
  return 'Low'
}

function recommendationFromScore(score, riskLevel) {
  if (score >= 80 && riskLevel !== 'High') return 'Proceed'
  if (score >= 60) return 'Manual Review'
  return 'Reject'
}

function buildReviewFromSession(session) {
  const spokenQa = summarizeSpokenSection('japanese-qa', session.sectionResults?.['japanese-qa']?.answer || {})
  const reading = summarizeSpokenSection('reading-aloud', session.sectionResults?.['reading-aloud']?.answer || {})
  const typing = summarizeTypingSection(session.questionSet || {}, session.sectionResults?.typing?.answer || {})
  const dataTask = summarizeDataTaskSection(session.questionSet || {}, session.sectionResults?.['data-task']?.answer || {})
  const scoredSections = [spokenQa, reading, typing, dataTask]
  const aiScore = averageNumbers(scoredSections.map((item) => item.score), 0)
  const riskLevel = riskLevelFromViolations(session.proctoring?.violations || {})
  const suspiciousSignals = [
    ['Tab hidden / tab switch', `${session.proctoring?.violations?.tabHidden || 0}`],
    ['Window blur', `${session.proctoring?.violations?.windowBlur || 0}`],
    ['Fullscreen exit', `${session.proctoring?.violations?.fullscreenExit || 0}`],
    ['Paste attempts', `${session.proctoring?.violations?.pasteAttempt || 0}`],
    ['Copy attempts', `${session.proctoring?.violations?.copyAttempt || 0}`],
  ]

  return {
    aiScore,
    hrAdjustedScore: aiScore,
    finalReviewedScore: aiScore,
    riskLevel,
    aiRecommendation: recommendationFromScore(aiScore, riskLevel),
    sectionScores: [
      ...scoredSections.map((item) => ({
        label: item.label,
        value: `${item.score}`,
        note: item.note,
      })),
      { label: 'Cheating Risk', value: riskLevel, note: 'Support signal only.' },
    ],
    transcriptSnippets: [
      ...spokenQa.transcriptSnippets,
      ...reading.transcriptSnippets,
      { who: 'System', text: 'Assessment submitted and scored automatically.' },
    ].slice(0, 12),
    suspiciousSignals,
    scoreComparison: scoredSections.map((item) => [
      item.label,
      `${item.score}`,
      `${item.score}`,
      `${item.score}`,
      item.note,
    ]),
    media: session.proctoring?.chunks || [],
    overrideHistory: [],
  }
}

function hasAnswer(answer) {
  if (typeof answer === 'string') return Boolean(answer.trim())
  if (answer && typeof answer === 'object') return Object.keys(answer).length > 0
  return false
}

function validateSessionForSubmit(session) {
  if (!session.consentAccepted) return 'Consent is required.'
  if (!session.deviceCheck.savedAt) return 'Device check is required.'
  const confirmation = session.candidateConfirmation || {}
  const confirmAcknowledged =
    confirmation.confirmAcknowledged === undefined ? Boolean(confirmation.savedAt) : Boolean(confirmation.confirmAcknowledged)
  if (!confirmation.savedAt || !confirmAcknowledged) return 'Candidate confirmation is required.'
  if (!session.proctoring?.startedAt) return 'Full-session proctoring has not started.'
  if (!session.proctoring?.chunks?.length) return 'Full-session recording is required before submit.'
  for (const key of sectionOrder) {
    const result = session.sectionResults[key]
    if (!result?.completed) return `Section ${key} is incomplete.`
    if (!hasAnswer(result.answer)) return `Section ${key} requires an answer.`
    if ((key === 'japanese-qa' || key === 'reading-aloud') && !result.media && !session.proctoring?.chunks?.length) {
      return `Section ${key} requires recorded media.`
    }
  }
  return null
}

function currentStep(session) {
  if (session.submissionStatus === 'submitted') return 'completion'
  if (!session.deviceCheck.savedAt) return 'device-check'
  if (!session.consentAccepted) return 'consent'
  const confirmation = session.candidateConfirmation || {}
  const confirmAcknowledged =
    confirmation.confirmAcknowledged === undefined ? Boolean(confirmation.savedAt) : Boolean(confirmation.confirmAcknowledged)
  if (!confirmation.savedAt || !confirmAcknowledged) return 'confirm-info'
  const nextPending = sectionOrder.find((key) => !session.sectionResults[key]?.completed)
  return nextPending || 'submit'
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ALTIUS Recruit API',
    version: 'vNext-local-2026-04-13',
      timestamp: nowIso(),
      env: {
      geminiConfigured: Boolean(runtimeEnv.GOOGLE_API_KEY),
      openaiConfigured: Boolean(runtimeEnv.OPENAI_API_KEY),
      },
  })
})

app.get('/api/bootstrap', asyncRoute(async (_req, res) => {
  const bootstrap = await readJson(dataFiles.bootstrap)
  res.json(bootstrap)
}))

app.get('/api/jobs', asyncRoute(async (_req, res) => {
  const { jobs, applications } = await readState()
  res.json(withDerivedJobs(jobs, applications))
}))

app.get('/api/jobs/:jobId', asyncRoute(async (req, res) => {
  const { jobs, applications } = await readState()
  const derived = withDerivedJobs(jobs, applications)
  const job = derived.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  return res.json(job)
}))

app.get('/api/recruiter/jobs', asyncRoute(async (req, res) => {
  const { jobs, applications } = await readState()
  const status = `${req.query.status || ''}`.trim()
  const derived = withDerivedJobs(jobs, applications)
  const filtered = status ? derived.filter((item) => item.status === status) : derived
  res.json({ jobs: filtered })
}))

app.post('/api/recruiter/jobs', asyncRoute(async (req, res) => {
  const state = await readState()
  const id = `${req.body.id || ''}`.trim().toUpperCase()
  if (!id) return res.status(400).json({ error: 'Job code is required.' })
  if (!/^[A-Z0-9-]{3,32}$/.test(id)) {
    return res.status(400).json({ error: 'Job code must contain only A-Z, 0-9 or -.' })
  }
  if (state.jobs.some((item) => item.id === id)) {
    return res.status(400).json({ error: 'Job code already exists.' })
  }

  const jdText = `${req.body.jdText || ''}`.trim()
  const code = `ALR-${slugify(id).toUpperCase()}-001`
  const job = {
    id,
    title: `${req.body.title || id}`.trim(),
    location: `${req.body.location || 'Ha Noi'}`.trim(),
    employment: `${req.body.employment || 'Full-time'}`.trim(),
    jpLevel: `${req.body.jpLevel || 'N3+'}`.trim(),
    shift: `${req.body.shift || 'Office hours'}`.trim(),
    department: 'Operations',
    owner: `${req.body.owner || 'HR Team'}`.trim(),
    priority: 'high',
    status: 'open',
    headcount: Number(req.body.headcount || 1),
    hiredCount: 0,
    applicantCount: 0,
    avgMatchScore: 0,
    assessmentCompletionRate: 0,
    summary: jdText ? jdText.slice(0, 180) : 'Job mới được tạo.',
    responsibilities: [],
    requirements: [],
    jdText,
    jdFilePath: null,
    assessmentCode: code,
    testLink: 'http://localhost:5173/#/assessment-entry',
    candidateStageCounts: stageCountTemplate(),
    candidateIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  state.jobs.push(job)
  await saveState(state)
  res.json({ ok: true, job })
}))

app.patch('/api/recruiter/jobs/:jobId', asyncRoute(async (req, res) => {
  const state = await readState()
  const job = state.jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  job.title = req.body.title ?? job.title
  job.jpLevel = req.body.jpLevel ?? job.jpLevel
  job.jdText = req.body.jdText ?? job.jdText
  job.location = req.body.location ?? job.location
  job.employment = req.body.employment ?? job.employment
  job.shift = req.body.shift ?? job.shift
  job.updatedAt = nowIso()
  await saveState(state)
  res.json({ ok: true, job })
}))

app.patch('/api/recruiter/jobs/:jobId/status', asyncRoute(async (req, res) => {
  const state = await readState()
  const job = state.jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  const nextStatus = `${req.body.status || ''}`.trim()
  if (!jobStatuses.has(nextStatus)) {
    return res.status(400).json({ error: 'Invalid job status.' })
  }
  job.status = nextStatus
  job.updatedAt = nowIso()
  await saveState(state)
  res.json({ ok: true, job })
}))

app.delete('/api/recruiter/jobs/:jobId', asyncRoute(async (req, res) => {
  const state = await readState()
  const targetJobId = req.params.jobId.toUpperCase()
  const job = state.jobs.find((item) => item.id === targetJobId)
  if (!job) return res.status(404).json({ error: 'Job not found.' })

  const relatedApplications = state.applications.filter((item) => item.jobId === job.id)
  const candidateIds = new Set(relatedApplications.map((item) => item.candidateId))
  const sessionIds = new Set(relatedApplications.map((item) => item.sessionId).filter(Boolean))
  const attemptIds = new Set(relatedApplications.map((item) => item.attemptId).filter(Boolean))

  state.candidates
    .filter((item) => item.jobId === job.id)
    .forEach((item) => {
      candidateIds.add(item.id)
      if (item.attemptId) attemptIds.add(item.attemptId)
    })

  state.jobs = state.jobs.filter((item) => item.id !== job.id)
  state.applications = state.applications.filter((item) => item.jobId !== job.id)
  state.candidates = state.candidates.filter((item) => !candidateIds.has(item.id) && item.jobId !== job.id)
  state.sessions = state.sessions.filter((item) => !sessionIds.has(item.id) && item.jobId !== job.id)
  state.submissions = state.submissions.filter(
    (item) => item.jobId !== job.id && !candidateIds.has(item.candidateId) && !sessionIds.has(item.sessionId),
  )
  state.reviews = state.reviews.filter(
    (item) => item.jobId !== job.id && !candidateIds.has(item.candidateId) && !attemptIds.has(item.attemptId),
  )

  await Promise.all([
    removeDirIfExists(path.join(storageDir, 'jd', job.id)),
    removeDirIfExists(path.join(storageDir, 'cvs', job.id)),
    ...[...sessionIds].map((sessionId) => removeDirIfExists(path.join(storageDir, 'assessment-media', sessionId))),
  ])

  await saveState(state)
  res.json({
    ok: true,
    deletedJobId: job.id,
    removedCandidates: candidateIds.size,
    removedApplications: relatedApplications.length,
  })
}))

app.post('/api/recruiter/jobs/:jobId/jd', upload.single('jd'), asyncRoute(async (req, res) => {
  const state = await readState()
  const job = state.jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  if (!req.file) return res.status(400).json({ error: 'JD file is required.' })
  job.jdFilePath = await saveBufferFile(['jd', job.id], req.file.originalname, req.file.buffer)
  job.updatedAt = nowIso()
  await saveState(state)
  res.json({ ok: true, jdFilePath: job.jdFilePath })
}))

app.post('/api/recruiter/jobs/:jobId/cvs', upload.array('cvs', 50), asyncRoute(async (req, res) => {
  const state = await readState()
  const job = state.jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  if (blockedImportStatuses.has(job.status)) {
    return res.status(400).json({ error: `Job status "${job.status}" cannot receive new CVs. Re-open job first.` })
  }
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'At least one CV file is required.' })

  const created = []
  for (const file of files) {
    const base = parseCandidateFromFilename(file.originalname)
    const cvText = extractTextSnippet(file.buffer)
    const parsed = await parseCvWithFallback({
      googleApiKey: runtimeEnv.GOOGLE_API_KEY,
      openaiApiKey: runtimeEnv.OPENAI_API_KEY,
      cvText,
      jdText: job.jdText,
      fileName: file.originalname,
    })
    const resolvedName = `${parsed.parsed.fullName || ''}`.trim() || base.name
    const resolvedEmail = `${parsed.parsed.email || ''}`.trim().toLowerCase() || base.email
    const resolvedPhone = `${parsed.parsed.phone || ''}`.trim() || base.phone
    const candidateId = `cand-${slugify(resolvedName)}-${Math.floor(Math.random() * 100000)}`
    const cvFilePath = await saveBufferFile(['cvs', job.id, candidateId], file.originalname, file.buffer)

    const candidate = {
      id: candidateId,
      jobId: job.id,
      name: resolvedName,
      role: job.title,
      stage: 'cv_screening',
      recommendation: 'Manual Review',
      risk: 'Low Risk',
      email: resolvedEmail,
      phone: resolvedPhone || '',
      japaneseLevel: parsed.parsed.japaneseLevel || base.japaneseLevel,
      startDate: base.startDate,
      summary: parsed.parsed.summary || base.summary,
      cvSummary: parsed.parsed.summary || 'CV đã được upload.',
      matchScore: 0,
      cvFilePath,
      cvTextSnapshot: cvText,
      parsedFacts: parsed.parsedFacts?.length ? parsed.parsedFacts : [['Source', 'Third-party CV import']],
      cvInsights: {
        location: parsed.parsed.locationFit || '',
        skills: parsed.parsed.skills || [],
        experience: parsed.parsed.experience || '',
        fullTime: Boolean(parsed.parsed.fullTime),
      },
      recruiterNotes: [],
      activity: [{ title: 'CV imported from third-party source', time: nowIso() }],
      storedRecords: ['Original CV file retained'],
      matching: {
        hardCriteria: job.jdText || '',
        softCriteria: 'Experience, process discipline, Excel and Japanese context',
        requiredConditions: `${job.location} / ${job.employment}`,
        requirementRows: [],
        standoutStrengths: parsed.parsed.strengths || [],
        scoreCards: [],
      },
      attemptId: null,
    }
    const application = {
      id: `app-${candidateId}-${job.id.toLowerCase()}`,
      candidateId,
      jobId: job.id,
      stage: 'cv_screening',
      matchScore: 0,
      recommendation: 'manual_review',
      assessmentStatus: 'not_started',
      assessmentCode: `ALR-${slugify(candidateId).toUpperCase()}`,
      sessionId: null,
      attemptId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    state.candidates.push(candidate)
    state.applications.push(application)
    created.push({ candidateId, applicationId: application.id, providerUsed: parsed.providerUsed })
  }

  await saveState(state)
  res.json({ ok: true, createdCount: created.length, created })
}))

app.post('/api/recruiter/jobs/:jobId/matching/recompute', asyncRoute(async (req, res) => {
  const state = await readState()
  const job = state.jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  const apps = state.applications.filter((item) => item.jobId === job.id)
  if (!apps.length) {
    return res.status(400).json({ error: 'No candidates found for this job. Upload CV first.' })
  }
  const providersUsed = new Set()
  let usedFallback = false
  let processedCount = 0

  for (const appItem of apps) {
    const candidate = state.candidates.find((item) => item.id === appItem.candidateId)
    if (!candidate) continue
    const parsed = await parseCvWithFallback({
      googleApiKey: runtimeEnv.GOOGLE_API_KEY,
      openaiApiKey: runtimeEnv.OPENAI_API_KEY,
      cvText: candidate.cvTextSnapshot || '',
      jdText: job.jdText || '',
      fileName: `${candidate.name}.cv`,
    })
    providersUsed.add(parsed.providerUsed)
    usedFallback = usedFallback || parsed.fallbackUsed

    candidate.summary = parsed.parsed.summary || candidate.summary
    candidate.cvSummary = parsed.parsed.summary || candidate.cvSummary
    candidate.japaneseLevel = parsed.parsed.japaneseLevel || candidate.japaneseLevel
    const parsedName = `${parsed.parsed.fullName || ''}`.trim()
    const parsedEmail = `${parsed.parsed.email || ''}`.trim().toLowerCase()
    const parsedPhone = `${parsed.parsed.phone || ''}`.trim()
    if (parsedName && (!candidate.name || candidate.name === 'Candidate')) {
      candidate.name = parsedName
    }
    if (parsedEmail && (!candidate.email || candidate.email.endsWith('@example.com'))) {
      candidate.email = parsedEmail
    }
    if (parsedPhone && !candidate.phone) {
      candidate.phone = parsedPhone
    }
    candidate.parsedFacts = parsed.parsedFacts?.length ? parsed.parsedFacts : candidate.parsedFacts
    candidate.cvInsights = {
      ...(candidate.cvInsights || {}),
      location: parsed.parsed.locationFit || candidate.cvInsights?.location || '',
      skills: parsed.parsed.skills || candidate.cvInsights?.skills || [],
      experience: parsed.parsed.experience || candidate.cvInsights?.experience || '',
      fullTime: parsed.parsed.fullTime ?? candidate.cvInsights?.fullTime ?? false,
    }

    const local = localMatch(job, candidate)
    appItem.matchScore = local.total
    appItem.recommendation = local.recommendation
    appItem.updatedAt = nowIso()
    candidate.matchScore = local.total
    candidate.recommendation =
      local.recommendation === 'proceed'
        ? 'Recommended to Proceed'
        : local.recommendation === 'manual_review'
          ? 'Manual Review'
          : 'Reject'
    candidate.matching = {
      ...candidate.matching,
      hardCriteria: job.jdText || 'Follow JD hard criteria',
      softCriteria: 'Experience, process discipline, Excel and Japanese context',
      requiredConditions: `${job.location} / ${job.employment}`,
      requirementRows: local.requirementRows,
      standoutStrengths: local.strengths,
    }
    processedCount += 1
  }
  if (!processedCount) {
    return res.status(400).json({ error: 'No valid candidate records found for recompute.' })
  }
  await saveState(state)
  const providers = [...providersUsed]
  res.json({
    ok: true,
    processedCount,
    providerUsed: providers[0] || 'rule_based',
    providersUsed: providers,
    fallbackUsed: usedFallback,
  })
}))

app.post('/api/recruiter/applications/:applicationId/invite', asyncRoute(async (req, res) => {
  const state = await readState()
  const application = state.applications.find((item) => item.id === req.params.applicationId)
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  const candidate = state.candidates.find((item) => item.id === application.candidateId)
  const job = state.jobs.find((item) => item.id === application.jobId)
  if (!candidate || !job) return res.status(404).json({ error: 'Candidate or job not found.' })

  application.stage = 'assessment_invited'
  application.assessmentStatus = 'not_started'
  application.updatedAt = nowIso()
  candidate.stage = application.stage

  if (application.sessionId) {
    const existingSession = state.sessions.find((item) => item.id === application.sessionId)
    if (!existingSession || existingSession.submissionStatus === 'submitted') {
      application.sessionId = null
    }
  }

  if (!application.sessionId) {
    const session = createAssessmentSession({
      assessmentCode: application.assessmentCode,
      candidate,
      job,
    })
    state.sessions.push(session)
    application.sessionId = session.id
  }

  await saveState(state)
  res.json({
    ok: true,
    testLink: buildTestLink(application.assessmentCode),
    sessionId: application.sessionId,
    code: application.assessmentCode,
  })
}))

app.patch('/api/recruiter/applications/:applicationId/stage', asyncRoute(async (req, res) => {
  const state = await readState()
  const application = state.applications.find((item) => item.id === req.params.applicationId)
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  application.stage = req.body.stage || application.stage
  application.assessmentStatus = assessmentStatusFromStage(application.stage)
  application.updatedAt = nowIso()
  const candidate = state.candidates.find((item) => item.id === application.candidateId)
  if (candidate) candidate.stage = application.stage
  await saveState(state)
  res.json({ ok: true, application })
}))

app.get('/api/recruiter/jobs/:jobId/results', asyncRoute(async (req, res) => {
  const { applications, reviews } = await readState()
  const byJob = applications.filter((item) => item.jobId === req.params.jobId.toUpperCase())
  const results = {}
  byJob.forEach((item) => {
    const review = item.attemptId ? reviews.find((entry) => entry.attemptId === item.attemptId) : null
    results[item.id] = {
      assessmentStatus: item.assessmentStatus,
      attemptId: item.attemptId,
      finalReviewedScore: review?.finalReviewedScore || null,
    }
  })
  res.json({ results })
}))

app.get('/api/recruiter/jobs/:jobId', asyncRoute(async (req, res) => {
  const state = await readState()
  const jobs = withDerivedJobs(state.jobs, state.applications)
  const job = jobs.find((item) => item.id === req.params.jobId.toUpperCase())
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  const candidates = state.applications
    .filter((item) => item.jobId === job.id)
    .map((appItem) => {
      const candidate = state.candidates.find((entry) => entry.id === appItem.candidateId)
      if (!candidate) return null
      return {
        id: candidate.id,
        applicationId: appItem.id,
        name: candidate.name,
        stage: appItem.stage,
        recommendation: candidate.recommendation,
        risk: candidate.risk,
        japaneseLevel: candidate.japaneseLevel,
        startDate: candidate.startDate,
        matchScore: appItem.matchScore || candidate.matchScore || 0,
        cvSummary: candidate.cvSummary,
        cvFilePath: candidate.cvFilePath,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore)
  res.json({ ...job, candidates })
}))

app.delete('/api/recruiter/candidates/:candidateId', asyncRoute(async (req, res) => {
  const state = await readState()
  const candidateId = req.params.candidateId
  const candidate = state.candidates.find((item) => item.id === candidateId)
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' })

  const relatedApplications = state.applications.filter((item) => item.candidateId === candidate.id)
  const sessionIds = new Set(relatedApplications.map((item) => item.sessionId).filter(Boolean))
  const attemptIds = new Set(relatedApplications.map((item) => item.attemptId).filter(Boolean))
  if (candidate.attemptId) attemptIds.add(candidate.attemptId)

  state.candidates = state.candidates.filter((item) => item.id !== candidate.id)
  state.applications = state.applications.filter((item) => item.candidateId !== candidate.id)
  state.sessions = state.sessions.filter((item) => item.candidateId !== candidate.id && !sessionIds.has(item.id))
  state.submissions = state.submissions.filter((item) => item.candidateId !== candidate.id && !sessionIds.has(item.sessionId))
  state.reviews = state.reviews.filter((item) => item.candidateId !== candidate.id && !attemptIds.has(item.attemptId))

  await Promise.all([
    removeDirIfExists(path.join(storageDir, 'cvs', candidate.jobId || '', candidate.id)),
    ...[...sessionIds].map((sessionId) => removeDirIfExists(path.join(storageDir, 'assessment-media', sessionId))),
  ])

  await saveState(state)
  res.json({
    ok: true,
    deletedCandidateId: candidate.id,
    removedApplications: relatedApplications.length,
  })
}))

app.get('/api/recruiter/candidates/:candidateId', asyncRoute(async (req, res) => {
  const state = await readState()
  const candidate = state.candidates.find((item) => item.id === req.params.candidateId)
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' })
  res.json(candidate)
}))

app.get('/api/recruiter/reviews/:attemptId', asyncRoute(async (req, res) => {
  const state = await readState()
  const review = state.reviews.find((item) => item.attemptId === req.params.attemptId)
  if (!review) return res.status(404).json({ error: 'Review not found.' })
  const application = state.applications.find((item) => item.attemptId === review.attemptId)
  const session = application?.sessionId ? state.sessions.find((item) => item.id === application.sessionId) : null
  const submission = application?.sessionId ? state.submissions.find((item) => item.sessionId === application.sessionId) : null
  const candidate = state.candidates.find((item) => item.id === review.candidateId)
  const job = state.jobs.find((item) => item.id === review.jobId)
  const reviewSource = session || submission || null
  const media = session
    ? Object.entries(session.sectionResults)
      .filter(([, value]) => value.media)
      .map(([sectionKey, value]) => ({ sectionKey, media: value.media }))
    : []
  const proctoringMedia = session?.proctoring?.chunks?.map((item, index) => ({
    sectionKey: `proctoring-${index + 1}`,
    media: item,
  })) || []
  res.json({
    ...review,
    candidateName: candidate?.name || '',
    jobTitle: job?.title || '',
    media: [...media, ...proctoringMedia],
    proctoring: session?.proctoring || null,
    questionSet: session?.questionSet || submission?.questionSet || null,
    sectionResults: session?.sectionResults || submission?.sectionResults || null,
    candidateConfirmation: session?.candidateConfirmation || submission?.candidateConfirmation || null,
    submittedAt: session?.submittedAt || submission?.submittedAt || null,
    sectionDetails: buildSectionDetails(reviewSource),
  })
}))

app.post('/api/recruiter/reviews/:attemptId/override', asyncRoute(async (req, res) => {
  const state = await readState()
  const review = state.reviews.find((item) => item.attemptId === req.params.attemptId)
  if (!review) return res.status(404).json({ error: 'Review not found.' })
  review.scoreComparison = req.body.scoreComparison || review.scoreComparison
  review.hrAdjustedScore = req.body.hrAdjustedScore ?? averageScoreColumn(review.scoreComparison, 2, review.hrAdjustedScore)
  review.finalReviewedScore = req.body.finalReviewedScore ?? averageScoreColumn(review.scoreComparison, 3, review.finalReviewedScore)
  review.overrideHistory = review.overrideHistory || []
  review.overrideHistory.push({
    at: nowIso(),
    by: 'Recruiter',
    summary: req.body.reason || 'Manual override saved',
  })
  await saveState(state)
  res.json({ ok: true, review })
}))

app.get('/api/assessment/entry', asyncRoute(async (req, res) => {
  const code = `${req.query.code || ''}`.trim()
  if (!code) {
    return res.status(400).json({
      error: 'Invitation code is required.',
      errorCode: 'invalid_code',
    })
  }
  const state = await readState()
  let shouldSave = false
  const application = state.applications.find((item) => item.assessmentCode === code)
  if (!application) {
    return res.status(404).json({
      error: 'Invitation code is not valid.',
      errorCode: 'invalid_code',
    })
  }

  if (application.sessionId) {
    const existingSession = state.sessions.find((item) => item.id === application.sessionId)
    if (existingSession && ensureSessionQuestionSet(existingSession)) {
      shouldSave = true
    }
    if (existingSession && ensureSectionResults(existingSession)) {
      shouldSave = true
    }
    if (existingSession && ensureSessionProctoring(existingSession)) {
      shouldSave = true
    }
    if (!existingSession || existingSession.submissionStatus === 'submitted') {
      application.sessionId = null
      application.stage = 'assessment_invited'
      application.assessmentStatus = 'not_started'
      shouldSave = true
    }
    if (existingSession && Date.parse(existingSession.expiresAt) < Date.now() && existingSession.submissionStatus !== 'submitted') {
      return res.status(410).json({
        error: 'Invitation code is expired.',
        errorCode: 'expired_code',
      })
    }
  }

  if (!application.sessionId) {
    const candidate = state.candidates.find((item) => item.id === application.candidateId)
    const job = state.jobs.find((item) => item.id === application.jobId)
    if (!candidate || !job) {
      return res.status(404).json({
        error: 'Linked candidate/job not found.',
        errorCode: 'invalid_code',
      })
    }
    const session = createAssessmentSession({
      assessmentCode: code,
      candidate,
      job,
    })
    state.sessions.push(session)
    application.sessionId = session.id
    application.stage = 'assessment_invited'
    application.assessmentStatus = 'not_started'
    shouldSave = true
  }
  if (shouldSave) {
    await saveState(state)
  }
  res.json({ ok: true, code, sessionId: application.sessionId, testLink: buildTestLink(code) })
}))

app.get('/api/assessment/sessions/:sessionId', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  let shouldSave = ensureSessionQuestionSet(session)
  shouldSave = ensureSectionResults(session) || shouldSave
  shouldSave = ensureSessionProctoring(session) || shouldSave
  if (Date.parse(session.expiresAt) < Date.now() && session.submissionStatus !== 'submitted') {
    session.status = 'expired'
    shouldSave = true
  }
  if (shouldSave) {
    await saveState(state)
  }
  if (session.status === 'expired' && session.submissionStatus !== 'submitted') {
    return res.status(410).json({ error: 'Session expired.', errorCode: 'expired_code' })
  }
  res.json({ ...session, currentStep: currentStep(session) })
}))

app.post('/api/assessment/sessions/:sessionId/device-check', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  session.deviceCheck = {
    microphone: Boolean(req.body.microphone),
    camera: Boolean(req.body.camera),
    network: Boolean(req.body.network),
    savedAt: nowIso(),
  }
  const application = state.applications.find((item) => item.sessionId === session.id)
  if (application && application.stage === 'assessment_invited') {
    application.stage = 'assessment_in_progress'
    application.assessmentStatus = 'in_progress'
    application.updatedAt = nowIso()
  }
  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/consent', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  session.consentAccepted = Boolean(req.body.consentAccepted)
  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/confirm-info', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  if (!req.body.confirmAcknowledged) {
    return res.status(400).json({ error: 'Please confirm candidate information before continuing.' })
  }
  session.candidateConfirmation = {
    appliedRole: req.body.appliedRole ?? session.candidateConfirmation.appliedRole,
    japaneseLevel: req.body.japaneseLevel ?? session.candidateConfirmation.japaneseLevel,
    fullTimeAvailability: Boolean(req.body.fullTimeAvailability),
    availableStartDate: req.body.availableStartDate ?? session.candidateConfirmation.availableStartDate,
    shiftFit: req.body.shiftFit ?? session.candidateConfirmation.shiftFit,
    reportIncorrectInfo: req.body.reportIncorrectInfo ?? '',
    confirmAcknowledged: Boolean(req.body.confirmAcknowledged),
    savedAt: nowIso(),
  }
  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/proctoring/start', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  if (!session.consentAccepted) {
    return res.status(400).json({ error: 'Consent is required before starting proctoring.' })
  }

  if (!session.proctoring.startedAt) {
    session.proctoring.startedAt = nowIso()
  }
  session.proctoring.status = 'recording'
  session.proctoring.lastHeartbeatAt = nowIso()
  session.proctoring.deviceMeta = {
    userAgent: req.body?.userAgent || '',
    viewport: req.body?.viewport || null,
    platform: req.body?.platform || '',
  }
  session.proctoring.events.push({
    type: 'proctoring_started',
    at: nowIso(),
    stepKey: req.body?.stepKey || '',
  })

  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/proctoring/event', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  const type = `${req.body?.type || ''}`.trim()
  if (!type) return res.status(400).json({ error: 'Event type is required.' })

  const counters = session.proctoring.violations
  if (type === 'fullscreen_exit') counters.fullscreenExit += 1
  if (type === 'tab_hidden') counters.tabHidden += 1
  if (type === 'window_blur') counters.windowBlur += 1
  if (type === 'paste_attempt') counters.pasteAttempt += 1
  if (type === 'copy_attempt') counters.copyAttempt += 1

  session.proctoring.lastHeartbeatAt = nowIso()
  session.proctoring.events.push({
    type,
    at: nowIso(),
    detail: req.body?.detail || '',
    stepKey: req.body?.stepKey || '',
  })

  await saveState(state)
  res.json({ ok: true, violations: session.proctoring.violations })
}))

app.post('/api/assessment/sessions/:sessionId/proctoring/chunk', upload.single('chunk'), asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  if (!req.file) return res.status(400).json({ error: 'Recording chunk is required.' })

  const chunkPath = await saveBufferFile(['assessment-media', session.id, 'proctoring'], req.file.originalname, req.file.buffer)
  const chunkMeta = {
    path: chunkPath,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: nowIso(),
    sequence: Number(req.body?.sequence || session.proctoring.chunks.length + 1),
  }
  session.proctoring.chunks.push(chunkMeta)
  session.proctoring.lastHeartbeatAt = nowIso()

  await saveState(state)
  res.json({
    ok: true,
    chunk: chunkMeta,
    chunkCount: session.proctoring.chunks.length,
  })
}))

app.post('/api/assessment/sessions/:sessionId/proctoring/stop', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)

  session.proctoring.status = 'stopped'
  if (!session.proctoring.startedAt) {
    session.proctoring.startedAt = nowIso()
  }
  session.proctoring.endedAt = nowIso()
  session.proctoring.events.push({
    type: 'proctoring_stopped',
    at: session.proctoring.endedAt,
    stepKey: req.body?.stepKey || '',
  })

  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/sections/:sectionKey/media', upload.single('media'), asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  const sectionKey = req.params.sectionKey
  if (!session.sectionResults[sectionKey]) return res.status(404).json({ error: 'Section not found.' })
  if (!req.file) return res.status(400).json({ error: 'Media file is required.' })
  const mediaPath = await saveBufferFile(['assessment-media', session.id, sectionKey], req.file.originalname, req.file.buffer)
  session.sectionResults[sectionKey].media = {
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    path: mediaPath,
    uploadedAt: nowIso(),
  }
  session.sectionResults[sectionKey].completed = true
  await saveState(state)
  res.json({
    ok: true,
    media: session.sectionResults[sectionKey].media,
    session: { ...session, currentStep: currentStep(session) },
  })
}))

app.post('/api/assessment/sessions/:sessionId/sections/:sectionKey/score-spoken', upload.single('media'), asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  if (!req.file) return res.status(400).json({ error: 'Recorded media is required.' })

  let expectedKeywords = []
  try {
    expectedKeywords = JSON.parse(`${req.body.expectedKeywords || '[]'}`)
    if (!Array.isArray(expectedKeywords)) expectedKeywords = []
  } catch {
    expectedKeywords = []
  }

  const result = await evaluateAssessmentSpeech({
    apiKey: runtimeEnv.OPENAI_API_KEY,
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    fileName: req.file.originalname,
    language: `${req.body.language || 'ja'}`.trim() || 'ja',
    sectionKey: req.params.sectionKey,
    prompt: `${req.body.prompt || ''}`.trim(),
    referenceText: `${req.body.referenceText || ''}`.trim(),
    expectedKeywords,
  })

  res.json({ ok: true, result })
}))

app.post('/api/assessment/sessions/:sessionId/sections/:sectionKey/answer', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  const sectionKey = req.params.sectionKey
  if (!session.sectionResults[sectionKey]) return res.status(404).json({ error: 'Section not found.' })
  const rawAnswer = req.body.answer
  let answer = null
  if (typeof rawAnswer === 'string') {
    answer = rawAnswer.trim()
  } else if (rawAnswer && typeof rawAnswer === 'object') {
    answer = rawAnswer
  }
  if (!hasAnswer(answer)) return res.status(400).json({ error: 'Answer is required.' })
  session.sectionResults[sectionKey].answer = answer
  session.sectionResults[sectionKey].completed = Boolean(req.body.completed ?? true)
  await saveState(state)
  res.json({ ok: true, session: { ...session, currentStep: currentStep(session) } })
}))

app.post('/api/assessment/sessions/:sessionId/submit', asyncRoute(async (req, res) => {
  const state = await readState()
  const session = state.sessions.find((item) => item.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  ensureSessionQuestionSet(session)
  ensureSectionResults(session)
  ensureSessionProctoring(session)
  const validationError = validateSessionForSubmit(session)
  if (validationError) return res.status(400).json({ error: validationError })

  session.status = 'completed'
  session.submissionStatus = 'submitted'
  session.submittedAt = nowIso()
  if (!session.proctoring.endedAt) {
    session.proctoring.endedAt = session.submittedAt
  }
  session.proctoring.status = 'stopped'
  state.submissions.push({
    id: `sub-${Date.now()}`,
    sessionId: session.id,
    candidateId: session.candidateId,
    jobId: session.jobId,
    submittedAt: session.submittedAt,
    questionSet: session.questionSet || null,
    sectionResults: session.sectionResults,
    candidateConfirmation: session.candidateConfirmation,
  })

  const application = state.applications.find((item) => item.sessionId === session.id)
  if (application) {
    application.stage = 'assessment_completed'
    application.assessmentStatus = 'completed'
    application.updatedAt = nowIso()
    if (!application.attemptId) {
      application.attemptId = `attempt-${slugify(session.candidateName)}-${Date.now()}`
    }
    const candidate = state.candidates.find((item) => item.id === application.candidateId)
    if (candidate) {
      candidate.stage = 'assessment_completed'
      candidate.attemptId = application.attemptId
      candidate.activity = candidate.activity || []
      candidate.activity.push({ title: 'Assessment completed by candidate', time: nowIso() })
    }
    if (!state.reviews.some((item) => item.attemptId === application.attemptId)) {
      const autoReview = buildReviewFromSession(session)
      state.reviews.push({
        attemptId: application.attemptId,
        candidateId: application.candidateId,
        jobId: application.jobId,
        ...autoReview,
      })
    }
  }

  await saveState(state)
  res.json({
    ok: true,
    submittedAt: session.submittedAt,
    session: { ...session, currentStep: currentStep(session) },
  })
}))

app.use((error, _req, res, _next) => {
  void _next
  const message = error?.message || 'Internal server error.'
  console.error('[API ERROR]', message)
  res.status(500).json({ error: message })
})

const port = Number(runtimeEnv.PORT || 3001)
Promise.all([loadEnvFile(), ensureDataFiles()]).then(() => {
  app.listen(port, () => {
    console.log(`ALTIUS Recruit API listening on http://localhost:${port}`)
  })
})
