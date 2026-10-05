# Kế hoạch: Personal Task Assistant (Notion + Trello + AI)

> Tên tạm: **Daisy Planner** — web app quản lý công việc cá nhân, AI tự phân tách task, chạy hoàn toàn trên GitHub Pages, cài được như app (PWA), không cần chạy lại chương trình mỗi lần dùng.

---

## 1. Mục tiêu

| Nhu cầu | Giải pháp |
|---|---|
| Nhập việc chung chung → AI tách task | Ô "Quick Capture" + LLM trả về JSON các subtask (tiêu đề, ước lượng giờ, deadline, độ ưu tiên, project, vai trò) |
| Deadline + thời gian dự kiến | Thuật toán **auto-schedule** xếp task vào lịch dựa trên ước lượng, deadline, giờ làm việc rảnh |
| Task mỗi ngày ở trang chủ | Trang **Today**: task hôm nay, task quá hạn, timer, habit hôm nay, streak |
| Quản lý project | Mỗi project có view **Kanban / List / Timeline** |
| Tổng quan vai trò | Trang **Roles** (Sinh viên, Researcher, Developer, Cá nhân…) — % thời gian, số task, tiến độ theo từng vai trò |
| Lịch tuần/tháng | **Calendar** view ngày / tuần / tháng / agenda, kéo-thả task vào khung giờ |
| Chống trì hoãn | **Dashboard**: task quá hạn, task bị dời nhiều lần, tỉ lệ hoàn thành, "procrastination score" |
| Động lực | **Streak**, heatmap kiểu GitHub contributions, cấp độ/XP nhẹ nhàng |
| Habit tracker | Habit hằng ngày/tuần, check-in 1 chạm, heatmap từng habit |
| Đếm giờ + thống kê | **Pomodoro / stopwatch** gắn với task, thống kê giờ theo ngày/project/vai trò, so sánh ước lượng vs thực tế |
| Cửa sổ nhỏ, nổi trên màn hình | **Document Picture-in-Picture API** (Chrome/Edge) → mini widget always-on-top có timer + task hiện tại |
| Sáng / tối | Theme light / dark / theo hệ thống, màu accent tươi sáng |
| Publish bằng GitHub | GitHub Actions build → GitHub Pages, cài PWA, chạy offline |

---

## 2. Tech stack (đều là repo nổi tiếng trên GitHub)

| Phần | Lựa chọn | Lý do |
|---|---|---|
| Framework | **React 19 + Vite + TypeScript** | Build tĩnh, nhanh, hợp GitHub Pages |
| UI kit | **shadcn/ui** + **Tailwind CSS v4** | UI hiện đại, dark mode sẵn, copy-paste component |
| Layout tham khảo | **satnaing/shadcn-admin** (sidebar + header + command palette) | Layout dashboard nổi tiếng, sạch, responsive |
| Icon | **lucide-react** | Đồng bộ với shadcn |
| Kanban drag & drop | **dnd-kit** | Kéo-thả mượt, hỗ trợ bàn phím |
| Lịch | **Schedule-X** (hoặc FullCalendar) | Day/week/month, drag-drop, dark mode |
| Biểu đồ | **Recharts** (qua shadcn charts) | Đẹp, theme theo shadcn |
| Heatmap streak | **react-activity-calendar** | Giống GitHub contributions |
| State | **Zustand** | Gọn nhẹ |
| Lưu dữ liệu | **Dexie.js (IndexedDB)** | Local-first, offline, không cần server |
| Đồng bộ (tuỳ chọn, phase 3) | **Supabase** free tier hoặc GitHub Gist | Dùng trên nhiều máy |
| Command palette | **cmdk** | Ctrl+K: thêm task, chuyển trang nhanh |
| Ngày giờ | **date-fns** (locale `vi`) | |
| PWA | **vite-plugin-pwa** | Cài như app, offline, mở 1 click |
| Thông báo | Web Notifications API | Nhắc deadline, hết pomodoro |

---

## 3. AI phân tách task

**Luồng:** Người dùng gõ: *"Chuẩn bị bảo vệ đồ án tốt nghiệp trước 20/12"* → AI trả về:

```json
{
  "project": "Đồ án tốt nghiệp",
  "role": "Sinh viên",
  "tasks": [
    { "title": "Hoàn thiện chương 4 - Thực nghiệm", "estimateMin": 480, "priority": "high", "deadline": "2026-11-20" },
    { "title": "Làm slide bảo vệ", "estimateMin": 240, "priority": "medium", "deadline": "2026-12-10" },
    { "title": "Tập thuyết trình 3 lần", "estimateMin": 180, "priority": "medium", "deadline": "2026-12-18" }
  ]
}
```

Người dùng **xem trước, sửa, bỏ chọn** rồi mới bấm "Tạo task" (không để AI tự ghi thẳng).

**Cách gọi AI từ web tĩnh (GitHub Pages không có backend):**
- **Phương án A (khuyên dùng, MVP):** người dùng dán API key của mình vào Settings, lưu trong IndexedDB trên máy, gọi thẳng Claude API từ trình duyệt (header `anthropic-dangerous-direct-browser-access`). Model gợi ý: `claude-haiku-4-5-20251001` (rẻ, nhanh) cho tách task; `claude-sonnet-5-5` cho lập kế hoạch tuần.
- **Phương án B (an toàn hơn):** 1 **Cloudflare Worker** miễn phí làm proxy giữ API key → web chỉ gọi Worker.
- **Fallback không AI:** parser đơn giản theo dòng / gạch đầu dòng + nhận diện ngày ("thứ 6", "mai", "20/12") để app vẫn dùng được khi không có key.

Prompt dùng **structured output (JSON schema)** + đưa vào ngữ cảnh: danh sách project/vai trò hiện có, ngày hôm nay, giờ làm việc trong tuần, tốc độ làm thực tế (ước lượng vs thực tế trong lịch sử) để AI ước lượng sát hơn.

---

## 4. Auto-schedule (thời gian dự kiến làm)

1. Người dùng khai báo **giờ làm việc** (vd: T2–T6 19:00–22:00, T7 8:00–11:00) và lịch cố định (giờ học).
2. Sắp task theo: deadline gần → ưu tiên cao → ước lượng.
3. Chia task dài thành block ≤ 90 phút, đặt vào khoảng trống trước deadline (chừa buffer 20%).
4. Nếu không đủ chỗ → cảnh báo đỏ "Không kịp deadline, cần thêm X giờ".
5. Hệ số hiệu chỉnh: nếu trung bình bạn làm lâu hơn ước lượng 1.3×, tự nhân lên.
6. Task chưa xong cuối ngày → nút "Dời sang mai" (đếm số lần dời → dữ liệu chống trì hoãn).

---

## 5. Mô hình dữ liệu (IndexedDB)

```
Role      { id, name, color, icon }
Project   { id, name, roleId, color, status, deadline, description }
Task      { id, title, notes, projectId, roleId, status(todo|doing|done),
            priority, estimateMin, actualMin, deadline, scheduledStart,
            scheduledEnd, postponeCount, parentId, tags[], createdAt, doneAt,
            recurrence? }
TimeEntry { id, taskId, start, end, type(pomodoro|stopwatch) }
Habit     { id, name, icon, color, frequency(daily|weekly:n), targetPerDay }
HabitLog  { id, habitId, date, count }
Settings  { theme, workHours, apiKey, pomodoroLen, language }
```

Export/Import JSON 1 click để backup.

---

## 6. Các trang (sitemap)

```
Sidebar (shadcn-admin layout)
├── 🏠 Today        – task hôm nay, quá hạn, quick capture AI, timer, habit hôm nay, streak
├── 📥 Inbox        – task chưa phân loại / chưa lên lịch
├── 📁 Projects     – danh sách → chi tiết: Kanban | List | Timeline
├── 🎭 Roles        – tổng quan vai trò: thẻ mỗi vai trò, % thời gian, task mở, project
├── 📅 Calendar     – ngày / tuần / tháng / agenda, kéo task vào giờ
├── 📊 Dashboard    – chống trì hoãn + thống kê thời gian
├── 🔁 Habits       – habit tracker + heatmap
├── ⏱️ Focus        – Pomodoro toàn màn hình / mini window
└── ⚙️ Settings     – theme, giờ làm việc, API key, backup
```

**Dashboard chống trì hoãn gồm:**
- Thẻ số: Quá hạn · Đến hạn hôm nay · Hoàn thành tuần này · Giờ tập trung hôm nay
- Danh sách "Task bị dời ≥ 3 lần" + nút "Chia nhỏ bằng AI"
- Biểu đồ hoàn thành 30 ngày, giờ theo vai trò (donut), ước lượng vs thực tế
- Procrastination score (0–100) = f(quá hạn, số lần dời, tỉ lệ hoàn thành)
- Heatmap năm kiểu GitHub

**Mini window (always-on-top):** nút ⧉ ở header mở cửa sổ Picture-in-Picture nhỏ (≈320×200) gồm: task hiện tại, đồng hồ đếm, nút ✓ / ⏸ / tiếp. Trình duyệt hỗ trợ: Chrome/Edge 116+. Firefox/Safari: fallback mở popup nhỏ (không luôn ở trên).

---

## 7. Giao diện

- **Light:** nền trắng ấm, accent tươi (tím `#7C3AED`, hồng `#EC4899`, xanh ngọc `#14B8A6`, cam `#F97316`) — mỗi vai trò/project 1 màu.
- **Dark:** nền `#0B0B0F` / zinc-900, accent giữ nguyên độ tươi.
- Bo góc 12px, shadow mềm, animation nhẹ (framer-motion) khi hoàn thành task (confetti nhỏ khi giữ streak).
- Responsive: desktop sidebar; mobile bottom tab bar.
- Phím tắt: `Ctrl+K` command palette, `N` task mới, `T` về Today, `F` focus mode, `Space` start/stop timer.

---

## 8. Gợi ý thêm tính năng cho "assistant cá nhân"

**Lập kế hoạch & phản tư**
1. **Daily planning ritual** — sáng: AI gợi ý "3 việc quan trọng nhất hôm nay" (MIT); tối: review nhanh 1 phút.
2. **Weekly review** — Chủ nhật: tổng kết tuần, AI nhận xét & đề xuất tuần tới.
3. **Eisenhower Matrix** — view 4 ô Khẩn cấp / Quan trọng.
4. **Time-blocking** — kéo task từ Inbox thả vào lịch.
5. **Goals / OKR** — mục tiêu quý → project → task, thanh tiến độ.

**Chống trì hoãn**
6. **"Bắt đầu 2 phút"** — nút cho task bị ngại: AI tạo bước đầu tiên siêu nhỏ.
7. **Energy level** — gắn task "cần năng lượng cao/thấp", xếp lịch theo khung giờ bạn tỉnh táo.
8. **Nhắc nhở thông minh** — thông báo trước deadline 1 ngày / 1 giờ.
9. **Focus mode** — ẩn mọi thứ, chỉ còn 1 task + timer + âm thanh nền (lofi/rain).

**Tiện ích**
10. **Recurring tasks** — lặp hằng ngày/tuần/tháng (nộp báo cáo, họp nhóm).
11. **Notes / Journal** kiểu Notion cho mỗi project (markdown editor — vd. BlockNote / Tiptap).
12. **Templates** — "Ôn thi", "Viết paper", "Làm đồ án"… tạo sẵn bộ task.
13. **Nhập bằng giọng nói** (Web Speech API, tiếng Việt).
14. **Xuất lịch .ics** để đồng bộ sang Google Calendar.
15. **Deadline học thuật** — tab riêng cho deadline môn học / hội nghị (phù hợp vai trò researcher).
16. **Gamification nhẹ** — XP, level, huy hiệu ("7 ngày liên tục", "100 pomodoro").

---

## 9. Lộ trình triển khai

| Phase | Nội dung | Ước lượng |
|---|---|---|
| **0. Setup** | Vite + React + TS + Tailwind + shadcn, layout shadcn-admin, theme sáng/tối, GitHub Actions → Pages, PWA | 1 buổi |
| **1. Core (MVP)** | Dexie DB, CRUD Task/Project/Role, trang Today, Inbox, Projects (Kanban + List), Roles, Settings + backup JSON | 3–4 buổi |
| **2. AI + Lịch** | Quick capture AI (preview & sửa), parser fallback, Calendar tuần/tháng, auto-schedule | 3 buổi |
| **3. Timer + Thống kê** | Pomodoro/stopwatch, TimeEntry, Dashboard chống trì hoãn, biểu đồ, mini window PiP, notifications | 3 buổi |
| **4. Habits + Streak** | Habit tracker, heatmap, streak, XP | 2 buổi |
| **5. Nâng cao** | Daily/weekly review AI, Eisenhower, recurring, templates, .ics, đồng bộ đa máy (Supabase) | tuỳ chọn |

---

## 10. Triển khai trên GitHub Pages

Repo riêng: **thuyduong115/my-work-assistant** — app nằm ngay ở root.

```
my-work-assistant/
├── src/
│   ├── components/   (ui/ của shadcn, layout/, task/, calendar/, charts/)
│   ├── pages/        (Today, Inbox, Projects, Roles, Calendar, Dashboard, Habits, Focus, Settings)
│   ├── db/           (Dexie schema + repository)
│   ├── ai/           (gọi Claude API, prompt, parser fallback)
│   ├── lib/          (scheduler, streak, stats, date utils)
│   └── stores/       (Zustand)
├── public/           (icon PWA, manifest)
├── docs/PLAN.md
├── vite.config.ts    (base: '/my-work-assistant/')
├── package.json
└── .github/workflows/deploy.yml  ← push lên main → build → deploy Pages
```

- URL: `https://thuyduong115.github.io/my-work-assistant/`
- Mở trên Chrome → "Cài đặt ứng dụng" → có icon trên desktop/điện thoại, mở như app, chạy offline. Mỗi lần push code, Actions tự build & deploy — **không cần chạy lại chương trình**.
- Bật Pages: Settings → Pages → Source: **GitHub Actions**.
- Dùng HashRouter (`/#/today`) để reload trang con không bị 404 trên GitHub Pages.

---

## 11. Quyết định đã chốt & tiến độ

- **AI:** API miễn phí — Google Gemini (mặc định), Groq, OpenRouter; key lưu trên trình duyệt. Có bộ tách offline.
- **Đồng bộ:** Supabase (offline-first, realtime) — xem `docs/SUPABASE.md`.
- **Vai trò ban đầu:** Cá nhân.

Đã làm: Phase 0–4 + phần lớn Phase 5 (review tuần AI, Eisenhower, recurring, ghi chú project, PiP mini window, âm thanh nền).
Còn lại: templates, nhập bằng giọng nói, xuất .ics, nhắc deadline bằng thông báo đẩy.

## 12. Câu hỏi ban đầu (lưu lại)

1. **AI:** dùng API key cá nhân lưu trên trình duyệt (A) hay dựng Cloudflare Worker proxy (B)?
2. **Đồng bộ đa thiết bị:** ngay từ đầu (Supabase, cần đăng nhập) hay để phase 5 (chỉ lưu local + backup JSON)?
3. Danh sách **vai trò** ban đầu (vd: Sinh viên VKU, Researcher NLP, Developer, Cá nhân/Sức khoẻ)?
