import { useMemo } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { useTasks, useTimeEntries } from '@/db/hooks'
import { updateTask } from '@/db/actions'
import type { Priority, Task } from '@/db/types'
import { topTasks, actualMinutes } from '@/lib/scheduler'
import { fromDayKey } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/misc'
import { TaskItem } from '@/components/TaskItem'
import { cn } from '@/lib/utils'

type Q = 'do' | 'plan' | 'delegate' | 'drop'

const isUrgent = (t: Task) => t.priority === 'urgent' || (!!t.deadline && differenceInCalendarDays(fromDayKey(t.deadline), new Date()) <= 2)
const isImportant = (t: Task) => t.priority === 'high' || t.priority === 'urgent'

const QUADS: { id: Q; title: string; hint: string; color: string; priority: Priority }[] = [
  { id: 'do', title: '🔥 Làm ngay', hint: 'Khẩn cấp & quan trọng', color: '#ef4444', priority: 'urgent' },
  { id: 'plan', title: '📅 Lên lịch', hint: 'Quan trọng, chưa gấp — nơi tạo ra giá trị lớn nhất', color: '#8b5cf6', priority: 'high' },
  { id: 'delegate', title: '⚡ Làm nhanh / nhờ người', hint: 'Gấp nhưng không quan trọng', color: '#f97316', priority: 'medium' },
  { id: 'drop', title: '🧹 Để sau / bỏ', hint: 'Không gấp, không quan trọng', color: '#94a3b8', priority: 'low' },
]

export default function Matrix() {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const open = topTasks(tasks).filter((t) => t.status !== 'done')
  const quad = (t: Task): Q => (isUrgent(t) ? (isImportant(t) ? 'do' : 'delegate') : isImportant(t) ? 'plan' : 'drop')

  return (
    <div>
      <PageHeader title="Ma trận Eisenhower" subtitle="Kéo task sang ô khác để đổi mức ưu tiên. Gấp = deadline ≤ 2 ngày hoặc ưu tiên Gấp." />
      <div className="grid gap-4 md:grid-cols-2">
        {QUADS.map((q) => {
          const list = open.filter((t) => quad(t) === q.id)
          return (
            <Card
              key={q.id}
              className={cn('min-h-64 border-t-4')}
              style={{ borderTopColor: q.color }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/task')
                if (id) void updateTask(id, { priority: q.priority })
              }}
            >
              <div className="px-5 pt-4 pb-2">
                <div className="font-semibold">
                  {q.title} <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
                </div>
                <div className="text-xs text-muted-foreground">{q.hint}</div>
              </div>
              <div className="max-h-96 overflow-y-auto px-2 pb-2">
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)}>
                    <TaskItem task={t} compact actualMin={actual.get(t.id)} />
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
