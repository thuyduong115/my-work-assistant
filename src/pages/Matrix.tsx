import { useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { MoveRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTasks, useTimeEntries } from '@/db/hooks'
import { updateTask } from '@/db/actions'
import type { Priority, Task } from '@/db/types'
import { topTasks, actualMinutes } from '@/lib/scheduler'
import { cn, fromDayKey } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/misc'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { TaskItem } from '@/components/TaskItem'

type Q = NonNullable<Task['matrix']>

const isUrgent = (t: Task) => t.priority === 'urgent' || (!!t.deadline && differenceInCalendarDays(fromDayKey(t.deadline), new Date()) <= 2)
const isImportant = (t: Task) => t.priority === 'high' || t.priority === 'urgent'
/** A hand-picked quadrant wins; otherwise guess from priority + deadline */
const quad = (t: Task): Q => t.matrix ?? (isUrgent(t) ? (isImportant(t) ? 'do' : 'delegate') : isImportant(t) ? 'plan' : 'drop')

const QUADS: { id: Q; title: string; hint: string; color: string; priority: Priority }[] = [
  { id: 'do', title: '🔥 Làm ngay', hint: 'Khẩn cấp & quan trọng', color: '#ef4444', priority: 'urgent' },
  { id: 'plan', title: '📅 Lên lịch', hint: 'Quan trọng, chưa gấp — nơi tạo ra giá trị lớn nhất', color: '#8b5cf6', priority: 'high' },
  { id: 'delegate', title: '⚡ Làm nhanh / nhờ người', hint: 'Gấp nhưng không quan trọng', color: '#f97316', priority: 'medium' },
  { id: 'drop', title: '🧹 Để sau / bỏ', hint: 'Không gấp, không quan trọng', color: '#94a3b8', priority: 'low' },
]

function moveTo(t: Task, q: Q) {
  if (quad(t) === q) return
  const target = QUADS.find((x) => x.id === q)!
  void updateTask(t.id, { matrix: q, priority: target.priority })
  toast(`Đã chuyển sang "${target.title.replace(/^\S+\s/, "")}"`, { description: t.title })
}

export default function Matrix() {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const [over, setOver] = useState<Q | null>(null)
  const open = topTasks(tasks).filter((t) => t.status !== 'done')

  return (
    <div>
      <PageHeader title="Ma trận Eisenhower" subtitle="Kéo task sang ô khác (hoặc bấm ➜ trên task) để đổi ô. Tự xếp: Gấp = deadline ≤ 2 ngày hoặc ưu tiên Gấp." />
      <div className="grid gap-4 md:grid-cols-2">
        {QUADS.map((q) => {
          const list = open.filter((t) => quad(t) === q.id)
          return (
            <Card
              key={q.id}
              className={cn('min-h-64 border-t-4 transition', over === q.id && 'ring-2 ring-primary/50')}
              style={{ borderTopColor: q.color, ...(over === q.id ? { background: `color-mix(in oklch, ${q.color} 8%, var(--card))` } : {}) }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== q.id) setOver(q.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const id = e.dataTransfer.getData('text/plain')
                const t = open.find((x) => x.id === id)
                if (t) moveTo(t, q.id)
              }}
            >
              <div className="px-5 pt-4 pb-2">
                <div className="font-semibold">
                  {q.title} <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
                </div>
                <div className="text-xs text-muted-foreground">{q.hint}</div>
              </div>
              <div className="max-h-96 min-h-32 overflow-y-auto px-2 pb-2">
                {list.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setOver(null)}
                    className="flex cursor-grab items-center gap-1 active:cursor-grabbing"
                  >
                    <div className="min-w-0 flex-1">
                      <TaskItem task={t} compact actualMin={actual.get(t.id)} />
                    </div>
                    <Dropdown
                      trigger={
                        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Chuyển sang ô khác" title="Chuyển sang ô khác">
                          <MoveRight className="size-4" />
                        </button>
                      }
                    >
                      {QUADS.filter((x) => x.id !== q.id).map((x) => (
                        <DropdownItem key={x.id} onSelect={() => moveTo(t, x.id)}>
                          {x.title}
                        </DropdownItem>
                      ))}
                    </Dropdown>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
