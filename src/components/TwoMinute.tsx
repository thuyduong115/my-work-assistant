import { useEffect, useState } from 'react'
import { Loader2, Play, Plus, RefreshCw, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useTasks } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { aiConfig, aiFirstStep } from '@/ai/ai'
import { useTimer } from '@/stores/timer'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'

const GENERIC = [
  'Mở đúng file/ứng dụng cần dùng và đặt nó lên màn hình.',
  'Viết ra 3 gạch đầu dòng: việc này cần những gì?',
  'Gõ câu đầu tiên — xấu cũng được.',
  'Tìm và mở tài liệu/link liên quan nhất.',
]

/**
 * "2-minute rule": one tiny physical action + a 2-minute timer. Starting is the
 * hardest part of procrastination; after 2 minutes momentum usually carries on.
 */
export function TwoMinuteDialog() {
  const { twoMinTaskId, openTwoMin } = useUI()
  const task = (useTasks() ?? []).find((t) => t.id === twoMinTaskId)
  const start = useTimer((s) => s.start)
  const [step, setStep] = useState<{ step: string; why: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const suggest = async () => {
    if (!task) return
    if (!aiConfig().ready) {
      setStep({ step: GENERIC[Math.floor(Math.random() * GENERIC.length)], why: 'Thêm API key AI (Cài đặt → AI) để có gợi ý riêng cho task này.' })
      return
    }
    setBusy(true)
    try {
      setStep(await aiFirstStep(task))
    } catch (e) {
      setStep({ step: GENERIC[0], why: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setStep(null)
    if (twoMinTaskId) void suggest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoMinTaskId])

  if (!task) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && openTwoMin(undefined)}
      title={
        <span className="flex items-center gap-2">
          <Zap className="size-4 text-amber-500" /> Bắt đầu 2 phút
        </span>
      }
      description={task.title}
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">Không cần làm xong — chỉ cần bắt đầu. Làm đúng 1 việc nhỏ dưới đây trong 2 phút, sau đó tuỳ bạn có làm tiếp hay không.</p>
        <div className="rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-400/10 p-4">
          {busy || !step ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> AI đang nghĩ bước nhỏ nhất…
            </div>
          ) : (
            <>
              <div className="text-base font-semibold">👉 {step.step}</div>
              {step.why && <div className="mt-1 text-xs text-muted-foreground">{step.why}</div>}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            disabled={!step}
            onClick={() => {
              start({ taskId: task.id, minutes: 2 })
              openTwoMin(undefined)
              toast('⚡ Bắt đầu 2 phút!', { description: step?.step })
            }}
          >
            <Play /> Bắt đầu 2 phút
          </Button>
          <Button variant="outline" onClick={suggest} disabled={busy}>
            <RefreshCw /> Gợi ý khác
          </Button>
          <Button
            variant="ghost"
            disabled={!step}
            onClick={async () => {
              await createTask({ title: step!.step, parentId: task.id, projectId: task.projectId, roleId: task.roleId, estimateMin: 5, priority: task.priority, deadline: task.deadline, order: 0 })
              toast.success('Đã thêm làm bước con đầu tiên')
            }}
          >
            <Plus /> Lưu thành bước con
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
