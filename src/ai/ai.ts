import { addDays, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { DEFAULT_MODELS, useSettings, type AIProvider } from '@/stores/settings'
import type { Priority, Recurrence, Energy, Task } from '@/db/types'
import { dayKey } from '@/lib/utils'

export const PROVIDERS: Record<Exclude<AIProvider, 'none'>, { name: string; keyUrl: string; base: string; hint: string }> = {
  gemini: {
    name: 'Google Gemini (free)',
    keyUrl: 'https://aistudio.google.com/apikey',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    hint: 'Đăng nhập Google → Google AI Studio → "Create API key" (key dạng AIza…). Key Vertex AI (dạng AQ.…) cũng dùng được. Gói miễn phí đủ dùng cá nhân.',
  },
  groq: {
    name: 'Groq (free, rất nhanh)',
    keyUrl: 'https://console.groq.com/keys',
    base: 'https://api.groq.com/openai/v1',
    hint: 'Tạo tài khoản Groq → API Keys → Create. Miễn phí với giới hạn theo phút.',
  },
  openrouter: {
    name: 'OpenRouter (model :free)',
    keyUrl: 'https://openrouter.ai/keys',
    base: 'https://openrouter.ai/api/v1',
    hint: 'Tạo key trên OpenRouter, chọn model có đuôi ":free".',
  },
}

export function aiConfig() {
  const s = useSettings.getState().ai
  const provider = s.provider
  const key = provider === 'none' ? '' : (s.keys[provider] ?? '').trim()
  const model = (provider !== 'none' && s.model[provider]) || DEFAULT_MODELS[provider]
  return { provider, key, model, ready: provider !== 'none' && !!key }
}

export class AIError extends Error {}

function extractJSON(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1))
    throw new AIError('AI trả về dữ liệu không đọc được, thử lại nhé.')
  }
}

const VERTEX_BASE = 'https://aiplatform.googleapis.com/v1/publishers/google/models'
/** Keys starting with "AQ." are Vertex AI express-mode keys (Google Cloud), not AI Studio keys */
export const isVertexKey = (key: string) => key.startsWith('AQ.')
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite-001']

/** Best default when the configured model is gone: a stable flash, else anything */
export function pickGeminiModel(models: string[], exclude?: string) {
  const ok = models.filter((m) => m !== exclude)
  return (
    ok.find((m) => /flash(?!.*lite)/.test(m) && !/preview|exp|latest/.test(m)) ??
    ok.find((m) => /flash/.test(m) && !/preview|exp/.test(m)) ??
    ok.find((m) => /flash/.test(m)) ??
    ok[0]
  )
}

async function errorMessage(res: Response) {
  try {
    const j = await res.json()
    return (j?.error?.message as string) ?? JSON.stringify(j).slice(0, 200)
  } catch {
    return `HTTP ${res.status}`
  }
}

async function geminiRequest(key: string, model: string, system: string, user: string, json: boolean) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
  })
  const headers = { 'Content-Type': 'application/json' }
  const aiStudio = () => fetch(`${PROVIDERS.gemini.base}/models/${model}:generateContent`, { method: 'POST', headers: { ...headers, 'x-goog-api-key': key }, body })
  const vertex = () => fetch(`${VERTEX_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers, body })
  const order = isVertexKey(key) ? [vertex, aiStudio] : [aiStudio, vertex]
  let res = await order[0]()
  // wrong endpoint for this key type → try the other one
  if ([400, 401, 403, 404].includes(res.status)) {
    const alt = await order[1]().catch(() => null)
    // ok/429 → this endpoint accepts the key; 404 beats 401/403 because it means
    // the key was accepted and only the model is missing (we can auto-fix that)
    if (alt && (alt.ok || alt.status === 429 || (alt.status === 404 && res.status !== 404))) res = alt
  }
  return res
}

async function call(system: string, user: string, json = true): Promise<string> {
  const { provider, key, model, ready } = aiConfig()
  if (!ready) throw new AIError('Chưa cấu hình AI. Vào Cài đặt → AI để dán API key miễn phí.')
  let res: Response
  let usedModel = model
  if (provider === 'gemini') {
    res = await geminiRequest(key, model, system, user, json)
    if (res.status === 404) {
      // model retired/renamed → pick a working one automatically and remember it
      const models = await listModels('gemini', key).catch(() => GEMINI_FALLBACK_MODELS)
      const pick = pickGeminiModel(models, model)
      if (pick) {
        const retry = await geminiRequest(key, pick, system, user, json)
        if (retry.ok) {
          const s = useSettings.getState()
          s.set({ ai: { ...s.ai, model: { ...s.ai.model, gemini: pick } } })
          usedModel = pick
        }
        res = retry
      }
    }
  } else {
    const p = PROVIDERS[provider as 'groq' | 'openrouter']
    res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(provider === 'openrouter' ? { 'X-Title': 'My Work Assistant' } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(json && provider === 'groq' ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  }
  if (!res.ok) {
    const msg = await errorMessage(res)
    if (res.status === 429) throw new AIError('Hết lượt miễn phí tạm thời (429). Đợi 1 phút rồi thử lại. ' + msg)
    if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(msg))
      throw new AIError(
        'Key này thuộc Google Cloud (Vertex AI) nhưng project chưa bật API. Cách dễ nhất: vào aistudio.google.com/apikey → "Create API key" để lấy key miễn phí dạng AIza… rồi dán vào đây. (Hoặc bấm link trong lỗi gốc để bật API.) Lỗi gốc: ' + msg,
      )
    if (res.status === 401 || res.status === 403) throw new AIError(`API key bị từ chối (${res.status}): ${msg}`)
    if (res.status === 404) throw new AIError(`Không tìm thấy model "${usedModel}" (404): ${msg}`)
    throw new AIError(`Lỗi AI (${res.status}): ${msg}`)
  }
  const j = await res.json()
  if (provider === 'gemini') {
    const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? []
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
    if (!text) throw new AIError('AI không trả lời (có thể bị chặn nội dung). Thử diễn đạt khác.')
    return text
  }
  return j?.choices?.[0]?.message?.content ?? ''
}

export async function listModels(provider: Exclude<AIProvider, 'none'>, key: string): Promise<string[]> {
  if (provider === 'gemini') {
    const r = await fetch(`${PROVIDERS.gemini.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }).catch(() => null)
    if (!r?.ok) {
      // Vertex express keys can't list models — offer the known stable ones
      if (isVertexKey(key)) return GEMINI_FALLBACK_MODELS
      throw new AIError('Không tải được model: ' + (r ? await errorMessage(r) : 'lỗi mạng'))
    }
    const j = await r.json()
    return (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => n.startsWith('gemini') && !/tts|image|embedding|live|audio/.test(n))
  }
  const p = PROVIDERS[provider]
  const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new AIError('Không tải được model: ' + (await errorMessage(r)))
  const j = await r.json()
  let ids: string[] = (j.data ?? []).map((m: { id: string }) => m.id)
  if (provider === 'openrouter') ids = ids.filter((i) => i.endsWith(':free'))
  if (provider === 'groq') ids = ids.filter((i) => !/whisper|tts|guard/.test(i))
  return ids.sort()
}

function calendarContext() {
  const now = new Date()
  const lines = []
  for (let i = 0; i < 21; i++) {
    const d = addDays(now, i)
    lines.push(`${dayKey(d)} (${format(d, 'EEEE', { locale: vi })})`)
  }
  return `Hôm nay: ${format(now, "EEEE, dd/MM/yyyy HH:mm", { locale: vi })}.\nLịch 3 tuần tới:\n${lines.join('\n')}`
}

export interface AITask {
  title: string
  notes?: string
  estimateMin: number
  priority: Priority
  deadline?: string | null
  scheduledDate?: string | null
  energy?: Energy
  recurrence?: Recurrence | null
  project?: string | null
}

export interface BreakdownResult {
  project?: string | null
  projectIsNew?: boolean
  role?: string | null
  tasks: AITask[]
  tip?: string
}

const TASK_SCHEMA = `{
  "project": string | null,      // tên project (dùng tên có sẵn nếu khớp; tạo tên mới ngắn gọn nếu đầu vào là 1 mục tiêu lớn nhiều bước; null nếu chỉ là việc lẻ)
  "projectIsNew": boolean,
  "role": string | null,         // một trong các vai trò có sẵn, hoặc null
  "tip": string,                 // 1 câu khích lệ / mẹo ngắn bằng tiếng Việt
  "tasks": [{
    "title": string,             // ngắn, bắt đầu bằng động từ, tiếng Việt
    "notes": string,             // chi tiết/tiêu chí hoàn thành (có thể rỗng)
    "estimateMin": number,       // ước lượng thực tế, bội số của 5, 10–240
    "priority": "low" | "medium" | "high" | "urgent",
    "deadline": "YYYY-MM-DD" | null,
    "scheduledDate": "YYYY-MM-DD" | null,  // ngày nên làm nếu người dùng nói rõ
    "energy": "high" | "low",    // cần tập trung cao hay việc nhẹ
    "recurrence": null | "daily" | "weekdays" | "weekly" | "monthly"
  }]
}`

export async function aiBreakdown(input: string, ctx: { projects: string[]; roles: string[]; factor: number }): Promise<BreakdownResult> {
  const system = `Bạn là trợ lý quản lý công việc cá nhân, giỏi chia mục tiêu thành các task cụ thể, có thể hành động ngay.
Quy tắc:
- Tách đầu vào thành các task nhỏ, mỗi task ≤ 2–4 giờ; nếu là việc lẻ đơn giản thì giữ 1 task.
- Suy ra deadline từ ngôn ngữ tự nhiên ("thứ 6", "cuối tuần", "20/12", "tuần sau") theo lịch cung cấp. Nếu mục tiêu lớn có deadline, rải deadline trung gian hợp lý cho các task theo thứ tự.
- Ước lượng thời gian thực tế. Người dùng thường làm lâu gấp ${ctx.factor.toFixed(2)} lần ước lượng — hãy tính sẵn điều đó.
- Ưu tiên "urgent" chỉ khi deadline ≤ 2 ngày hoặc người dùng nói gấp.
- Chỉ trả về JSON hợp lệ đúng schema, không giải thích.
Schema:
${TASK_SCHEMA}`
  const user = `${calendarContext()}
Project có sẵn: ${ctx.projects.length ? ctx.projects.join('; ') : '(chưa có)'}
Vai trò có sẵn: ${ctx.roles.join('; ')}

Đầu vào của người dùng:
"""${input}"""`
  const r = extractJSON(await call(system, user)) as BreakdownResult
  if (!r || !Array.isArray(r.tasks)) throw new AIError('AI trả về sai định dạng, thử lại nhé.')
  r.tasks = r.tasks
    .filter((t) => t && t.title)
    .map((t) => ({
      ...t,
      estimateMin: Math.max(5, Math.round((Number(t.estimateMin) || 30) / 5) * 5),
      priority: (['low', 'medium', 'high', 'urgent'] as const).includes(t.priority) ? t.priority : 'medium',
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(t.deadline ?? '') ? t.deadline : null,
      scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(t.scheduledDate ?? '') ? t.scheduledDate : null,
    }))
  return r
}

export async function aiSubtasks(task: Task): Promise<{ steps: { title: string; estimateMin: number }[]; firstStep: string }> {
  const system = `Bạn là coach chống trì hoãn. Chia task thành 3–7 bước nhỏ cụ thể (mỗi bước 5–60 phút), bước đầu tiên phải cực dễ, làm được trong 2 phút để "khởi động".
Trả về JSON: {"firstStep": string, "steps": [{"title": string, "estimateMin": number}]}. Tiếng Việt, ngắn gọn, bắt đầu bằng động từ.`
  const user = `Task: ${task.title}\nGhi chú: ${task.notes ?? ''}\nƯớc lượng tổng: ${task.estimateMin} phút\nĐã bị dời: ${task.postponeCount} lần`
  const r = extractJSON(await call(system, user)) as { steps: { title: string; estimateMin: number }[]; firstStep: string }
  if (!Array.isArray(r?.steps)) throw new AIError('AI trả về sai định dạng.')
  return r
}

export async function aiDailyPlan(summary: string): Promise<{ top3: { title: string; why: string }[]; message: string }> {
  const system = `Bạn là trợ lý năng suất. Từ danh sách task, chọn 3 việc quan trọng nhất (MIT) nên làm hôm nay, xét deadline, độ ưu tiên, số lần bị dời và thời gian rảnh.
Trả về JSON: {"top3":[{"title": string (đúng tên task), "why": string (≤ 15 từ)}], "message": string (1–2 câu động viên, thân thiện, tiếng Việt)}`
  const r = extractJSON(await call(system, `${calendarContext()}\n\n${summary}`)) as { top3: { title: string; why: string }[]; message: string }
  return { top3: Array.isArray(r?.top3) ? r.top3.slice(0, 3) : [], message: r?.message ?? '' }
}

export async function aiWeeklyReview(summary: string): Promise<string> {
  const system = `Bạn là coach năng suất cá nhân. Viết nhận xét tuần ngắn gọn bằng tiếng Việt (markdown đơn giản, ≤ 180 từ): 1) Điểm làm tốt, 2) Dấu hiệu trì hoãn, 3) 3 đề xuất cụ thể cho tuần tới. Giọng ấm áp, thẳng thắn.`
  return call(system, summary, false)
}

export async function aiFirstStep(task: Task): Promise<{ step: string; why: string }> {
  const system = `Bạn là coach chống trì hoãn theo "quy tắc 2 phút". Đưa ra ĐÚNG MỘT hành động vật lý, cụ thể, làm xong trong ≤ 2 phút để bắt đầu task (VD: "Mở file báo cáo và gõ tiêu đề chương 4"). Không khuyên chung chung.
Trả về JSON: {"step": string (≤ 20 từ, bắt đầu bằng động từ), "why": string (≤ 15 từ, vì sao bước này giúp vượt trì hoãn)}. Tiếng Việt.`
  const user = `Task: ${task.title}\nGhi chú: ${task.notes ?? ''}\nĐã bị dời: ${task.postponeCount} lần`
  const r = extractJSON(await call(system, user)) as { step?: string; why?: string }
  if (!r?.step) throw new AIError('AI trả về sai định dạng.')
  return { step: r.step, why: r.why ?? '' }
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  tasks?: AITask[]
}

/** Assistant chat grounded in the user's current tasks; may propose tasks to add */
export async function aiChat(history: ChatMsg[], context: string): Promise<ChatMsg> {
  const system = `Bạn là "Trợ lý công việc" thân thiện, nói tiếng Việt, trong app quản lý công việc cá nhân. Bạn giúp: gợi ý nên làm gì, lên kế hoạch ngày/tuần, chia nhỏ việc, chống trì hoãn, gợi ý thói quen, động viên.
Dữ liệu hiện tại của người dùng (chỉ đọc):
${context}

Quy tắc:
- Trả lời ngắn gọn, cụ thể, dựa trên dữ liệu thật ở trên (nhắc đúng tên task). Dùng gạch đầu dòng khi liệt kê. Tối đa ~150 từ.
- Khi phù hợp, đề xuất task mới để người dùng bấm thêm (tối đa 6) trong mảng "tasks"; nếu không cần thì để mảng rỗng.
- Chỉ trả về JSON: {"reply": string, "tasks": [{"title": string, "estimateMin": number, "priority": "low"|"medium"|"high"|"urgent", "deadline": "YYYY-MM-DD"|null, "notes": string}]}`
  const convo = history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.text}`)
    .join('\n')
  const r = extractJSON(await call(system, `${calendarContext()}\n\nHội thoại:\n${convo}\n\nTrợ lý (JSON):`)) as { reply?: string; tasks?: AITask[] }
  const tasks = (Array.isArray(r?.tasks) ? r.tasks : [])
    .filter((t) => t && t.title)
    .slice(0, 6)
    .map((t) => ({
      ...t,
      estimateMin: Math.max(5, Math.round((Number(t.estimateMin) || 30) / 5) * 5),
      priority: (['low', 'medium', 'high', 'urgent'] as const).includes(t.priority) ? t.priority : 'medium',
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(t.deadline ?? '') ? t.deadline : null,
    }))
  return { role: 'assistant', text: r?.reply?.trim() || '…', tasks }
}
