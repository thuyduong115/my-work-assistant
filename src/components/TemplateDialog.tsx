import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays } from 'date-fns'
import { LayoutTemplate, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRoles } from '@/db/hooks'
import { DEFAULT_ROLE_ID } from '@/db/db'
import { BUILTIN_TEMPLATES, applyTemplate, taskDeadline, type ProjectTemplate } from '@/lib/templates'
import { dayKey, fmtDay, fmtMin } from '@/lib/utils'
import { useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select } from './ui/input'
import { AppIcon, iconText } from './AppIcon'

export function TemplateDialog() {
  const { templatesOpen, setTemplates } = useUI()
  const custom = useSettings((s) => s.templates)
  const roles = useRoles()
  const nav = useNavigate()
  const [tpl, setTpl] = useState<ProjectTemplate | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [roleId, setRoleId] = useState(DEFAULT_ROLE_ID)
  const [busy, setBusy] = useState(false)
  const all = useMemo(() => [...custom, ...BUILTIN_TEMPLATES], [custom])

  const pick = (t: ProjectTemplate) => {
    setTpl(t)
    setName(t.name)
    setDeadline(dayKey(addDays(new Date(), t.days)))
  }
  const close = () => {
    setTemplates(false)
    setTpl(null)
  }
  const create = async () => {
    if (!tpl || !name.trim() || !deadline) return
    setBusy(true)
    try {
      const id = await applyTemplate(tpl, { name: name.trim(), deadline, roleId })
      toast.success(`Đã tạo project "${name.trim()}"`, { description: `${tpl.tasks.length} task — lịch tự động sẽ xếp giờ làm.` })
      close()
      nav(`/projects/${id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={templatesOpen}
      onOpenChange={(o) => !o && close()}
      title={
        <span className="flex items-center gap-2">
          <LayoutTemplate className="size-4 text-primary" /> {tpl ? `Mẫu: ${tpl.name}` : 'Tạo project từ mẫu'}
        </span>
      }
      description={tpl ? 'Chọn deadline — hạn của từng task được tính lùi từ ngày này.' : 'Bộ task dựng sẵn. Lưu project của bạn làm mẫu ở trang chi tiết project.'}
      className="max-w-2xl"
      footer={
        tpl && (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setTpl(null)}>
              ← Chọn mẫu khác
            </Button>
            <Button onClick={create} disabled={busy || !name.trim() || !deadline}>
              Tạo project ({tpl.tasks.length} task)
            </Button>
          </>
        )
      }
    >
      {!tpl ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {all.map((t) => (
            <div key={t.id} className="group relative">
              <button onClick={() => pick(t)} className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:border-primary hover:bg-primary-soft/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `color-mix(in oklch, ${t.color} 18%, transparent)`, color: t.color }}>
                  <AppIcon value={t.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {t.name} {t.custom && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground">của bạn</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {t.tasks.length} task · ~{fmtMin(t.tasks.reduce((s, x) => s + x.estimateMin, 0))} · {t.days} ngày
                  </span>
                </span>
              </button>
              {t.custom && (
                <button
                  aria-label="Xoá mẫu"
                  onClick={() => useSettings.getState().set({ templates: custom.filter((c) => c.id !== t.id) })}
                  className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <Label>Tên project</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Deadline</Label>
              <Input type="date" value={deadline} min={dayKey()} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div>
              <Label>Vai trò</Label>
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {iconText(r.icon)}
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-1 rounded-xl border p-2">
            {tpl.tasks.map((x, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-muted/40">
                <span className="min-w-0 flex-1 truncate">
                  {x.title}
                  {x.subs?.length ? <span className="ml-1 text-xs text-muted-foreground">(+{x.subs.length} bước)</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtMin(x.estimateMin)}</span>
                <span className="w-24 shrink-0 text-right text-xs capitalize">{deadline ? fmtDay(taskDeadline(deadline, x.offset), 'EEE dd/MM') : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}
