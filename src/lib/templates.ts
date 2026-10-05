import { addDays } from 'date-fns'
import { put } from '@/db/db'
import { createTask } from '@/db/actions'
import type { Priority, Project, Task } from '@/db/types'
import { dayKey, fromDayKey, uid } from './utils'

export interface TemplateTask {
  title: string
  estimateMin: number
  /** days relative to the project deadline (≤ 0) */
  offset: number
  priority?: Priority
  subs?: { title: string; estimateMin: number }[]
}

export interface ProjectTemplate {
  id: string
  name: string
  icon: string
  color: string
  description: string
  /** default project length in days */
  days: number
  tasks: TemplateTask[]
  custom?: boolean
}

const t = (title: string, estimateMin: number, offset: number, priority?: Priority, subs?: TemplateTask['subs']): TemplateTask => ({ title, estimateMin, offset, priority, subs })

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-exam',
    name: 'Ôn thi',
    icon: '📚',
    color: '#8b5cf6',
    description: '2 tuần ôn theo chương, 2 đề thử, ôn phần yếu',
    days: 14,
    tasks: [
      t('Tổng hợp đề cương & tài liệu', 60, -14),
      t('Ôn chương 1–2', 120, -12),
      t('Ôn chương 3–4', 120, -10),
      t('Ôn chương 5–6', 120, -8),
      t('Làm đề thử lần 1 (bấm giờ)', 90, -6, 'high'),
      t('Chữa lỗi sai & ôn lại phần yếu', 90, -5),
      t('Làm đề thử lần 2 (bấm giờ)', 90, -3, 'high'),
      t('Đọc lại tóm tắt & công thức', 60, -1),
      t('Chuẩn bị đồ dùng, ngủ sớm', 15, -1),
    ],
  },
  {
    id: 'tpl-report',
    name: 'Viết báo cáo',
    icon: '📝',
    color: '#3b82f6',
    description: 'Dàn ý → viết từng phần → soát lỗi → nộp',
    days: 10,
    tasks: [
      t('Đọc yêu cầu & lập dàn ý', 45, -10),
      t('Thu thập tài liệu, số liệu', 90, -9),
      t('Viết phần mở đầu', 60, -7),
      t('Viết nội dung chính', 180, -5, 'high', [
        { title: 'Viết mục 1', estimateMin: 60 },
        { title: 'Viết mục 2', estimateMin: 60 },
        { title: 'Viết mục 3', estimateMin: 60 },
      ]),
      t('Viết kết luận & tóm tắt', 45, -3),
      t('Làm bảng biểu, hình minh hoạ', 60, -3),
      t('Soát lỗi, định dạng, tài liệu tham khảo', 60, -1),
      t('Nộp báo cáo', 10, 0, 'urgent'),
    ],
  },
  {
    id: 'tpl-group',
    name: 'Đồ án / dự án nhóm',
    icon: '👥',
    color: '#f97316',
    description: 'Kick-off, 2 giai đoạn, kiểm thử, báo cáo, bảo vệ',
    days: 30,
    tasks: [
      t('Họp kick-off & chia việc', 60, -30),
      t('Xác định phạm vi & yêu cầu', 90, -28),
      t('Lên thiết kế / kế hoạch chi tiết', 120, -25),
      t('Triển khai giai đoạn 1', 240, -20),
      t('Họp check-in giữa kỳ', 45, -16),
      t('Triển khai giai đoạn 2', 240, -10),
      t('Kiểm thử & sửa lỗi', 120, -7, 'high'),
      t('Viết báo cáo / tài liệu', 180, -5),
      t('Làm slide', 90, -3),
      t('Tập thuyết trình', 60, -1, 'high'),
      t('Nộp & bảo vệ', 30, 0, 'urgent'),
    ],
  },
  {
    id: 'tpl-talk',
    name: 'Thuyết trình',
    icon: '🎤',
    color: '#ec4899',
    description: 'Thông điệp, slide, kịch bản, tập 2 lần',
    days: 7,
    tasks: [
      t('Xác định thông điệp chính & người nghe', 30, -7),
      t('Lập dàn ý', 30, -6),
      t('Làm slide', 120, -5),
      t('Viết ghi chú / kịch bản nói', 60, -4),
      t('Tập lần 1 (bấm giờ)', 30, -3),
      t('Chỉnh slide theo góp ý', 45, -2),
      t('Tập lần 2 trước người khác', 30, -1, 'high'),
      t('Kiểm tra máy chiếu, file, thiết bị', 15, 0),
    ],
  },
  {
    id: 'tpl-paper',
    name: 'Viết bài báo khoa học',
    icon: '🔬',
    color: '#14b8a6',
    description: 'Tổng quan → kết quả → viết → góp ý → nộp',
    days: 60,
    tasks: [
      t('Tổng quan tài liệu (literature review)', 240, -55),
      t('Chốt câu hỏi nghiên cứu & đóng góp', 60, -50),
      t('Hoàn thiện thí nghiệm / phân tích', 480, -40),
      t('Làm hình & bảng kết quả', 180, -30),
      t('Viết Phương pháp', 180, -27),
      t('Viết Kết quả', 180, -24),
      t('Viết Giới thiệu', 180, -20),
      t('Viết Thảo luận & Kết luận', 180, -17),
      t('Viết Tóm tắt & đặt tiêu đề', 60, -14),
      t('Gửi đồng tác giả góp ý', 15, -12),
      t('Chỉnh sửa theo góp ý', 240, -7, 'high'),
      t('Định dạng theo mẫu tạp chí/hội nghị, kiểm tra trích dẫn', 120, -3),
      t('Nộp bài', 30, 0, 'urgent'),
    ],
  },
  {
    id: 'tpl-trip',
    name: 'Chuẩn bị chuyến đi',
    icon: '✈️',
    color: '#06b6d4',
    description: 'Ngân sách, vé, chỗ ở, lịch trình, hành lý',
    days: 14,
    tasks: [
      t('Chốt ngày đi & ngân sách', 30, -14),
      t('Đặt vé', 30, -12, 'high'),
      t('Đặt chỗ ở', 30, -11),
      t('Lên lịch trình từng ngày', 60, -7),
      t('Kiểm tra giấy tờ, bảo hiểm', 20, -5),
      t('Lập danh sách đồ mang theo', 20, -3),
      t('Soạn hành lý', 45, -1),
    ],
  },
  {
    id: 'tpl-job',
    name: 'Tìm việc / ứng tuyển',
    icon: '💼',
    color: '#22c55e',
    description: 'CV, hồ sơ, danh sách công ty, luyện phỏng vấn',
    days: 21,
    tasks: [
      t('Cập nhật CV', 90, -21, 'high'),
      t('Cập nhật LinkedIn / portfolio', 60, -19),
      t('Lập danh sách 15 công ty mục tiêu', 60, -17),
      t('Viết cover letter mẫu', 60, -15),
      t('Gửi 5 hồ sơ đầu tiên', 90, -12),
      t('Luyện câu hỏi phỏng vấn thường gặp', 90, -9),
      t('Gửi thêm 5 hồ sơ', 90, -6),
      t('Follow-up các hồ sơ đã gửi', 30, -2),
    ],
  },
]

/** Deadline of a template task, never before today */
export function taskDeadline(projectDeadline: string, offset: number) {
  const d = dayKey(addDays(fromDayKey(projectDeadline), offset))
  const today = dayKey()
  return d < today ? today : d
}

export async function applyTemplate(tpl: ProjectTemplate, opts: { name: string; deadline: string; roleId?: string }) {
  const projectId = uid()
  await put('projects', { id: projectId, name: opts.name, roleId: opts.roleId, color: tpl.color, icon: tpl.icon, status: 'active', createdAt: Date.now(), deadline: opts.deadline, description: tpl.description, deleted: 0 })
  const base = Date.now()
  for (const [i, x] of tpl.tasks.entries()) {
    const deadline = taskDeadline(opts.deadline, x.offset)
    const parent = await createTask({ title: x.title, estimateMin: x.estimateMin, priority: x.priority ?? 'medium', deadline, projectId, roleId: opts.roleId, order: base + i })
    for (const [j, s] of (x.subs ?? []).entries())
      await createTask({ title: s.title, estimateMin: s.estimateMin, parentId: parent.id, projectId, roleId: opts.roleId, priority: x.priority ?? 'medium', deadline, order: base + i + j / 100 })
  }
  return projectId
}

/** Turn an existing project into a reusable template (dates become offsets from its deadline) */
export function templateFromProject(p: Project, all: Task[]): ProjectTemplate {
  const tasks = all.filter((t) => t.projectId === p.id && !t.parentId && !t.deleted).sort((a, b) => (a.deadline ?? '9') < (b.deadline ?? '9') ? -1 : a.order - b.order)
  const end = p.deadline ?? tasks.map((t) => t.deadline).filter(Boolean).sort().pop() ?? dayKey(addDays(new Date(), 14))
  const endMs = fromDayKey(end).getTime()
  const offset = (d?: string) => (d ? Math.min(0, Math.round((fromDayKey(d).getTime() - endMs) / 86_400_000)) : 0)
  const start = Math.min(0, ...tasks.map((t) => offset(t.deadline)))
  return {
    id: `tpl-${uid()}`,
    name: p.name,
    icon: p.icon || '📁',
    color: p.color,
    description: `${tasks.length} task — tạo từ project "${p.name}"`,
    days: Math.max(1, -start),
    custom: true,
    tasks: tasks.map((x) => ({
      title: x.title,
      estimateMin: x.estimateMin,
      offset: offset(x.deadline),
      priority: x.priority,
      subs: all.filter((c) => c.parentId === x.id && !c.deleted).map((c) => ({ title: c.title, estimateMin: c.estimateMin })),
    })),
  }
}
