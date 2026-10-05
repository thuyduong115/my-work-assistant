import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, Wand2, Trash2, Info, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { put, DEFAULT_ROLE_ID } from '@/db/db'
import { PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from '@/db/types'
import { aiBreakdown, aiConfig, type AITask, type BreakdownResult } from '@/ai/ai'
import { fallbackBreakdown } from '@/ai/fallback'
import { actualMinutes, calibrationFactor } from '@/lib/scheduler'
import { COLORS, uid } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select, Textarea } from './ui/input'
import { iconText } from './AppIcon'
import { Segmented } from './ui/misc'

const EXAMPLES = [
  'Chuẩn bị bảo vệ đồ án tốt nghiệp trước 20/12',
  'Tuần này: đi siêu thị, dọn phòng, gọi điện cho mẹ, nộp bài tập Toán thứ 6',
  'Học IELTS đạt 6.5 trong 3 tháng',
  'Lên kế hoạch du lịch Đà Lạt cuối tháng',
]

type Row = AITask & { _id: string; include: boolean }

export function QuickCapture() {
  const { captureOpen, capturePrefill, captureMode, closeCapture } = useUI()
  const [mode, setMode] = useState(captureMode)
  const projects = useProjects()
  const roles = useRoles()
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BreakdownResult | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [projectChoice, setProjectChoice] = useState<string>('') // '' none, 'new', or id
  const [newProjectName, setNewProjectName] = useState('')
  const [roleId, setRoleId] = useState<string>(DEFAULT_ROLE_ID)
  const factor = useMemo(() => calibrationFactor(tasks, actualMinutes(entries)), [tasks, entries])
  const ai = aiConfig()

  useEffect(() => {
    if (captureOpen) {
      setText(capturePrefill ?? '')
      setMode(captureMode)
      setResult(null)
      setRows([])
    }
  }, [captureOpen, capturePrefill, captureMode])

  const applyResult = (r: BreakdownResult) => {
    setResult(r)
    setRows(r.tasks.map((t) => ({ ...t, _id: uid(), include: true })))
    const match = r.project ? projects.find((p) => p.name.toLowerCase() === r.project!.toLowerCase()) : undefined
    if (match) setProjectChoice(match.id)
    else if (r.project) {
      setProjectChoice('new')
      setNewProjectName(r.project)
    } else setProjectChoice('')
    const role = r.role ? roles.find((x) => x.name.toLowerCase() === r.role!.toLowerCase()) : undefined
    setRoleId(match?.roleId ?? role?.id ?? DEFAULT_ROLE_ID)
  }

  const analyze = async (useAI: boolean) => {
    if (!text.trim()) return
    if (!useAI) return applyResult(fallbackBreakdown(text))
    setBusy(true)
    try {
      const input =
        mode === 'email'
          ? `Đây là email / tin nhắn / biên bản họp tôi nhận được. Chỉ trích ra những việc TÔI cần làm (bỏ qua lời chào, chữ ký, thông tin không cần hành động). Giữ nguyên deadline, tên người và chi tiết quan trọng trong "notes". Nếu nhiều việc cùng một chủ đề thì gom vào 1 project.\n\n${text}`
          : text
      applyResult(await aiBreakdown(input, { projects: projects.filter((p) => p.status !== 'done').map((p) => p.name), roles: roles.map((r) => r.name), factor }))
    } catch (e) {
      toast.error((e as Error).message, { description: 'Đã dùng bộ tách offline thay thế.' })
      applyResult(fallbackBreakdown(text))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    const chosen = rows.filter((r) => r.include && r.title.trim())
    if (!chosen.length) return
    let projectId: string | undefined
    if (projectChoice === 'new' && newProjectName.trim()) {
      projectId = uid()
      const deadline = chosen.map((c) => c.deadline).filter(Boolean).sort().pop() ?? undefined
      await put('projects', { id: projectId, name: newProjectName.trim(), roleId, color: COLORS[projects.length % COLORS.length], icon: '📁', status: 'active', createdAt: Date.now(), deadline, deleted: 0 })
    } else if (projectChoice && projectChoice !== 'new') projectId = projectChoice
    const base = Date.now()
    for (const [i, r] of chosen.entries()) {
      await createTask({
        title: r.title.trim(),
        notes: r.notes || undefined,
        estimateMin: r.estimateMin,
        priority: r.priority,
        deadline: r.deadline || undefined,
        scheduledDate: r.scheduledDate || undefined,
        energy: r.energy,
        recurrence: r.recurrence || undefined,
        projectId,
        roleId,
        order: base + i,
      })
    }
    toast.success(`Đã tạo ${chosen.length} task`, { description: 'Bấm "Xếp lịch tự động" ở trang Lịch để AI sắp thời gian.' })
    closeCapture()
  }

  const upd = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)))
  const total = rows.filter((r) => r.include).reduce((s, r) => s + r.estimateMin, 0)

  return (
    <Dialog
      open={captureOpen}
      onOpenChange={(o) => !o && closeCapture()}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Nhập nhanh — AI tách task
        </span>
      }
      description="Viết tự nhiên như đang kể: mục tiêu, việc cần làm, hạn chót… AI sẽ chia thành task có deadline và thời gian ước lượng."
      className="max-w-3xl"
      footer={
        result ? (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setResult(null)}>
              ← Sửa nội dung
            </Button>
            <Button onClick={commit} disabled={!rows.some((r) => r.include)}>
              Tạo {rows.filter((r) => r.include).length} task
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => analyze(false)} disabled={!text.trim()}>
              <Wand2 /> Tách nhanh (offline)
            </Button>
            <Button onClick={() => analyze(true)} disabled={!text.trim() || busy || !ai.ready}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Tách bằng AI
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="grid gap-3">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'plan', label: <><Sparkles /> Mô tả việc</> },
              { value: 'email', label: <><Mail /> Dán email / tin nhắn</> },
            ]}
          />
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void analyze(ai.ready)
            }}
            rows={mode === 'email' ? 10 : 5}
            placeholder={mode === 'email' ? 'Dán nguyên văn email, tin nhắn Zalo/Messenger hoặc biên bản họp vào đây — AI sẽ lọc ra những việc bạn cần làm, kèm hạn chót.' : 'VD: Chuẩn bị bảo vệ đồ án trước 20/12, cần làm slide, viết báo cáo chương 4, tập thuyết trình\n\nMẹo offline: mỗi dòng 1 việc, "2h", "30p", "thứ 6", "mai", "20/12", "!" = quan trọng, #project'}
            className="text-[15px]"
          />
          {!ai.ready && (
            <div className="flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-xs text-primary">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Chưa có API key AI. Vào <b>Cài đặt → AI</b> để thêm key <b>Google Gemini miễn phí</b> (1 phút). Trong lúc đó vẫn dùng được "Tách nhanh (offline)".
              </span>
            </div>
          )}
          {mode === 'plan' && <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary">
                {ex}
              </button>
            ))}
          </div>}
        </div>
      ) : (
        <div className="grid gap-3">
          {result.tip && <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">💡 {result.tip}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Đưa vào project</Label>
              <Select value={projectChoice} onChange={(e) => setProjectChoice(e.target.value)}>
                <option value="">— Không (Inbox) —</option>
                <option value="new">+ Tạo project mới</option>
                {projects.filter((p) => p.status !== 'done').map((p) => (
                  <option key={p.id} value={p.id}>
                    {iconText(p.icon)}{p.name}
                  </option>
                ))}
              </Select>
            </div>
            {projectChoice === 'new' && (
              <div>
                <Label>Tên project mới</Label>
                <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Vai trò</Label>
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {iconText(r.icon)}{r.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {rows.filter((r) => r.include).length} task · tổng {Math.round(total / 6) / 10} giờ — sửa trực tiếp hoặc bỏ chọn trước khi tạo
          </div>
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r._id} className={`grid gap-2 rounded-xl border p-2.5 transition sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:items-center ${r.include ? '' : 'opacity-45'}`}>
                <input type="checkbox" checked={r.include} onChange={(e) => upd(r._id, { include: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                <Input value={r.title} onChange={(e) => upd(r._id, { title: e.target.value })} className="h-8 border-transparent bg-transparent font-medium hover:border-input" />
                <div className="flex items-center gap-1">
                  <Input type="number" min={5} step={5} value={r.estimateMin} onChange={(e) => upd(r._id, { estimateMin: Math.max(5, +e.target.value || 5) })} className="h-8 w-16 text-xs" />
                  <span className="text-xs text-muted-foreground">p</span>
                </div>
                <Input type="date" value={r.deadline ?? ''} onChange={(e) => upd(r._id, { deadline: e.target.value || null })} className="h-8 w-36 text-xs" />
                <Select value={r.priority} onChange={(e) => upd(r._id, { priority: e.target.value as Priority })} className="h-8 w-24 text-xs" style={{ color: PRIORITY_COLOR[r.priority] }}>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Button size="icon-sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x._id !== r._id))} aria-label="Bỏ">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}
