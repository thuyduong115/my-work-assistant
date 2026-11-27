# Kết nối Google Calendar

App chạy hoàn toàn trên trình duyệt, đăng nhập Google qua Google Identity Services — không có server trung gian. Cần một **OAuth Client ID** (miễn phí, tạo 1 lần).

## Lấy Client ID

1. Bật **Google Calendar API**: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com (chọn project, có thể dùng project của Gemini key) → **Enable**.
2. **Google Auth Platform** → https://console.cloud.google.com/auth/branding → *Get started*: tên app, email → Audience **External**.
3. **Audience → Test users** → thêm **mọi** Gmail bạn sẽ đăng nhập (thiếu sẽ bị `Error 403: access_denied`).
4. **Clients → Create client** → *Web application* → **Authorized JavaScript origins**: `https://thuyduong115.github.io` → Create.
5. Copy Client ID → app: **Cài đặt → Google Calendar** → dán → Lưu → **Kết nối Google Calendar**.

Khi đăng nhập có thể thấy "Google chưa xác minh ứng dụng này" → **Tiếp tục** (app của chính bạn, ở chế độ Testing).

Không muốn nhập lại trên mỗi thiết bị: thêm biến `VITE_GOOGLE_CLIENT_ID` ở repo **Settings → Secrets and variables → Actions → Variables**.

## Hoạt động thế nào

- **Lấy về**: sự kiện 7 ngày trước → 60 ngày tới từ các lịch bạn chọn; hiện ở trang Lịch (ô sọc), Hôm nay, Agenda; bộ xếp lịch tự động **không xếp task trùng giờ bận**.
- **Ghi lại (nhật ký)**: chỉ những task **đã xong** (30 ngày gần nhất) được ghi thành sự kiện `<Project>: <Task>`, đúng khoảng thời gian bạn đã làm (phiên bấm giờ → block đã xếp trong ngày hoàn thành → thời gian ước lượng kết thúc lúc tick xong), không có nhắc. Sửa/bỏ hoàn thành task → sự kiện tự cập nhật/xoá. Sự kiện do app tạo được đánh dấu riêng nên không bị lấy ngược về.
- Đồng bộ khi mở app, khi quay lại tab, 15 phút/lần và 15 giây sau khi bạn sửa. Google chỉ cấp quyền ~1 giờ mỗi lần → khi hết hạn, bấm nút **Làm mới Google** trên thanh trên cùng (tài khoản được chọn sẵn).
