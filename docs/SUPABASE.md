# Đồng bộ với Supabase

Dữ liệu luôn được lưu trên máy (IndexedDB) trước, nên app vẫn chạy offline. Khi đăng nhập Supabase, mọi thay đổi được đẩy lên và kéo về tự động (khi có mạng, khi mở lại tab, mỗi 5 phút và realtime khi thiết bị khác sửa).

## Cài đặt (miễn phí, ~5 phút)

1. Tạo project tại https://supabase.com/dashboard (gói Free).
2. **SQL Editor** → dán SQL trong app (*Cài đặt → Đồng bộ Supabase → Copy*) hoặc file [`src/sync/schema.ts`](../src/sync/schema.ts) → **Run**.
3. **Project Settings → API** → copy **Project URL** và **anon public key** → dán vào app → **Lưu**.
4. **Authentication → URL Configuration** → Site URL: `https://thuyduong115.github.io/my-work-assistant/`.
   Muốn đăng ký nhanh không cần xác nhận email: **Authentication → Providers → Email** → tắt *Confirm email*.
5. Trong app: nhập email + mật khẩu → **Đăng ký**, rồi **Đăng nhập** trên các thiết bị khác.

### Không phải nhập URL/key trên mỗi thiết bị

Vào repo **Settings → Secrets and variables → Actions → Variables** và tạo:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Lần deploy sau sẽ nhúng sẵn. Anon key là khoá công khai — an toàn vì bảng được bảo vệ bằng Row Level Security (mỗi người chỉ đọc/ghi dữ liệu của mình).

## Cấu trúc

Một bảng `items(user_id, id, kind, data jsonb, updated_at, deleted, server_updated)`. Xung đột giải quyết theo *last-write-wins* dựa trên `updated_at`; xoá là xoá mềm để đồng bộ được.
