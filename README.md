# My Work Assistant 🌸

Trợ lý công việc cá nhân kiểu **Notion + Trello + AI** — chạy hoàn toàn trên GitHub Pages, cài được như app (PWA), dùng offline.

**Link:** https://thuyduong115.github.io/my-work-assistant/

## Tính năng

| | |
|---|---|
| ✨ **Nhập nhanh — AI tách task** | Gõ tự nhiên ("Chuẩn bị bảo vệ đồ án trước 20/12…"), AI (Gemini/Groq/OpenRouter — **miễn phí**) chia thành task có deadline, ước lượng thời gian, ưu tiên, project. Có bộ tách offline khi không có AI. |
| 🗓️ **Tự động xếp lịch** | Xếp task vào giờ rảnh trước deadline, chia block ≤ 90 phút, cảnh báo khi không kịp, tự học bạn hay làm lâu hơn ước lượng bao nhiêu. |
| 🏠 **Hôm nay** | Việc hôm nay theo giờ, quá hạn, kế hoạch bị lỡ, deadline 7 ngày, AI chọn 3 việc quan trọng nhất, habit, timer. |
| 📅 **Lịch** | Ngày / tuần / tháng / agenda · kéo thả, kéo giãn block · nhấp đúp để tạo task · hiển thị thời gian làm thực tế. |
| 📁 **Projects** | Kanban kéo thả, danh sách, timeline, ghi chú — tiến độ & thời gian từng project. |
| 🎭 **Vai trò** | Tổng quan các vai trò bạn nắm giữ + phân bổ thời gian. |
| 📊 **Dashboard chống trì hoãn** | Chỉ số trì hoãn, task bị dời nhiều lần (AI chia nhỏ + "bước khởi động 2 phút"), biểu đồ hoàn thành, giờ tập trung, ước lượng vs thực tế, giờ vàng, heatmap năm, AI nhận xét tuần. |
| 🔥 **Streak & XP** | Chuỗi ngày làm việc, cấp độ, confetti khi xong task. |
| 🔁 **Thói quen** | Habit tracker theo ngày trong tuần, số lần/ngày, chuỗi, heatmap. |
| ⏱️ **Tập trung** | Pomodoro / bấm giờ gắn với task, âm thanh nền (mưa, sóng nâu), thông báo. |
| 🪟 **Cửa sổ mini luôn nổi** | Picture-in-Picture (Chrome/Edge) — timer + task hiện tại nằm trên mọi cửa sổ. |
| ☁️ **Đồng bộ Supabase** | Offline-first, tự đồng bộ + realtime giữa laptop và điện thoại. |
| 🎨 **Giao diện** | Sáng / tối / theo hệ thống, 6 màu nhấn, responsive, Ctrl+K, phím tắt. |

## Bắt đầu dùng

1. Mở link → Chrome/Edge bấm **⊕ Cài đặt** trên thanh địa chỉ (điện thoại: *Thêm vào màn hình chính*).
2. **Cài đặt → AI**: lấy key Gemini miễn phí tại https://aistudio.google.com/apikey và dán vào.
3. **Cài đặt → Giờ làm việc**: khai báo giờ rảnh mỗi ngày.
4. (Tuỳ chọn) **Cài đặt → Đồng bộ Supabase** — xem [docs/SUPABASE.md](docs/SUPABASE.md).

## Phát triển

```bash
npm install
npm run dev      # http://localhost:5173/my-work-assistant/
npm run build
```

Stack: React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui-style components (Radix) · dnd-kit · Recharts · Dexie (IndexedDB) · Zustand · Supabase · vite-plugin-pwa · cmdk.

## Deploy

Push lên `main` → GitHub Actions build & deploy. Lần đầu: **Settings → Pages → Source: GitHub Actions**.

Kế hoạch chi tiết: [docs/PLAN.md](docs/PLAN.md)
