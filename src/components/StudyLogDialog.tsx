import { useEffect, useState } from 'react'
import { BookOpenCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useCourses } from '@/db/hooks'
import { addStudy, KIND_INFO } from '@/lib/learning'
import { dayKey, fmtDay } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select, Textarea } from './ui/input'

const QUICK_MIN = [15, 25, 30, 45, 60, 90]

/** Log a study session for a course on a day (opened from Learning, Bullet Journal, palette) */
export function StudyLogDialog() {
  const { studyLog, openStudyLog } = useUI()
  const courses = useCourses().filter((c) => c.status !== 'done' || c.id === studyLog?.courseId)
  const nav = useNavigate()
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState(dayKey())
  const [minutes, setMinutes] = useState(30)
  const [units, setUnits] = useState(0)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!studyLog) return
    setDate(studyLog.date)
    setCourseId(studyLog.courseId ?? courses.find((c) => c.status === 'learning')?.id ?? courses[0]?.id ?? '')
    setMinutes(30)
    setUnits(0)
    setNote('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyLog])

  const course = courses.find((c) => c.id === courseId)
  const unit = course?.unitLabel || KIND_INFO[course?.kind ?? 'course'].unit
  const close = () => openStudyLog(undefined)
  const save = async () => {
    if (!course || minutes <= 0) return
    await addStudy(date, { courseId, minutes, units: units || undefined, note: note.trim() || undefined })
    toast.success(`Đã ghi ${minutes} phút — ${course.name}`, { description: units ? `+${units} ${unit}` : undefined })
    close()
  }

  return (
    <Dialog
      open={!!studyLog}
      onOpenChange={(o) => !o && close()}
      title={
        <span className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-primary" /> Ghi buổi học
        </span>
      }
      description={studyLog ? `Ngày ${fmtDay(date, 'EEEE dd/MM')} — hiện trong Bullet Journal của ngày đó.` : undefined}
      footer={
        courses.length ? (
          <Button onClick={save} disabled={!course || minutes <= 0}>
            Lưu buổi học
          </Button>
        ) : undefined
      }
    >
      {courses.length === 0 ? (
        <div className="grid gap-3 text-sm">
          <p className="text-muted-foreground">Chưa có khoá học / chứng chỉ nào. Thêm trước ở trang Học tập.</p>
          <Button
            onClick={() => {
              close()
              nav('/learning')
            }}
          >
            Mở trang Học tập
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <Label>Khoá học / chứng chỉ</Label>
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Ngày</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Thời gian học (phút)</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_MIN.map((m) => (
                <button key={m} type="button" onClick={() => setMinutes(m)} className={`rounded-lg border px-2.5 py-1 text-sm ${minutes === m ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                  {m}'
                </button>
              ))}
              <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Math.max(0, +e.target.value || 0))} className="h-8 w-20" />
            </div>
          </div>
          <div>
            <Label>
              Hoàn thành thêm ({unit}){course?.totalUnits ? ` — đang ${course.doneUnits ?? 0}/${course.totalUnits}` : ''}
            </Label>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="icon-sm" variant="outline" onClick={() => setUnits(Math.max(0, units - 1))}>
                −
              </Button>
              <span className="w-8 text-center tabular">{units}</span>
              <Button type="button" size="icon-sm" variant="outline" onClick={() => setUnits(units + 1)}>
                +
              </Button>
            </div>
          </div>
          <div>
            <Label>Ghi chú (học được gì, chỗ còn vướng…)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: xong module 3 — attention; chưa hiểu positional encoding" />
          </div>
        </div>
      )}
    </Dialog>
  )
}
