# VideoSite (Next.js + Tailwind)

## Chạy thử
    npm install
    cp .env.example .env.local
    npm run dev

## Định dạng API (/api/videos)
- Danh sách: `GET /api/videos?category=movie&page=1&q=tu-khoa`
  → `{ "items": [Video], "page": 1, "totalPages": 3, "total": 30 }`
- Chi tiết: `GET /api/videos?slug=ten-video` → `Video`
- Video: `{ id, slug, title, category, description, thumbnail, servers: [{ name, type: "hls"|"mp4"|"iframe", url }] }`

Đổi nguồn: sửa `data/videos.json` / route `app/api/videos/route.js`, hoặc đặt `NEXT_PUBLIC_SOURCE_DOMAIN`,
hoặc nhập domain API ở nút "⚙ Nguồn" (lưu localStorage). API ngoài cần bật CORS.
Chỉ dùng nội dung bạn có quyền phát.

## Đẩy lên GitHub
    git init
    git add .
    git commit -m "init video site"
    git branch -M main
    git remote add origin https://github.com/<user>/<repo>.git
    git push -u origin main

## Deploy Vercel
1. vercel.com → Add New → Project → Import repo GitHub vừa tạo.
2. Framework: Next.js (tự nhận). Thêm biến `NEXT_PUBLIC_SOURCE_DOMAIN` nếu cần.
3. Deploy. Mỗi lần `git push`, Vercel tự build lại.
