import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ArrowLeft, CalendarClock, Clock, Columns3, Flag, GanttChart, List, NotebookPen, Pencil, Plus, Sparkles, Timer } from 'lucide-react'
import { useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import { createTask, setStatus, updateTask } from '@/db/actions'
import { put } from '@/db/db'
import { PRIORITY_COLOR, STATUS_LABEL, type Task, type TaskStatus } from '@/db/types'
import { actualMinutes } from '@/lib/scheduler'
import { subCounts } from '@/lib/selectors'
import { cn, dayKey, fmtMin } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Progress, Segmented, Stat } from '@/components/ui/misc'
import { ProjectDialog } from '@/components/ProjectDialog'
import { TaskItem, deadlineInfo } from '@/components/TaskItem'
import { AppIcon } from '@/components/AppIcon'

type View = 'board' | 'list' | 'timeline' | 'notes'
const COLS: { id: TaskStatus; color: string }[] = [
  { id: 'todo', color: '#94a3b8' },
  { id: 'doing', color: '#3b82f6' },
  { id: 'done', color: '#22c55e' },
]

function CardBody({ task, sub, spent }: { task: Task; sub?: { done: number; total: number }; spent?: number }) {
  const dl = deadlineInfo(task)
  return (
    <>
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
        <div className={cn('text-sm leading-snug font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {dl && (
          <Badge color={dl.color}>
            <CalendarClock /> {dl.label}
          </Badge>
        )}
        <Badge>
          <Clock /> {spent ? `${fmtMin(spent)}/` : ''}
          {fmtMin(task.estimateMin)}
        </Badge>
        {sub && sub.total > 0 && <Badge>☑ {sub.done}/{sub.total}</Badge>}
      </div>
      {sub && sub.total > 0 && <Progress value={sub.done / sub.total} className="mt-2 h-1" />}
    </>
  )
}

function KanbanCard({ task, sub, spent }: { task: Task; sub?: { done: number; total: number }; spent?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { column: task.status } })
  const openTask = useUI((s) => s.openTask)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => openTask(task.id)}
      className={cn('cursor-grab touch-none rounded-xl border bg-card p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing', isDragging && 'opacity-30')}
    >
      <CardBody task={task} sub={sub} spent={spent} />
    </div>
  )
}

function Column({ id, color, tasks, subs, actual, projectId }: { id: TaskStatus; color: string; tasks: Task[]; subs: Map<string, { done: number; total: number }>; actual: Map<string, number>; projectId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'col-' + id, data: { column: id } })
  const [adding, setAdding] = useState('')
  return (
    <div className={cn('flex min-h-40 w-full flex-col rounded-2xl bg-muted/50 p-2 transition md:w-auto', isOver && 'bg-primary-soft')}>
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        {STATUS_LABEL[id]}
        <span className="rounded-md bg-card px-1.5 text-xs text-muted-foreground">{tasks.length}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">{fmtMin(tasks.reduce((s, t) => s + t.estimateMin, 0))}</span>
      </div>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-1">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <KanbanCard key={t.id} task={t} sub={subs.get(t.id)} spent={actual.get(t.id)} />
          ))}
        </SortableContext>
        {id !== 'done' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!adding.trim()) return
              await createTask({ title: adding.trim(), projectId, status: id })
              setAdding('')
            }}
          >
            <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Thêm task" className="h-8 border-dashed bg-transparent text-sm" />
          </form>
        )}
      </div>
    </div>
  )
}

function Board({ tasks, projectId }: { tasks: Task[]; projectId: string }) {
  const all = useTasks() ?? []
  const entries = useTimeEntries()
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const subs = useMemo(() => subCounts(all), [all])
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor))
  const byCol = (c: TaskStatus) => tasks.filter((t) => t.status === c).sort((a, b) => a.order - b.order)

  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const task = tasks.find((t) => t.id === active.id)
    if (!task) return
    const col = (over.data.current?.column as TaskStatus) ?? task.status
    const list = byCol(col).filter((t) => t.id !== task.id)
    let order = Date.now()
    if (!String(over.id).startsWith('col-')) {
      const idx = list.findIndex((t) => t.id === over.id)
      if (idx >= 0) {
        const prev = list[idx - 1]?.order ?? list[idx].order - 1000
        // moving down within the same column → place after
        const sameDown = task.status === col && byCol(col).findIndex((t) => t.id === task.id) < byCol(col).findIndex((t) => t.id === over.id)
        order = sameDown ? (list[idx].order + (list[idx + 1]?.order ?? list[idx].order + 1000)) / 2 : (prev + list[idx].order) / 2
      }
    } else order = (list[list.length - 1]?.order ?? 0) + 1000
    if (col !== task.status) {
      await updateTask(task.id, { order })
      await setStatus({ ...task, order }, col)
    } else await updateTask(task.id, { order })
  }

  const active = tasks.find((t) => t.id === activeId)
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((c) => (
          <Column key={c.id} id={c.id} color={c.color} tasks={byCol(c.id)} subs={subs} actual={actual} projectId={projectId} />
        ))}
      </div>
      <DragOverlay>{active && <div className="rotate-2 rounded-xl border bg-card p-3 shadow-2xl"><CardBody task={active} /></div>}</DragOverlay>
    </DndContext>
  )
}

function Timeline({ tasks }: { tasks: Task[] }) {
  const openTask = useUI((s) => s.openTask)
  const days = Array.from({ length: 28 }, (_, i) => addDays(new Date(), i - 3))
  const rows = tasks.filter((t) => t.status !== 'done' && (t.deadline || t.plan?.length)).sort((a, b) => ((a.plan?.[0]?.date ?? a.deadline!) < (b.plan?.[0]?.date ?? b.deadline!) ? -1 : 1))
  return (
    <Card className="overflow-x-auto p-4">
      <div style={{ minWidth: 200 + days.length * 28 }}>
        <div className="flex">
          <div className="w-[200px] shrink-0" />
          {days.map((d) => (
            <div key={dayKey(d)} className={cn('w-7 shrink-0 text-center text-[10px] text-muted-foreground', dayKey(d) === dayKey() && 'font-bold text-primary')}>
              <div className="capitalize">{format(d, 'EEEEE', { locale: vi })}</div>
              {format(d, 'd')}
            </div>
          ))}
        </div>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Chưa có task có lịch hoặc deadline.</p>}
        {rows.map((t) => (
          <div key={t.id} className="flex items-center border-t py-1">
            <button onClick={() => openTask(t.id)} className="w-[200px] shrink-0 truncate pr-2 text-left text-xs font-medium hover:text-primary">
              {t.title}
            </button>
            {days.map((d) => {
              const k = dayKey(d)
              const b = t.plan?.find((x) => x.date === k)
              return (
                <div key={k} className={cn('grid h-6 w-7 shrink-0 place-items-center', k === dayKey() && 'bg-primary-soft/60')}>
                  {b && <div className="h-3.5 w-6 rounded" title={`${b.start} · ${fmtMin(b.min)}`} style={{ background: PRIORITY_COLOR[t.priority], opacity: 0.35 + Math.min(1, b.min / 120) * 0.65 }} />}
                  {t.deadline === k && <Flag className="size-3.5 text-destructive" />}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const project = useProjects().find((p) => p.id === id)
  const roles = useRoles()
  const all = useTasks() ?? []
  const entries = useTimeEntries()
  const { openCapture, createTask: newTask } = useUI()
  const [view, setView] = useState<View>('board')
  const [editing, setEditing] = useState(false)
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const subs = useMemo(() => subCounts(all), [all])

  if (!project) return <div className="py-20 text-center text-muted-foreground">Không tìm thấy project.</div>
  const tasks = all.filter((t) => t.projectId === project.id)
  const top = tasks.filter((t) => !t.parentId)
  const done = tasks.filter((t) => t.status === 'done').length
  const remaining = tasks.filter((t) => t.status !== 'done').reduce((s, t) => s + t.estimateMin, 0)
  const spent = tasks.reduce((s, t) => s + (actual.get(t.id) ?? 0), 0)
  const role = roles.find((r) => r.id === project.roleId)
  const dl = project.deadline ? deadlineInfo({ deadline: project.deadline, status: project.status === 'done' ? 'done' : 'todo' } as never) : null

  return (
    <div>
      <button onClick={() => nav('/projects')} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Projects
      </button>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span className="grid size-14 place-items-center rounded-2xl text-3xl" style={{ background: `color-mix(in oklch, ${project.color} 16%, transparent)`, color: project.color }}>
          <AppIcon value={project.icon ?? '📁'} size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {project.name}
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Sửa project">
              <Pencil />
            </Button>
          </h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {role && <Badge color={role.color}><AppIcon value={role.icon} size={12} /> {role.name}</Badge>}
            {dl && (
              <Badge color={dl.color}>
                <CalendarClock /> {dl.label}
              </Badge>
            )}
            <Badge>{project.status === 'active' ? 'Đang chạy' : project.status === 'paused' ? 'Tạm dừng' : 'Hoàn thành'}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => newTask({ projectId: project.id, roleId: project.roleId })}>
            <Plus /> Task
          </Button>
          <Button onClick={() => openCapture(`Project "${project.name}": `)}>
            <Sparkles /> AI thêm task
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tiến độ" value={`${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`} sub={<Progress value={tasks.length ? done / tasks.length : 0} color={project.color} className="mt-1.5 h-1.5" />} />
        <Stat label="Task" value={`${done}/${tasks.length}`} sub="hoàn thành" />
        <Stat label="Còn lại" value={fmtMin(remaining)} sub="theo ước lượng" icon={<Clock />} />
        <Stat label="Đã làm" value={fmtMin(spent)} sub="thời gian thực tế" icon={<Timer />} color="#14b8a6" />
      </div>

      <Segmented
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { value: 'board', label: <><Columns3 /> Kanban</> },
          { value: 'list', label: <><List /> Danh sách</> },
          { value: 'timeline', label: <><GanttChart /> Timeline</> },
          { value: 'notes', label: <><NotebookPen /> Ghi chú</> },
        ]}
      />

      {view === 'board' && <Board tasks={top} projectId={project.id} />}
      {view === 'list' && (
        <Card className="p-2">
          {(['doing', 'todo', 'done'] as const).map((s) => {
            const list = top.filter((t) => t.status === s)
            if (!list.length) return null
            return (
              <div key={s} className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                  {STATUS_LABEL[s]} ({list.length})
                </div>
                {list.map((t) => (
                  <div key={t.id}>
                    <TaskItem task={t} showProject={false} actualMin={actual.get(t.id)} subCount={subs.get(t.id)} />
                    <div className="ml-8">
                      {tasks
                        .filter((c) => c.parentId === t.id)
                        .map((c) => (
                          <TaskItem key={c.id} task={c} compact showProject={false} actualMin={actual.get(c.id)} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {top.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Chưa có task.</p>}
        </Card>
      )}
      {view === 'timeline' && <Timeline tasks={tasks} />}
      {view === 'notes' && (
        <Card className="p-4">
          <Textarea
            key={project.id}
            defaultValue={project.description}
            onBlur={(e) => e.target.value !== (project.description ?? '') && put('projects', { id: project.id, description: e.target.value })}
            placeholder={'Ghi chú tự do cho project: mục tiêu, ý tưởng, link tài liệu, biên bản họp…\n(Tự lưu khi bạn click ra ngoài)'}
            className="min-h-[50vh] border-transparent bg-transparent text-[15px] focus:ring-0"
          />
        </Card>
      )}
      {editing && <ProjectDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  )
}
