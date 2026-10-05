# Kết nối Google Calendar

App chạy hoàn toàn trên trình duyệt, đăng nhập Google qua Google Identity Services — không có server trung gian. Cần một **OAuth Client ID** (miễn phí, tạo 1 lần).

## Lấy Client ID

1. Bật **Google Calendar API**: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com (chọn project, có thể dùng project của Gemini key) → **Enable**.
2. **Google Auth Platform** → https://console.cloud.google.com/auth/branding → *Get started*: tên app, email → Audience **External**.
3. **Audience → Test users** → thêm Gmail bạn dùng Google Calendar.
4. **Clients → Create client** → *Web application* → **Authorized JavaScript origins**: `https://thuyduong115.github.io` → Create.
5. Copy Client ID → app: **Cài đặt → Google Calendar** → dán → Lưu → **Kết nối Google Calendar**.

Khi đăng nhập có thể thấy "Google chưa xác minh ứng dụng này" → **Tiếp tục** (app của chính bạn, ở chế độ Testing).

Không muốn nhập lại trên mỗi thiết bị: thêm biến `VITE_GOOGLE_CLIENT_ID` ở repo **Settings → Secrets and variables → Actions → Variables**.

## Hoạt động thế nào

- **Lấy về**: sự kiện 7 ngày trước → 60 ngày tới từ các lịch bạn chọn; hiện ở trang Lịch (ô sọc), Hôm nay, Agenda; bộ xếp lịch tự động **không xếp task trùng giờ bận**.
- **Đẩy lên**: các block làm task 30 ngày tới thành sự kiện "✅ Tên task" (nhắc trước 5 phút). Đổi/xong/xoá task → sự kiện tự cập nhật/xoá. Sự kiện do app tạo được đánh dấu riêng nên không bị lấy ngược về.
- Đồng bộ khi mở app, khi quay lại tab, 15 phút/lần và 15 giây sau khi bạn sửa. Phiên Google hết hạn sau ~1 giờ → bấm **Kết nối lại / Đồng bộ** (trình duyệt chặn popup tự mở).
