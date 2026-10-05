import { useMemo, useState } from 'react'
import { Inbox as InboxIcon, Plus, Sparkles } from 'lucide-react'
import { useTasks, useTimeEntries } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { parseDate, parseDuration } from '@/ai/fallback'
import { inboxTasks, subCounts } from '@/lib/selectors'
import { actualMinutes } from '@/lib/scheduler'
import { useUI } from '@/stores/ui'
import { dayKey, fmtDay } from '@/lib/utils'
import type { Task } from '@/db/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Empty, PageHeader } from '@/components/ui/misc'
import { TaskItem } from '@/components/TaskItem'

function nextBlock(t: Task) {
  const b = t.plan?.find((x) => x.date >= dayKey())
  return b ? `Lịch ${fmtDay(b.date, 'dd/MM')} ${b.start}` : undefined
}

export default function Inbox() {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const openCapture = useUI((s) => s.openCapture)
  const [v, setV] = useState('')
  const list = inboxTasks(tasks)
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const subs = useMemo(() => subCounts(tasks), [tasks])
  const autoPlanned = tasks.filter((t) => t.status !== 'done' && !t.parentId && !t.projectId && !t.deadline && !t.scheduledDate && t.plan?.length)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Inbox"
        subtitle="Nơi ghi nhanh mọi ý tưởng — sau đó phân loại vào project, đặt deadline hoặc để AI xếp lịch."
        actions={
          <Button onClick={() => openCapture()}>
            <Sparkles /> Nhập nhanh AI
          </Button>
        }
      />
      <Card className="p-2">
        <form
          className="flex gap-2 p-1"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!v.trim()) return
            const [deadline, t1] = parseDate(v)
            const [est, t2] = parseDuration(t1)
            await createTask({ title: t2 || v, deadline: deadline ?? undefined, estimateMin: est ?? 30 })
            setV('')
          }}
        >
          <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Ghi nhanh một việc… (Enter)" />
          <Button type="submit" variant="soft" size="icon" aria-label="Thêm">
            <Plus />
          </Button>
        </form>
        {list.length === 0 && autoPlanned.length === 0 ? (
          <Empty icon={<InboxIcon />} title="Inbox trống" hint="Tuyệt! Mọi việc đều đã được sắp xếp." />
        ) : (
          <>
            {list.map((t) => (
              <TaskItem key={t.id} task={t} actualMin={actual.get(t.id)} subCount={subs.get(t.id)} />
            ))}
            {autoPlanned.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">Chưa phân loại · đã được xếp lịch tự động</div>
                {autoPlanned.map((t) => (
                  <TaskItem key={t.id} task={t} actualMin={actual.get(t.id)} subCount={subs.get(t.id)} planLabel={nextBlock(t)} />
                ))}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
