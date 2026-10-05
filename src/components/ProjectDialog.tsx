import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db, put, putMany, remove } from '@/db/db'
import { useRoles } from '@/db/hooks'
import type { Project } from '@/db/types'
import { COLORS, cn, uid } from '@/lib/utils'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select, Textarea } from './ui/input'
import { IconPicker } from './IconPicker'
import { iconText } from './AppIcon'


export function ProjectDialog({ project, onClose, defaultRoleId }: { project?: Project; onClose: (id?: string) => void; defaultRoleId?: string }) {
  const roles = useRoles()
  const [f, setF] = useState({
    name: project?.name ?? '',
    icon: project?.icon ?? '📁',
    color: project?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    roleId: project?.roleId ?? defaultRoleId ?? roles[0]?.id,
    status: project?.status ?? 'active',
    deadline: project?.deadline ?? '',
    description: project?.description ?? '',
  })
  const save = async () => {
    if (!f.name.trim()) return
    const id = project?.id ?? uid()
    await put('projects', { id, ...f, name: f.name.trim(), deadline: f.deadline || undefined, createdAt: project?.createdAt ?? Date.now(), deleted: 0 })
    onClose(id)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={project ? 'Sửa project' : 'Project mới'}
      footer={
        <>
          {project && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                if (!confirm('Xoá project này? (Task bên trong được giữ lại trong Inbox)')) return
                const ts = await db.tasks.where('projectId').equals(project.id).toArray()
                await putMany('tasks', ts.map((t) => ({ id: t.id, projectId: undefined })))
                await remove('projects', project.id)
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
      <div className="grid gap-4">
        <div className="flex gap-2">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Tên project" className="h-10 font-medium" />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Vai trò</Label>
            <Select value={f.roleId ?? ''} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {iconText(r.icon)}{r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Trạng thái</Label>
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Project['status'] })}>
              <option value="active">Đang chạy</option>
              <option value="paused">Tạm dừng</option>
              <option value="done">Hoàn thành</option>
            </Select>
          </div>
          <div>
            <Label>Deadline</Label>
            <Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Mô tả / mục tiêu</Label>
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} />
        </div>
      </div>
    </Dialog>
  )
}
