import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Clock, FolderKanban, Plus } from 'lucide-react'
import { useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import type { Project } from '@/db/types'
import { actualMinutes } from '@/lib/scheduler'
import { dayKey, fmtMin } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, PageHeader, Progress, Segmented } from '@/components/ui/misc'
import { ProjectDialog } from '@/components/ProjectDialog'
import { deadlineInfo } from '@/components/TaskItem'

export default function Projects() {
  const projects = useProjects()
  const roles = useRoles()
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const [filter, setFilter] = useState<Project['status']>('active')
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const list = projects.filter((p) => p.status === filter)

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Mỗi project là một bảng Kanban riêng — theo dõi tiến độ và thời gian."
        actions={
          <>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active', label: `Đang chạy (${projects.filter((p) => p.status === 'active').length})` },
                { value: 'paused', label: 'Tạm dừng' },
                { value: 'done', label: 'Xong' },
              ]}
            />
            <Button onClick={() => setCreating(true)}>
              <Plus /> Project mới
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <Card>
          <Empty icon={<FolderKanban />} title="Chưa có project" hint="Tạo project, hoặc dùng Nhập nhanh — AI sẽ tự gom task thành project." action={<Button size="sm" className="mt-2" onClick={() => setCreating(true)}><Plus /> Tạo project</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const ts = tasks.filter((t) => t.projectId === p.id)
            const done = ts.filter((t) => t.status === 'done').length
            const remaining = ts.filter((t) => t.status !== 'done').reduce((s, t) => s + t.estimateMin, 0)
            const spent = ts.reduce((s, t) => s + (actual.get(t.id) ?? 0), 0)
            const overdue = ts.filter((t) => t.status !== 'done' && t.deadline && t.deadline < dayKey()).length
            const role = roles.find((r) => r.id === p.roleId)
            const dl = p.deadline ? deadlineInfo({ deadline: p.deadline, status: p.status === 'done' ? 'done' : 'todo' } as never) : null
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="group">
                <Card className="relative h-full overflow-hidden p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: p.color }} />
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 place-items-center rounded-xl text-2xl" style={{ background: `color-mix(in oklch, ${p.color} 16%, transparent)` }}>
                      {p.icon ?? '📁'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold group-hover:text-primary">{p.name}</div>
                      {role && (
                        <div className="text-xs text-muted-foreground">
                          {role.icon} {role.name}
                        </div>
                      )}
                    </div>
                  </div>
                  {p.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="font-medium">{ts.length ? Math.round((done / ts.length) * 100) : 0}% hoàn thành</span>
                    <span className="text-muted-foreground">
                      {done}/{ts.length} task
                    </span>
                  </div>
                  <Progress value={ts.length ? done / ts.length : 0} color={p.color} className="mt-1.5" />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {dl && (
                      <Badge color={dl.color}>
                        <CalendarClock /> {dl.label}
                      </Badge>
                    )}
                    <Badge>
                      <Clock /> còn {fmtMin(remaining)}
                    </Badge>
                    {spent > 0 && <Badge color="#14b8a6">đã làm {fmtMin(spent)}</Badge>}
                    {overdue > 0 && <Badge color="#ef4444">{overdue} quá hạn</Badge>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
      {creating && (
        <ProjectDialog
          onClose={(id) => {
            setCreating(false)
            if (id) nav(`/projects/${id}`)
          }}
        />
      )}
    </div>
  )
}
