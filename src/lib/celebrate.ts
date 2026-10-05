import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { toggleDone } from '@/db/actions'
import type { Task } from '@/db/types'

const CHEERS = ['Tuyệt vời! 🎉', 'Xong một việc! 💪', 'Giỏi lắm! ✨', 'Tiến lên! 🚀', 'Thêm XP rồi nè! ⭐', 'Bạn đang làm rất tốt! 🌸']

export async function completeTask(task: Task) {
  const { done, parent } = await toggleDone(task)
  if (parent) {
    void confetti({ particleCount: 140, spread: 100, startVelocity: 40, origin: { y: 0.6 }, colors: ['#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#eab308'], disableForReducedMotion: true })
    toast.success('Hoàn thành cả task! 🏆', { description: `Đủ bước con → "${parent.title}" đã xong` })
    return
  }
  if (done) {
    const rect = document.activeElement?.getBoundingClientRect()
    void confetti({
      particleCount: 60,
      spread: 70,
      startVelocity: 30,
      scalar: 0.8,
      origin: rect ? { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight } : { y: 0.7 },
      colors: ['#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#eab308'],
      disableForReducedMotion: true,
    })
    toast.success(CHEERS[Math.floor(Math.random() * CHEERS.length)], {
      description: task.title + (task.recurrence ? ' · đã tạo lần lặp tiếp theo' : ''),
    })
  }
}
