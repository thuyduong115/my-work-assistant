import { useMemo, useState } from 'react'
import { ExternalLink, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCourses, useJournals } from '@/db/hooks'
import { put, remove } from '@/db/db'
import type { Course, CourseKind, CourseStatus } from '@/db/types'
import { courseProgress, courseStats, KIND_INFO, newCourse, removeStudy, STATUS_INFO } from '@/lib/learning'
import { COLORS, cn, dayKey, fmtDay, fmtMin, fromDayKey } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Empty, PageHeader, Progress, Segmented, Stat } from '@/components/ui/misc'
import { addDays, differenceInCalendarDays } from 'date-fns'

function CourseDialog({ course, onClose }: { course: Partial<Course> | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Course>>(() => ({ kind: 'course', status: 'planned', color: COLORS[Math.floor(Math.random() * COLORS.length)], ...course }))
  const set = (p: Partial<Course>) => setF((x) => ({ ...x, ...p }))
  const isNew = !course?.id
  const save = async () => {
    if (!f.name?.trim()) return toast.error('Nhập tên khoá học / chứng chỉ')
    const clean = { ...f, name: f.name.trim(), icon: f.icon || KIND_INFO[f.kind ?? 'course'].icon }
    if (isNew) await put('courses', newCourse(clean))
    else await put('courses', { ...clean, id: course!.id! })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Thêm khoá học / chứng chỉ' : 'Sửa'}
      className="max-w-xl"
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                if (!confirm(`Xoá "${course!.name}"? Nhật ký các buổi học vẫn giữ trong Bullet Journal.`)) return
                await remove('courses', course!.id!)
                onClose()
              }}
            >
              <Trash2 /> Xoá
            </Button>
          )}
          <Button onClick={save}>Lưu</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_INFO) as CourseKind[]).map((k) => (
            <button key={k} type="button" onClick={() => set({ kind: k, icon: f.icon && f.icon !== KIND_INFO[f.kind ?? 'course'].icon ? f.icon : KIND_INFO[k].icon })} className={cn('rounded-lg border px-2.5 py-1 text-sm', f.kind === k ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted')}>
              {KIND_INFO[k].icon} {KIND_INFO[k].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[56px_1fr] gap-3">
          <div>
            <Label>Icon</Label>
            <Input value={f.icon ?? ''} onChange={(e) => set({ icon: e.target.value.slice(0, 4) })} placeholder={KIND_INFO[f.kind ?? 'course'].icon} className="text-center" />
          </div>
          <div>
            <Label>Tên</Label>
            <Input autoFocus value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder={f.kind === 'cert' ? 'VD: AWS Cloud Practitioner, IELTS 7.0' : 'VD: Deep Learning Specialization'} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nền tảng / tổ chức</Label>
            <Input value={f.provider ?? ''} onChange={(e) => set({ provider: e.target.value })} placeholder="Coursera, Udemy, AWS, IDP…" />
          </div>
          <div>
            <Label>Trạng thái</Label>
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as CourseStatus })}>
              {(Object.keys(STATUS_INFO) as CourseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_INFO[s].label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Tổng số</Label>
            <Input type="number" min={0} value={f.totalUnits ?? ''} onChange={(e) => set({ totalUnits: +e.target.value || undefined })} placeholder="VD: 24" />
          </div>
          <div>
            <Label>Đã xong</Label>
            <Input type="number" min={0} value={f.doneUnits ?? ''} onChange={(e) => set({ doneUnits: +e.target.value || 0 })} placeholder="0" />
          </div>
          <div>
            <Label>Đơn vị</Label>
            <Input value={f.unitLabel ?? ''} onChange={(e) => set({ unitLabel: e.target.value })} placeholder={KIND_INFO[f.kind ?? 'course'].unit} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Hoàn thành trước</Label>
            <Input type="date" value={f.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value || undefined })} />
          </div>
          {f.kind === 'cert' && (
            <div>
              <Label>Ngày thi</Label>
              <Input type="date" value={f.examDate ?? ''} onChange={(e) => set({ examDate: e.target.value || undefined })} />
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Link khoá học</Label>
            <Input value={f.url ?? ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <Label>Link chứng chỉ (khi đạt)</Label>
            <Input value={f.certUrl ?? ''} onChange={(e) => set({ certUrl: e.target.value })} placeholder="https://…" />
          </div>
        </div>
        <div>
          <Label>Ghi chú / mục tiêu</Label>
          <Textarea rows={2} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Vì sao học, dùng vào việc gì…" />
        </div>
      </div>
    </Dialog>
  )
}

function dueLabel(c: Course) {
  const d = c.examDate ?? c.targetDate
  if (!d || c.status === 'done') return null
  const n = differenceInCalendarDays(fromDayKey(d), new Date())
  return { text: `${c.examDate ? 'Thi' : 'Hạn'} ${fmtDay(d, 'dd/MM')} · ${n < 0 ? `trễ ${-n} ngày` : n === 0 ? 'hôm nay' : `còn ${n} ngày`}`, late: n < 0, soon: n >= 0 && n <= 7 }
}

export default function Learning() {
  const courses = useCourses()
  const journals = useJournals()
  const openStudyLog = useUI((s) => s.openStudyLog)
  const [filter, setFilter] = useState<'active' | CourseStatus>('active')
  const [editing, setEditing] = useState<Partial<Course> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const today = dayKey()
  const stats = useMemo(() => courseStats(journals, today), [journals, today])

  const list = courses
    .filter((c) => (filter === 'active' ? c.status === 'learning' || c.status === 'planned' : c.status === filter))
    .sort((a, b) => STATUS_INFO[a.status].order - STATUS_INFO[b.status].order || (a.targetDate ?? '9') .localeCompare(b.targetDate ?? '9'))
  const weekMin = [...stats.values()].reduce((s, x) => s + x.week, 0)
  const studyDays = new Set(journals.filter((j) => j.studies?.length).map((j) => j.date))
  // consecutive days with any study session, ending today (or yesterday if not yet today)
  let streak = 0
  let d = fromDayKey(today)
  if (!studyDays.has(today)) d = addDays(d, -1)
  while (studyDays.has(dayKey(d))) {
    streak++
    d = addDays(d, -1)
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Học tập"
        subtitle="Khoá học, chứng chỉ, sách muốn học — ghi lại mỗi buổi học như một cuốn nhật ký."
        actions={
          <>
            <Button variant="outline" onClick={() => openStudyLog({ date: today })}>
              <Plus /> Ghi buổi học
            </Button>
            <Button onClick={() => setEditing({})}>
              <GraduationCap /> Thêm khoá học
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Đang học" value={courses.filter((c) => c.status === 'learning').length} sub={`${courses.filter((c) => c.status === 'planned').length} dự định`} />
        <Stat label="7 ngày qua" value={fmtMin(weekMin)} sub="thời gian học" />
        <Stat label="Chuỗi ngày học" value={`${streak} ngày`} />
        <Stat label="Đã hoàn thành" value={courses.filter((c) => c.status === 'done').length} sub={`${courses.filter((c) => c.status === 'done' && c.kind === 'cert').length} chứng chỉ`} />
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Đang học & dự định' },
          { value: 'paused', label: 'Tạm dừng' },
          { value: 'done', label: 'Hoàn thành' },
        ]}
      />

      {list.length === 0 ? (
        <Card>
          <Empty
            icon={<GraduationCap />}
            title={filter === 'active' ? 'Chưa có khoá học nào' : 'Trống'}
            hint="Thêm khoá học, chứng chỉ hay cuốn sách bạn muốn học, rồi ghi lại mỗi buổi học."
            action={
              filter === 'active' ? (
                <Button size="sm" className="mt-2" onClick={() => setEditing({})}>
                  <Plus /> Thêm khoá học
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const st = stats.get(c.id)
            const p = courseProgress(c)
            const due = dueLabel(c)
            const open = openId === c.id
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg text-xl" style={{ background: `color-mix(in oklch, ${c.color} 14%, transparent)` }}>
                    {c.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold">{c.name}</h3>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="Mở khoá học">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {KIND_INFO[c.kind].label}
                      {c.provider && ` · ${c.provider}`} · {STATUS_INFO[c.status].label}
                    </div>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Sửa">
                    <Pencil />
                  </Button>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.totalUnits ? `${c.doneUnits ?? 0}/${c.totalUnits} ${c.unitLabel || KIND_INFO[c.kind].unit}` : 'Chưa đặt tổng số bài'}</span>
                    <b className="tabular">{Math.round(p * 100)}%</b>
                  </div>
                  <Progress value={p} color={c.color} className="h-1.5" />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>⏱ {fmtMin(st?.minutes ?? 0)} tổng</span>
                  <span>tuần này {fmtMin(st?.week ?? 0)}</span>
                  {st?.streak ? <span>🔥 {st.streak} ngày</span> : null}
                  {st?.lastDate && <span>học gần nhất {fmtDay(st.lastDate, 'dd/MM')}</span>}
                </div>
                {due && <div className={cn('mt-1 text-xs font-medium', due.late ? 'text-destructive' : due.soon ? 'text-warning' : 'text-muted-foreground')}>{due.text}</div>}
                {c.status === 'done' && c.certUrl && (
                  <a href={c.certUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs font-medium text-primary hover:underline">
                    📜 Xem chứng chỉ
                  </a>
                )}

                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  {c.status !== 'done' && (
                    <Button size="sm" variant="soft" onClick={() => openStudyLog({ date: today, courseId: c.id })}>
                      <Plus /> Ghi buổi học
                    </Button>
                  )}
                  <button type="button" onClick={() => setOpenId(open ? null : c.id)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                    {open ? 'Ẩn nhật ký' : `Nhật ký (${st?.sessions ?? 0})`}
                  </button>
                </div>
                {open && (
                  <ul className="mt-2 grid max-h-64 gap-1.5 overflow-y-auto text-sm">
                    {(st?.history ?? []).length === 0 && <li className="text-xs text-muted-foreground">Chưa có buổi học nào.</li>}
                    {(st?.history ?? []).map(({ date, log }) => (
                      <li key={log.id} className="group flex gap-2">
                        <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">{fmtDay(date, 'dd/MM')}</span>
                        <span className="min-w-0 flex-1">
                          <b className="font-medium tabular">{fmtMin(log.minutes)}</b>
                          {log.units ? ` · +${log.units} ${c.unitLabel || KIND_INFO[c.kind].unit}` : ''}
                          {log.note && <span className="block text-xs text-muted-foreground">{log.note}</span>}
                        </span>
                        <button type="button" onClick={() => confirm('Xoá buổi học này?') && void removeStudy(date, log.id)} className="opacity-0 group-hover:opacity-100" aria-label="Xoá buổi học">
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {editing && <CourseDialog course={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
