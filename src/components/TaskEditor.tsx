import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Sparkles, Trash2, Play, X, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db/db'
import { useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import { createTask, deleteTask, updateTask } from '@/db/actions'
import { PRIORITY_LABEL, RECURRENCE_LABEL, STATUS_LABEL, type Priority, type Recurrence, type Task, type TaskStatus } from '@/db/types'
import { aiSubtasks, aiConfig } from '@/ai/ai'
import { completeTask } from '@/lib/celebrate'
import { actualMinutes } from '@/lib/scheduler'
import { fmtMin, fmtDay } from '@/lib/utils'
import { useTimer } from '@/stores/timer'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select, Textarea } from './ui/input'
import { CheckCircle } from './ui/misc'
import { iconText } from './AppIcon'

type Form = Pick<
  Task,
  'title' | 'notes' | 'projectId' | 'roleId' | 'status' | 'priority' | 'estimateMin' | 'deadline' | 'deadlineTime' | 'scheduledDate' | 'scheduledTime' | 'energy' | 'recurrence' | 'parentId'
>

const EST_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240]

export function TaskEditor() {
  const { editingTaskId, newTask, closeTask } = useUI()
  const open = !!editingTaskId || !!newTask
  const tasks = useTasks() ?? []
  const projects = useProjects()
  const roles = useRoles()
  const entries = useTimeEntries()
  const timer = useTimer()
  const task = tasks.find((t) => t.id === editingTaskId)
  const [form, setForm] = useState<Form | null>(null)
  const [subTitle, setSubTitle] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [firstStep, setFirstStep] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setForm(null)
      setFirstStep(null)
      return
    }
    const src: Partial<Task> = task ?? newTask ?? {}
    setForm({
      title: src.title ?? '',
      notes: src.notes ?? '',
      projectId: src.projectId,
      roleId: src.roleId ?? (src.projectId ? undefined : roles[0]?.id),
      status: src.status ?? 'todo',
      priority: src.priority ?? 'medium',
      estimateMin: src.estimateMin ?? 30,
      deadline: src.deadline,
      deadlineTime: src.deadlineTime,
      scheduledDate: src.scheduledDate,
      scheduledTime: src.scheduledTime,
      energy: src.energy,
      recurrence: src.recurrence,
      parentId: src.parentId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTaskId])

  const subs = useMemo(() => (task ? tasks.filter((t) => t.parentId === task.id) : []), [tasks, task])
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const parent = form?.parentId ? tasks.find((t) => t.id === form.parentId) : undefined

  if (!form) return null
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })

  const save = async () => {
    if (!form.title.trim()) return toast.error('Nhập tên task nhé')
    const clean = {
      ...form,
      title: form.title.trim(),
      deadline: form.deadline || undefined,
      scheduledDate: form.scheduledDate || undefined,
      scheduledTime: form.scheduledDate && form.scheduledTime ? form.scheduledTime : undefined,
      deadlineTime: form.deadlineTime || undefined,
      projectId: form.projectId || undefined,
      roleId: form.roleId || undefined,
    }
    if (clean.projectId && !clean.roleId) clean.roleId = projects.find((p) => p.id === clean.projectId)?.roleId
    if (task) {
      const wasDone = task.status === 'done'
      if (clean.status === 'done' && !wasDone) {
        await updateTask(task.id, { ...clean, status: 'todo' })
        await completeTask({ ...task, ...clean, status: 'todo' })
      } else {
        // changing the date/estimate un-pins auto plan
        const replan = clean.estimateMin !== task.estimateMin || clean.deadline !== task.deadline || clean.scheduledDate !== task.scheduledDate || clean.scheduledTime !== task.scheduledTime
        await updateTask(task.id, { ...clean, ...(replan ? { pinned: false } : {}), doneAt: clean.status === 'done' ? task.doneAt : undefined })
      }
    } else {
      await createTask({ ...(newTask ?? {}), ...clean })
      toast.success('Đã thêm task')
    }
    closeTask()
  }

  const addSub = async (title: string, estimateMin = 15) => {
    if (!task || !title.trim()) return
    await createTask({ title: title.trim(), parentId: task.id, projectId: task.projectId, roleId: task.roleId, deadline: task.deadline, priority: task.priority, estimateMin, order: Date.now() })
  }

  const aiSplit = async () => {
    if (!task) return
    if (!aiConfig().ready) return toast.error('Chưa có API key AI', { description: 'Vào Cài đặt → AI để thêm key miễn phí.' })
    setAiBusy(true)
    try {
      const r = await aiSubtasks({ ...task, ...form })
      for (const [i, s] of r.steps.entries()) await createTask({ title: s.title, estimateMin: Math.max(5, Math.round((s.estimateMin || 15) / 5) * 5), parentId: task.id, projectId: task.projectId, roleId: task.roleId, deadline: task.deadline, priority: task.priority, order: Date.now() + i })
      setFirstStep(r.firstStep)
      toast.success(`Đã chia thành ${r.steps.length} bước`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAiBusy(false)
    }
  }

  const logged = task ? actual.get(task.id) ?? 0 : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && closeTask()}
      title={task ? 'Chi tiết task' : 'Task mới'}
      description={parent ? `Bước con của: ${parent.title}` : undefined}
      className="max-w-2xl"
      footer={
        <>
          {task && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await deleteTask(task.id)
                closeTask()
                toast('Đã xoá task')
              }}
            >
              <Trash2 /> Xoá
            </Button>
          )}
          <Button variant="outline" onClick={closeTask}>
            Huỷ
          </Button>
          <Button onClick={save}>{task ? 'Lưu' : 'Thêm task'}</Button>
        </>
      }
    >
      <div
        className="grid gap-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
        }}
      >
        <Input autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tên task (bắt đầu bằng động từ: Viết, Gọi, Ôn...)" className="h-11 text-base font-medium" />
        <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ghi chú, link, tiêu chí hoàn thành…" rows={2} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Project</Label>
            <Select value={form.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined, roleId: projects.find((p) => p.id === e.target.value)?.roleId ?? form.roleId })}>
              <option value="">— Không —</option>
              {projects.filter((p) => p.status !== 'done' || p.id === form.projectId).map((p) => (
                <option key={p.id} value={p.id}>
                  {iconText(p.icon)}{p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Vai trò</Label>
            <Select value={form.roleId ?? ''} onChange={(e) => set({ roleId: e.target.value || undefined })}>
              <option value="">— Không —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {iconText(r.icon)}{r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Trạng thái</Label>
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Ưu tiên</Label>
            <Select value={form.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Deadline</Label>
            <Input type="date" value={form.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} />
          </div>
          <div>
            <Label>Giờ deadline</Label>
            <Input type="time" value={form.deadlineTime ?? ''} onChange={(e) => set({ deadlineTime: e.target.value })} />
          </div>
          <div>
            <Label>Ngày dự định làm</Label>
            <Input type="date" value={form.scheduledDate ?? ''} onChange={(e) => set({ scheduledDate: e.target.value })} />
          </div>
          <div>
            <Label>Giờ bắt đầu (tuỳ chọn)</Label>
            <Input
              type="time"
              value={form.scheduledTime ?? ''}
              onChange={(e) => set({ scheduledTime: e.target.value, scheduledDate: form.scheduledDate || (e.target.value ? new Date().toLocaleDateString('sv-SE') : form.scheduledDate) })}
              title="Để trống: AI tự xếp vào giờ rảnh. Có giờ: task được đặt cố định vào giờ này."
            />
          </div>
          <div>
            <Label>Năng lượng cần</Label>
            <Select value={form.energy ?? ''} onChange={(e) => set({ energy: (e.target.value || undefined) as Task['energy'] })}>
              <option value="">—</option>
              <option value="high">⚡ Cần tập trung cao</option>
              <option value="low">🍃 Việc nhẹ</option>
            </Select>
          </div>
          <div>
            <Label>Lặp lại</Label>
            <Select value={form.recurrence ?? ''} onChange={(e) => set({ recurrence: (e.target.value || undefined) as Recurrence })}>
              <option value="">Không lặp</option>
              {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Thời gian ước lượng: {fmtMin(form.estimateMin)}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {EST_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ estimateMin: m })}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition ${form.estimateMin === m ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted'}`}
              >
                {fmtMin(m)}
              </button>
            ))}
            <Input type="number" min={5} step={5} value={form.estimateMin} onChange={(e) => set({ estimateMin: Math.max(5, +e.target.value || 5) })} className="h-7 w-20 text-xs" />
            <span className="text-xs text-muted-foreground">phút</span>
          </div>
        </div>

        {task && (
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                Bước con {subs.length > 0 && <span className="text-muted-foreground">({subs.filter((s) => s.status === 'done').length}/{subs.length})</span>}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => timer.start({ taskId: task.id })}>
                  <Play /> Tập trung
                </Button>
                <Button size="sm" variant="soft" onClick={aiSplit} disabled={aiBusy}>
                  {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} AI chia nhỏ
                </Button>
              </div>
            </div>
            {firstStep && (
              <div className="mb-2 flex items-start gap-2 rounded-lg bg-primary-soft p-2.5 text-sm text-primary">
                <Lightbulb className="mt-0.5 size-4 shrink-0" />
                <div>
                  <b>Bắt đầu 2 phút:</b> {firstStep}
                </div>
                <button className="ml-auto" onClick={() => setFirstStep(null)} aria-label="Đóng">
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="grid gap-1">
              {subs.map((s) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-card">
                  <CheckCircle size={18} checked={s.status === 'done'} onChange={() => void completeTask(s)} />
                  <input
                    defaultValue={s.title}
                    onBlur={(e) => e.target.value !== s.title && updateTask(s.id, { title: e.target.value })}
                    className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${s.status === 'done' ? 'text-muted-foreground line-through' : ''}`}
                  />
                  <span className="text-xs text-muted-foreground">{fmtMin(s.estimateMin)}</span>
                  <button className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => deleteTask(s.id)} aria-label="Xoá bước">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <form
              className="mt-1.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addSub(subTitle)
                setSubTitle('')
              }}
            >
              <Input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Thêm bước con…" className="h-8 text-sm" />
              <Button size="sm" variant="outline" type="submit">
                <Plus />
              </Button>
            </form>
          </div>
        )}

        {task && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Đã làm: <b className="text-foreground">{fmtMin(logged)}</b> / ước lượng {fmtMin(task.estimateMin)}</span>
            {task.postponeCount > 0 && <span>Đã dời: {task.postponeCount} lần</span>}
            {task.plan?.length ? <span>Lịch: {task.plan.slice(0, 3).map((b) => `${fmtDay(b.date, 'EEE dd/MM')} ${b.start}`).join(', ')}{task.plan.length > 3 ? '…' : ''}</span> : null}
            <span>Tạo: {new Date(task.createdAt).toLocaleDateString('vi-VN')}</span>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export async function quickAdd(title: string, defaults: Partial<Task> = {}) {
  const t = await createTask({ title, ...defaults })
  return db.tasks.get(t.id)
}
