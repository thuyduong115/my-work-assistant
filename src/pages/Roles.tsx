import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { put, remove, DEFAULT_ROLE_ID } from '@/db/db'
import { useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import type { Role } from '@/db/types'
import { COLORS, cn, fmtMin, uid } from '@/lib/utils'
import { isOverdue } from '@/lib/stats'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { PageHeader, Progress } from '@/components/ui/misc'
import { TaskItem } from '@/components/TaskItem'
import { IconPicker } from '@/components/IconPicker'
import { AppIcon } from '@/components/AppIcon'


function RoleDialog({ role, onClose }: { role?: Role; onClose: () => void }) {
  const [f, setF] = useState({ name: role?.name ?? '', icon: role?.icon ?? '🎯', color: role?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)], description: role?.description ?? '' })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={role ? 'Sửa vai trò' : 'Vai trò mới'}
      description="Vai trò là các 'chiếc mũ' bạn đội: Sinh viên, Nhân viên, Con, Người tập gym…"
      footer={
        <>
          {role && role.id !== DEFAULT_ROLE_ID && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await remove('roles', role.id)
                onClose()
              }}
            >
              <Trash2 /> Xoá
            </Button>
          )}
          <Button
            onClick={async () => {
              if (!f.name.trim()) return
              await put('roles', { id: role?.id ?? uid(), ...f, name: f.name.trim(), deleted: 0 })
              onClose()
            }}
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Tên vai trò</Label>
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: Sinh viên, Freelancer…" />
        </div>
        <div>
          <Label>Biểu tượng & màu</Label>
          <div className="flex flex-wrap items-center gap-2">
            <IconPicker value={f.icon} color={f.color} onChange={(icon) => setF({ ...f, icon })} />
            {COLORS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, color: c })} className={cn('size-7 rounded-full ring-offset-2 ring-offset-card', f.color === c && 'ring-2')} style={{ background: c, ['--tw-ring-color' as string]: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div>
          <Label>Mô tả / trách nhiệm</Label>
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
        </div>
      </div>
    </Dialog>
  )
}

export default function Roles() {
  const roles = useRoles()
  const projects = useProjects()
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const [edit, setEdit] = useState<{ role?: Role } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const data = useMemo(() => {
    const since = addDays(new Date(), -30).getTime()
    const weekAgo = addDays(new Date(), -7).getTime()
    const taskRole = (taskId?: string) => {
      const t = tasks.find((x) => x.id === taskId)
      return t?.roleId ?? projects.find((p) => p.id === t?.projectId)?.roleId ?? DEFAULT_ROLE_ID
    }
    const focus = new Map<string, number>()
    for (const e of entries) if (e.start > since) {
      const r = taskRole(e.taskId)
      focus.set(r, (focus.get(r) ?? 0) + (e.end - e.start) / 60000)
    }
    return roles.map((r) => {
      const ts = tasks.filter((t) => (t.roleId ?? projects.find((p) => p.id === t.projectId)?.roleId) === r.id)
      const open = ts.filter((t) => t.status !== 'done')
      return {
        role: r,
        projects: projects.filter((p) => p.roleId === r.id && p.status !== 'done'),
        open,
        overdue: open.filter((t) => isOverdue(t)).length,
        doneWeek: ts.filter((t) => t.doneAt && t.doneAt > weekAgo).length,
        focus: focus.get(r.id) ?? 0,
        remaining: open.reduce((s, t) => s + t.estimateMin, 0),
        next: open.filter((t) => t.deadline).sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1)).slice(0, 3),
      }
    })
  }, [roles, projects, tasks, entries])

  const totalFocus = data.reduce((s, d) => s + d.focus, 0)
  const pie = data.filter((d) => d.focus > 0).map((d) => ({ name: d.role.name, value: Math.round(d.focus), color: d.role.color }))
  const sel = data.find((d) => d.role.id === selected)

  return (
    <div>
      <PageHeader
        title="Vai trò của bạn"
        subtitle="Tổng quan các vai trò bạn đang nắm giữ — cân bằng thời gian giữa chúng."
        actions={
          <Button onClick={() => setEdit({})}>
            <Plus /> Vai trò mới
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {data.map((d) => (
            <Card
              key={d.role.id}
              onClick={() => setSelected(d.role.id === selected ? null : d.role.id)}
              className={cn('cursor-pointer p-5 transition hover:shadow-md', selected === d.role.id && 'ring-2 ring-primary')}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: `color-mix(in oklch, ${d.role.color} 16%, transparent)`, color: d.role.color }}>
                  <AppIcon value={d.role.icon} size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{d.role.name}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{d.role.description || '—'}</div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEdit({ role: d.role })
                  }}
                  aria-label="Sửa"
                >
                  <Pencil />
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ['Project', d.projects.length],
                  ['Đang mở', d.open.length],
                  ['Xong/tuần', d.doneWeek],
                  ['Quá hạn', d.overdue],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-muted/60 py-2">
                    <div className={cn('text-lg font-bold tabular', l === 'Quá hạn' && (v as number) > 0 && 'text-destructive')}>{v}</div>
                    <div className="text-[10px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Tập trung 30 ngày: <b className="text-foreground">{fmtMin(d.focus)}</b></span>
                <span>{totalFocus ? Math.round((d.focus / totalFocus) * 100) : 0}%</span>
              </div>
              <Progress value={totalFocus ? d.focus / totalFocus : 0} color={d.role.color} className="mt-1 h-1.5" />
              {d.projects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.projects.slice(0, 5).map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in oklch, ${p.color} 16%, transparent)`, color: p.color }}>
                      <AppIcon value={p.icon} size={12} /> {p.name}
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title="Phân bổ thời gian (30 ngày)" icon={<Users />} />
            <CardBody>
              {pie.length ? (
                <div className="h-52">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="none">
                        {pie.map((p) => (
                          <Cell key={p.name} fill={p.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmtMin(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">Dùng đồng hồ Tập trung để thấy thời gian theo vai trò.</p>
              )}
              <div className="grid gap-1.5">
                {data.map((d) => (
                  <div key={d.role.id} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 rounded-full" style={{ background: d.role.color }} />
                    <span className="flex-1">{d.role.name}</span>
                    <span className="text-muted-foreground">còn {fmtMin(d.remaining)} việc</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          {sel && (
            <Card>
              <CardHeader title={<><AppIcon value={sel.role.icon} size={16} /> {sel.role.name}: việc sắp tới</>} />
              <div className="px-2 pb-2">
                {sel.next.length ? sel.next.map((t) => <TaskItem key={t.id} task={t} compact />) : <p className="px-3 pb-3 text-xs text-muted-foreground">Không có deadline sắp tới.</p>}
                {sel.open.filter((t) => !t.deadline).length > 0 && <p className="px-3 pb-2 text-xs text-muted-foreground">+ {sel.open.filter((t) => !t.deadline).length} việc không có deadline</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
      {edit && <RoleDialog role={edit.role} onClose={() => setEdit(null)} />}
    </div>
  )
}

