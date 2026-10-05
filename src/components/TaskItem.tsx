import { CalendarClock, Clock, MoreHorizontal, Play, Repeat, SkipForward, Trash2, Pencil, Sparkles, AlertTriangle, ListTree } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { useProjects } from '@/db/hooks'
import { deleteTask, postpone } from '@/db/actions'
import { PRIORITY_COLOR, type Task } from '@/db/types'
import { completeTask } from '@/lib/celebrate'
import { cn, dayKey, fmtMin, fromDayKey } from '@/lib/utils'
import { useTimer } from '@/stores/timer'
import { useUI } from '@/stores/ui'
import { Badge } from './ui/badge'
import { CheckCircle } from './ui/misc'
import { Dropdown, DropdownItem, DropdownSeparator } from './ui/dropdown'
import { Button } from './ui/button'
import { toast } from 'sonner'

export function deadlineInfo(t: Task) {
  if (!t.deadline) return null
  const diff = differenceInCalendarDays(fromDayKey(t.deadline), new Date())
  const label =
    diff < 0 ? `Trễ ${-diff} ngày` : diff === 0 ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : diff < 7 ? `Còn ${diff} ngày` : t.deadline.slice(8, 10) + '/' + t.deadline.slice(5, 7)
  const color = t.status === 'done' ? undefined : diff < 0 ? '#ef4444' : diff <= 1 ? '#f97316' : diff <= 3 ? '#eab308' : undefined
  return { label: label + (t.deadlineTime ? ' ' + t.deadlineTime : ''), color, diff }
}

export function TaskItem({
  task,
  subCount,
  actualMin,
  showProject = true,
  compact,
  planLabel,
}: {
  task: Task
  subCount?: { done: number; total: number }
  actualMin?: number
  showProject?: boolean
  compact?: boolean
  planLabel?: string
}) {
  const projects = useProjects()
  const openTask = useUI((s) => s.openTask)
  const timer = useTimer()
  const project = projects.find((p) => p.id === task.projectId)
  const dl = deadlineInfo(task)
  const done = task.status === 'done'
  const active = timer.running && timer.taskId === task.id

  return (
    <div
      onClick={() => openTask(task.id)}
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-border hover:bg-muted/50',
        active && 'border-primary/40 bg-primary-soft/50',
        compact && 'py-2',
      )}
    >
      <div className="pt-0.5">
        <CheckCircle checked={done} onChange={() => void completeTask(task)} color={PRIORITY_COLOR[task.priority]} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm leading-snug font-medium', done && 'text-muted-foreground line-through')}>{task.title || '(không tên)'}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {planLabel && (
            <Badge color="var(--primary)">
              <CalendarClock />
              {planLabel}
            </Badge>
          )}
          {dl && (
            <Badge color={dl.color}>
              {dl.diff < 0 && !done ? <AlertTriangle /> : <CalendarClock />}
              {dl.label}
            </Badge>
          )}
          <Badge>
            <Clock />
            {actualMin ? `${fmtMin(actualMin)}/` : ''}
            {fmtMin(task.estimateMin)}
          </Badge>
          {showProject && project && (
            <Badge color={project.color}>
              {project.icon ?? '●'} {project.name}
            </Badge>
          )}
          {subCount && subCount.total > 0 && (
            <Badge>
              <ListTree />
              {subCount.done}/{subCount.total}
            </Badge>
          )}
          {task.recurrence && (
            <Badge>
              <Repeat />
            </Badge>
          )}
          {task.postponeCount >= 2 && !done && <Badge color="#ef4444">Dời {task.postponeCount}×</Badge>}
        </div>
      </div>
      {!done && (
        <div className="flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Bắt đầu tập trung"
            onClick={() => {
              timer.start({ taskId: task.id })
              toast('⏱️ Bắt đầu tập trung', { description: task.title })
            }}
          >
            <Play />
          </Button>
          <Dropdown
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label="Thêm">
                <MoreHorizontal />
              </Button>
            }
          >
            <DropdownItem onSelect={() => openTask(task.id)}>
              <Pencil /> Sửa / chia nhỏ
            </DropdownItem>
            <DropdownItem
              onSelect={() => {
                void postpone(task)
                toast('Đã dời sang ngày mai', { description: 'Mẹo: chia nhỏ task nếu bạn cứ dời mãi 😉' })
              }}
            >
              <SkipForward /> Dời sang mai
            </DropdownItem>
            <DropdownItem onSelect={() => openTask(task.id)}>
              <Sparkles /> AI: bước khởi động 2 phút
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              danger
              onSelect={() => {
                void deleteTask(task.id)
                toast('Đã xoá task')
              }}
            >
              <Trash2 /> Xoá
            </DropdownItem>
          </Dropdown>
        </div>
      )}
    </div>
  )
}

export function isToday(k?: string) {
  return k === dayKey()
}
