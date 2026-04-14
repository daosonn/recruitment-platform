function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function detectJapaneseLevel(text) {
  const match = `${text || ''}`.match(/\bN[1-5]\b/i)
  return match ? match[0].toUpperCase() : 'Unknown'
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = `${value || ''}`.trim().toLowerCase()
  return ['true', 'yes', '1', 'available'].includes(normalized)
}

function extractEmail(text) {
  const match = `${text || ''}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0].toLowerCase() : ''
}

function extractPhone(text) {
  const matches = `${text || ''}`.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)
  if (!matches?.length) return ''
  const preferred = matches.find((value) => /0\d{8,10}/.test(value.replace(/\D/g, '')))
  const raw = preferred || matches[0]
  const compact = raw.replace(/[^\d+]/g, '')
  return compact.length >= 9 ? compact : ''
}

function normalizeName(value, fallback = '') {
  const raw = `${value || ''}`.trim()
  if (!raw) return fallback
  return raw
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function extractNameFromText(text, fallbackName = '') {
  const source = `${text || ''}`
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const labeledLine = lines.find((line) => /^(name|full name|ho ten|candidate)\s*[:-]/i.test(line))
  if (labeledLine) {
    const value = labeledLine.split(/[:-]/).slice(1).join(':').trim()
    if (value && value.length <= 80) return value
  }
  const firstLetterLine = lines.find((line) => /^[\p{L}\s'.-]{3,80}$/u.test(line) && !/\d/.test(line))
  if (firstLetterLine) return firstLetterLine
  return fallbackName
}

function toFacts(parsed) {
  const facts = []
  if (parsed.fullName) facts.push(['Candidate Name', parsed.fullName])
  if (parsed.email) facts.push(['Email', parsed.email])
  if (parsed.phone) facts.push(['Phone', parsed.phone])
  if (parsed.japaneseLevel) facts.push(['Japanese Level', parsed.japaneseLevel])
  if (parsed.fullTime !== undefined) facts.push(['Full-time availability', parsed.fullTime ? 'Yes' : 'No/Unclear'])
  return facts
}

function buildRuleBasedParse({ cvText, fileName = '' }) {
  const text = `${cvText || ''} ${fileName}`.trim()
  const normalized = text.toLowerCase()
  const baseFromFile = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ') : ''
  const fullName = normalizeName(extractNameFromText(cvText || '', baseFromFile), '')
  const email = extractEmail(text)
  const phone = extractPhone(text)
  const japaneseLevel = detectJapaneseLevel(text)

  const skills = []
  if (normalized.includes('excel')) skills.push('Excel')
  if (normalized.includes('google sheet')) skills.push('Google Sheets')
  if (normalized.includes('data entry')) skills.push('Data Entry')
  if (normalized.includes('back-office') || normalized.includes('back office')) skills.push('Back-office')
  if (normalized.includes('qa')) skills.push('QA')

  const fullTime = normalized.includes('full-time') || normalized.includes('full time')
  const locationFit = normalized.includes('ha noi') || normalized.includes('hanoi') ? 'Ha Noi' : ''
  const experience = normalized.includes('year') ? 'Experience detected from CV text.' : 'Need manual review.'
  const summary = text
    ? `CV imported and parsed with local fallback. Japanese level ${japaneseLevel}.`
    : 'CV imported. Awaiting detailed parsing.'

  const parsed = {
    fullName,
    email,
    phone,
    summary,
    japaneseLevel,
    fullTime,
    locationFit,
    skills,
    experience,
    strengths: [
      japaneseLevel !== 'Unknown' ? `Japanese level ${japaneseLevel}` : 'Japanese level needs review',
      skills.includes('Excel') ? 'Excel evidence found' : 'Excel evidence not clear',
    ],
  }

  return {
    parsed,
    parsedFacts: toFacts(parsed),
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeProviderParse(payload) {
  const parsed = {
    fullName: normalizeName(payload?.fullName || payload?.full_name || payload?.name || ''),
    email: `${payload?.email || ''}`.trim().toLowerCase(),
    phone: `${payload?.phone || payload?.phoneNumber || payload?.phone_number || ''}`.trim(),
    summary: payload?.summary || 'AI parsed summary unavailable.',
    japaneseLevel: payload?.japaneseLevel || payload?.japanese_level || 'Unknown',
    fullTime: toBoolean(payload?.fullTime ?? payload?.full_time),
    locationFit: payload?.locationFit || payload?.location_fit || '',
    skills: Array.isArray(payload?.skills) ? payload.skills.slice(0, 8) : [],
    experience: payload?.experience || '',
    strengths: Array.isArray(payload?.strengths) ? payload.strengths.slice(0, 6) : [],
  }
  return { parsed, parsedFacts: toFacts(parsed) }
}

function normalizeCompareText(text) {
  return `${text || ''}`
    .toLowerCase()
    .replace(/[「」『』（）()\-.,/\\:;!?'"`~。、「」・]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function levenshteinDistance(a = '', b = '') {
  const left = [...a]
  const right = [...b]
  if (!left.length) return right.length
  if (!right.length) return left.length
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0))
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[left.length][right.length]
}

function similarityRatio(a = '', b = '') {
  const left = normalizeCompareText(a)
  const right = normalizeCompareText(b)
  if (!left && !right) return 1
  if (!left || !right) return 0
  const distance = levenshteinDistance(left, right)
  return Math.max(0, 1 - distance / Math.max(left.length, right.length, 1))
}

function keywordCoverage(text = '', keywords = []) {
  if (!keywords.length) return 1
  const normalizedText = normalizeCompareText(text)
  const matched = keywords.filter((keyword) => normalizedText.includes(normalizeCompareText(keyword)))
  return matched.length / keywords.length
}

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)))
}

function fallbackFixedResponseScore({ transcript = '', referenceText = '', expectedKeywords = [] }) {
  const transcriptSimilarity = similarityRatio(transcript, referenceText)
  const coverage = keywordCoverage(transcript, expectedKeywords)
  const base = referenceText ? 55 + transcriptSimilarity * 35 : 55 + coverage * 35
  const score = clampScore(base + coverage * 10)
  return {
    score,
    summary: transcript
      ? 'Transcript captured and scored with fallback matching.'
      : 'Audio captured but transcript was not available.',
    correctness: clampScore(coverage * 100),
    clarity: transcript ? Math.max(60, score - 5) : 40,
    keywordCoverage: clampScore(coverage * 100),
    matchedPhrases: expectedKeywords.filter((keyword) => normalizeCompareText(transcript).includes(normalizeCompareText(keyword))),
  }
}

function fallbackReadingScore({ transcript = '', referenceText = '' }) {
  const similarity = similarityRatio(transcript, referenceText)
  const accuracyScore = clampScore(55 + similarity * 40)
  const transcriptLength = normalizeCompareText(transcript).length
  const sourceLength = normalizeCompareText(referenceText).length
  const paceRatio = sourceLength ? Math.min(1.2, transcriptLength / sourceLength) : 0.8
  const fluencyScore = clampScore(60 + paceRatio * 25)
  return {
    score: clampScore(accuracyScore * 0.7 + fluencyScore * 0.3),
    accuracyScore,
    fluencyScore,
    summary: transcript
      ? 'Reading was scored with transcript-to-source comparison.'
      : 'Audio captured but transcript was not available.',
    majorMisreadings: [],
    omissionRate: clampScore((1 - similarity) * 100),
  }
}

function fallbackOpenEndedInterviewScore({ transcript = '', prompt = '' }) {
  const normalized = `${transcript || ''}`.trim()
  const length = normalized.length
  const questionTerms = `${prompt || ''}`
    .replace(/[。、「」・?？!！]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
  const matchedTerms = questionTerms.filter((term) => normalized.includes(term))
  const relevanceRatio = questionTerms.length ? matchedTerms.length / questionTerms.length : 0.6
  const hasEnoughContent = length >= 25
  const structureBoost = /。|、|です|ます/.test(normalized) ? 1 : 0
  const baseScore = hasEnoughContent ? 62 : 46
  const score = clampScore(baseScore + Math.min(18, length / 8) + relevanceRatio * 10 + structureBoost * 4)

  return {
    score,
    summary: normalized
      ? 'Transcript captured and scored with a fallback interview rubric.'
      : 'Audio captured but transcript was not available.',
    understanding: clampScore(55 + relevanceRatio * 30 + structureBoost * 5),
    relevance: clampScore(50 + relevanceRatio * 35),
    clarity: clampScore(hasEnoughContent ? 72 : 52),
    logic: clampScore(hasEnoughContent ? 70 + structureBoost * 5 : 50),
    motivationFit: clampScore(60 + Math.min(15, length / 12)),
    workFit: clampScore(60 + Math.min(15, length / 12) + structureBoost * 5),
  }
}

function fallbackInterviewRubricScore({ transcript = '', prompt = '' }) {
  const normalized = `${transcript || ''}`.trim()
  const length = normalized.length
  const questionTerms = `${prompt || ''}`
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
  const matchedTerms = questionTerms.filter((term) => normalized.includes(term))
  const relevanceRatio = questionTerms.length ? matchedTerms.length / questionTerms.length : 0.6
  const hasEnoughContent = length >= 25
  const structureBoost = /[.!?]/.test(normalized) || /(です|ます)/.test(normalized) ? 1 : 0
  const baseScore = hasEnoughContent ? 62 : 46
  const score = clampScore(baseScore + Math.min(18, length / 8) + relevanceRatio * 10 + structureBoost * 4)

  return {
    score,
    summary: normalized
      ? 'Transcript captured and scored with a fallback interview rubric.'
      : 'Audio captured but transcript was not available.',
    understanding: clampScore(55 + relevanceRatio * 30 + structureBoost * 5),
    relevance: clampScore(50 + relevanceRatio * 35),
    clarity: clampScore(hasEnoughContent ? 72 : 52),
    logic: clampScore(hasEnoughContent ? 70 + structureBoost * 5 : 50),
    motivationFit: clampScore(60 + Math.min(15, length / 12)),
    workFit: clampScore(60 + Math.min(15, length / 12) + structureBoost * 5),
  }
}

async function transcribeAudioWithOpenAI({ apiKey, buffer, mimeType = 'video/webm', fileName = 'spoken-response.webm', language = 'ja' }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const formData = new FormData()
  formData.append('model', 'gpt-4o-mini-transcribe')
  formData.append('language', language)
  formData.append('response_format', 'json')
  formData.append('temperature', '0')
  formData.append('file', new Blob([buffer], { type: mimeType }), fileName)

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
    30000,
  )

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed (${response.status}).`)
  }

  const payload = await response.json()
  return `${payload?.text || ''}`.trim()
}

async function runJsonReviewPrompt({ apiKey, systemPrompt, userPrompt }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
    30000,
  )

  if (!response.ok) {
    throw new Error(`OpenAI review request failed (${response.status}).`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content || '{}'
  const parsed = safeJsonParse(content)
  if (!parsed) {
    throw new Error('OpenAI review returned non-JSON response.')
  }
  return parsed
}

export async function evaluateFixedJapaneseResponse({
  apiKey,
  transcript,
  prompt,
  referenceText,
  expectedKeywords = [],
}) {
  try {
    const review = await runJsonReviewPrompt({
      apiKey,
      systemPrompt:
        'You review short Japanese recruitment-test answers. Return JSON only with keys: score, summary, correctness, clarity, keywordCoverage, matchedPhrases. Score gently but keep obvious wrong answers low.',
      userPrompt: [
        `Prompt: ${prompt || ''}`,
        `Expected answer/reference: ${referenceText || ''}`,
        `Expected keywords: ${(expectedKeywords || []).join(', ')}`,
        `Transcript: ${transcript || ''}`,
        'Evaluate whether the spoken response matches the expected answer and is understandable.',
      ].join('\n'),
    })

    return {
      score: clampScore(review.score),
      summary: review.summary || 'AI reviewed the spoken response.',
      correctness: clampScore(review.correctness),
      clarity: clampScore(review.clarity),
      keywordCoverage: clampScore(review.keywordCoverage),
      matchedPhrases: Array.isArray(review.matchedPhrases) ? review.matchedPhrases.slice(0, 8) : [],
    }
  } catch {
    return fallbackFixedResponseScore({ transcript, referenceText, expectedKeywords })
  }
}

export async function evaluateJapaneseReading({
  apiKey,
  transcript,
  referenceText,
  prompt,
}) {
  try {
    const review = await runJsonReviewPrompt({
      apiKey,
      systemPrompt:
        'You review Japanese reading-aloud transcripts for a recruitment test. Return JSON only with keys: score, accuracyScore, fluencyScore, summary, majorMisreadings, omissionRate. Score gently because ASR may not be perfect.',
      userPrompt: [
        `Reading item: ${prompt || ''}`,
        `Source passage: ${referenceText || ''}`,
        `ASR transcript: ${transcript || ''}`,
        'Compare the transcript to the source text and evaluate reading accuracy, omissions, major misreadings, and basic fluency.',
      ].join('\n'),
    })

    return {
      score: clampScore(review.score),
      accuracyScore: clampScore(review.accuracyScore),
      fluencyScore: clampScore(review.fluencyScore),
      summary: review.summary || 'AI reviewed the reading passage.',
      majorMisreadings: Array.isArray(review.majorMisreadings) ? review.majorMisreadings.slice(0, 8) : [],
      omissionRate: clampScore(review.omissionRate),
    }
  } catch {
    return fallbackReadingScore({ transcript, referenceText })
  }
}

export async function evaluateOpenEndedJapaneseInterview({
  apiKey,
  transcript,
  prompt,
  roleContext = 'Japanese data-entry / back-office role',
}) {
  try {
    const review = await runJsonReviewPrompt({
      apiKey,
      systemPrompt:
        'You review spoken Japanese interview answers for a structured recruitment test. Return JSON only with keys: score, summary, understanding, relevance, clarity, logic, motivationFit, workFit. Score gently but keep clearly weak or off-topic answers lower.',
      userPrompt: [
        `Role context: ${roleContext}`,
        `Question: ${prompt || ''}`,
        `Transcript: ${transcript || ''}`,
        'Evaluate whether the candidate understood the question, stayed relevant, answered clearly, used a logical structure, showed suitable motivation, and showed carefulness/responsibility/work-fit for a Japanese data-entry/back-office role.',
        'Keep the scoring professional and slightly lenient because ASR may miss some words.',
      ].join('\n'),
    })

    return {
      score: clampScore(review.score),
      summary: review.summary || 'AI reviewed the interview response.',
      understanding: clampScore(review.understanding),
      relevance: clampScore(review.relevance),
      clarity: clampScore(review.clarity),
      logic: clampScore(review.logic),
      motivationFit: clampScore(review.motivationFit),
      workFit: clampScore(review.workFit),
    }
  } catch {
    return fallbackInterviewRubricScore({ transcript, prompt })
  }
}

export async function evaluateAssessmentSpeech({
  apiKey,
  buffer,
  mimeType,
  fileName,
  language = 'ja',
  sectionKey,
  prompt,
  referenceText,
  expectedKeywords = [],
}) {
  const transcript = await transcribeAudioWithOpenAI({
    apiKey,
    buffer,
    mimeType,
    fileName,
    language,
  })

  if (sectionKey === 'reading-aloud') {
    const review = await evaluateJapaneseReading({
      apiKey,
      transcript,
      referenceText,
      prompt,
    })
    return {
      transcript,
      ...review,
    }
  }

  if (sectionKey === 'japanese-qa') {
    const review = await evaluateOpenEndedJapaneseInterview({
      apiKey,
      transcript,
      prompt,
    })
    return {
      transcript,
      ...review,
    }
  }

  const review = await evaluateFixedJapaneseResponse({
    apiKey,
    transcript,
    prompt,
    referenceText,
    expectedKeywords,
  })
  return {
    transcript,
    ...review,
  }
}

async function parseCvWithGemini({ apiKey, cvText, fileName }) {
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is missing.')
  }

  const prompt = `
You are a CV parser. Return strict JSON with keys:
fullName, email, phone, summary, japaneseLevel, fullTime, locationFit, skills (array), experience, strengths (array).
Rules:
- Return only valid JSON.
- If a field is missing, return empty string for strings, false for fullTime, and [] for arrays.
Important:
- Extract candidate information only from CV content.
- Do not copy company address, JD requirement list, or recruiter notes into candidate facts.
Context:
- File: ${fileName || 'unknown'}
- CV text:
${cvText || 'N/A'}
`.trim()

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`)
  }

  const payload = await response.json()
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsedJson = safeJsonParse(rawText)
  if (!parsedJson) {
    throw new Error('Gemini returned non-JSON response.')
  }
  return normalizeProviderParse(parsedJson)
}

async function parseCvWithOpenAI({ apiKey, cvText, fileName }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const messages = [
    {
      role: 'system',
      content:
        'Parse CV content and return JSON only with keys: fullName, email, phone, summary, japaneseLevel, fullTime, locationFit, skills, experience, strengths.',
    },
    {
      role: 'user',
      content:
        `File: ${fileName || 'unknown'}\n` +
        'Extract candidate information only from CV content. Do not copy JD/company requirement text.\n' +
        `CV:\n${cvText || 'N/A'}`,
    },
  ]

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`)
  }

  const payload = await response.json()
  const rawText = payload?.choices?.[0]?.message?.content || ''
  const parsedJson = safeJsonParse(rawText)
  if (!parsedJson) {
    throw new Error('OpenAI returned non-JSON response.')
  }
  return normalizeProviderParse(parsedJson)
}

export async function parseCvWithFallback({
  googleApiKey,
  openaiApiKey,
  cvText,
  jdText,
  fileName,
}) {
  try {
    const result = await parseCvWithGemini({
      apiKey: googleApiKey,
      cvText,
      jdText,
      fileName,
    })
    return {
      providerUsed: 'gemini',
      fallbackUsed: false,
      ...result,
    }
  } catch {
    try {
      const result = await parseCvWithOpenAI({
        apiKey: openaiApiKey,
        cvText,
        jdText,
        fileName,
      })
      return {
        providerUsed: 'openai',
        fallbackUsed: true,
        ...result,
      }
    } catch {
      const result = buildRuleBasedParse({ cvText, fileName })
      return {
        providerUsed: 'rule_based',
        fallbackUsed: true,
        ...result,
      }
    }
  }
}
