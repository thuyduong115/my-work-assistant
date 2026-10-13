import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, RotateCcw, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { db, put } from '@/db/db'
import type { TableName } from '@/db/types'
import { fullResync, localCounts, serverCounts, type Counts } from '@/sync/sync'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

const LABEL: Record<TableName, string> = {
  roles: 'Vai trò',
  projects: 'Project',
  tasks: 'Task',
  timeEntries: 'Phiên đếm giờ',
  habits: 'Thói quen',
  habitLogs: 'Nhật ký thói quen',
  journal: 'Nhật ký ngày',
}

/** Compare this device with the server and pull everything again if they differ */
export function SyncHealth() {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ local: Counts; server: Counts } | null>(null)
  const check = async () => {
    setBusy(true)
    try {
      setRes({ local: await localCounts(), server: await serverCounts() })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const resync = async () => {
    setBusy(true)
    try {
      await fullResync()
      toast.success('Đã tải lại toàn bộ từ máy chủ')
      setRes({ local: await localCounts(), server: await serverCounts() })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Kiểm tra đồng bộ</div>
          <div className="text-xs text-muted-foreground">So sánh dữ liệu trên máy này với máy chủ. Nếu lệch: bấm "Tải lại toàn bộ".</div>
        </div>
        <Button size="sm" variant="outline" onClick={check} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Stethoscope />} Kiểm tra
        </Button>
        <Button size="sm" variant="outline" onClick={resync} disabled={busy}>
          <RotateCcw /> Tải lại toàn bộ
        </Button>
      </div>
      {res && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left font-medium">Loại</th>
                <th className="text-right font-medium">Máy này</th>
                <th className="text-right font-medium">Máy chủ</th>
                <th className="text-right font-medium">Đã xoá (máy / chủ)</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(LABEL) as TableName[]).map((k) => {
                const l = res.local[k] ?? { alive: 0, deleted: 0 }
                const s = res.server[k] ?? { alive: 0, deleted: 0 }
                return (
                  <tr key={k} className={cn('border-b border-dashed', l.alive !== s.alive && 'text-destructive')}>
                    <td className="py-1.5">{LABEL[k]}</td>
                    <td className="text-right tabular">{l.alive}</td>
                    <td className="text-right tabular">{s.alive}</td>
                    <td className="text-right tabular text-muted-foreground">
                      {l.deleted} / {s.deleted}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const TRASH: TableName[] = ['roles', 'projects', 'tasks', 'habits']

/** Soft-deleted items can be brought back (the restore syncs to other devices) */
export function Trash() {
  const items = useLiveQuery(async () => {
    const out: { table: TableName; id: string; name: string; at: number }[] = []
    for (const t of TRASH) {
      const rows = (await (db[t] as unknown as { toArray: () => Promise<Record<string, unknown>[]> }).toArray()).filter((r) => r.deleted)
      for (const r of rows) out.push({ table: t, id: r.id as string, name: String(r.name ?? r.title ?? '(không tên)'), at: r.updatedAt as number })
    }
    return out.sort((a, b) => b.at - a.at)
  }, [])
  const [show, setShow] = useState(20)
  if (!items) return null
  return (
    <div className="grid gap-2 rounded-xl border p-4">
      <div className="text-sm font-medium">Thùng rác ({items.length})</div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Trống.</p>
      ) : (
        <>
          <div className="grid max-h-72 gap-1 overflow-y-auto">
            {items.slice(0, show).map((x) => (
              <div key={x.table + x.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm odd:bg-muted/40">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{LABEL[x.table]}</span>
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{new Date(x.at).toLocaleString('vi-VN')}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await put(x.table, { id: x.id, deleted: 0 })
                    toast.success(`Đã khôi phục "${x.name}"`)
                  }}
                >
                  Khôi phục
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {items.length > show && (
              <Button size="sm" variant="ghost" onClick={() => setShow(show + 50)}>
                Xem thêm
              </Button>
            )}
            {items.some((x) => x.table !== 'tasks') && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const pick = items.filter((x) => x.table === 'roles' || x.table === 'projects')
                  for (const x of pick) await put(x.table, { id: x.id, deleted: 0 })
                  toast.success(`Đã khôi phục ${pick.length} vai trò / project`)
                }}
              >
                Khôi phục tất cả vai trò & project
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
