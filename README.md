# recruitment-platform

Nền tảng web hỗ trợ tuyển dụng đầu cuối cho các vị trí tiếng Nhật/data-entry, gồm:

- Public site cho ứng viên xem job và vào bài test.
- Candidate assessment flow nhiều bước (device check, consent, Q&A, reading, typing, data task, submit).
- Recruiter workspace để quản lý JD, upload CV, recompute matching, gửi link test và review kết quả.

## Tính năng chính

### 1) Public + Job Portal

- Danh sách job và trang chi tiết job.
- Trang quy trình tuyển dụng, FAQ, liên hệ.
- Trang nhập mã assessment trước khi ứng viên làm bài.

### 2) Candidate Assessment

- Flow từng bước với trạng thái session được lưu ở backend.
- Các phần đánh giá:
	- Japanese Q&A
	- Reading aloud
	- Typing
	- Data task
- Ghi nhận media/proctoring chunk phục vụ review.

### 3) Recruiter Workspace

- Dashboard theo job.
- Tạo/sửa/xóa job, cập nhật trạng thái tuyển dụng.
- Upload JD, upload CV theo job.
- AI parsing CV + matching score (có fallback rule-based).
- Gửi link test cho ứng viên theo application.
- Review điểm AI vs HR override, lưu audit trail.

## Công nghệ sử dụng

- Frontend: React 19, React Router, Vite
- Backend: Express 5, Multer, CORS
- Runtime data: JSON files trong server/data
- File storage: server/storage
- AI integration (optional): Gemini/OpenAI, có fallback local parser

## Cấu trúc thư mục

```text
app/
	src/                  # Frontend React
		pages/              # Public, Candidate, Recruiter pages
		api.js              # API client
	server/
		index.js            # Express API
		aiProvider.js       # AI parsing/scoring + fallback
		data/               # JSON data store
		storage/            # Uploaded CV/media/proctoring
	package.json
	vite.config.js
```

## Yêu cầu môi trường

- Node.js 18+ (khuyến nghị Node.js 20+)
- npm 9+

## Cài đặt và chạy local

```bash
npm install
```

Chạy cả frontend và backend cùng lúc:

```bash
npm run dev:full
```

Sau khi chạy:

- Frontend: http://localhost:5173
- API server: http://localhost:3001
- Health check: http://localhost:3001/api/health

## Scripts

- npm run dev: chạy Vite frontend
- npm run server: chạy Express backend
- npm run dev:full: chạy đồng thời frontend + backend
- npm run build: build production
- npm run preview: preview bản build
- npm run lint: lint source

## Biến môi trường (.env)

Backend tự đọc file .env ở thư mục app/. Các biến hỗ trợ:

```env
PORT=3001
GOOGLE_API_KEY=
OPENAI_API_KEY=
```

Ghi chú:

- PORT mặc định là 3001 nếu không cấu hình.
- GOOGLE_API_KEY và OPENAI_API_KEY là optional.
- Nếu không có key hoặc provider lỗi, hệ thống dùng fallback parser/scorer local.

## Các route chính trên frontend

- / : Trang chủ public
- /jobs : Danh sách job
- /jobs/:jobId : Chi tiết job
- /assessment-entry : Nhập mã bài test
- /candidate/* : Candidate assessment flow
- /recruiter/login : Recruiter login demo
- /recruiter/dashboard : Dashboard
- /recruiter/jobs : Quản lý jobs
- /recruiter/jobs/:jobId : Job detail + pipeline

Lưu ý: app dùng HashRouter, nên URL thực tế trên trình duyệt có dạng #/jobs, #/candidate, ...

## API chính

- /api/health
- /api/bootstrap
- /api/jobs
- /api/recruiter/jobs
- /api/assessment/entry
- /api/assessment/sessions/*

Chi tiết phía client xem trong src/api.js.

## Dữ liệu và storage

- server/data/*.json: dữ liệu runtime (jobs, candidates, applications, sessions, reviews, submissions).
- server/storage/: CV upload, media assessment, proctoring chunks.

Khi chạy lần đầu, backend sẽ tự tạo các file JSON còn thiếu trong server/data.

## Luồng vận hành nhanh

1. Recruiter tạo job hoặc cập nhật JD.
2. Recruiter upload CV theo job.
3. Hệ thống parse CV + matching, recruiter recompute khi cần.
4. Recruiter gửi link test cho candidate.
5. Candidate làm assessment và submit.
6. Recruiter review kết quả, override điểm nếu cần, chốt pipeline.

## Ghi chú demo

- Màn hình recruiter login hiện là demo UI phía frontend.
- Dữ liệu được lưu file-based để phục vụ phát triển nội bộ/local.

## Troubleshooting nhanh

- Frontend báo Backend unavailable:
	- Kiểm tra đã chạy npm run dev:full.
	- Kiểm tra cổng 3001 có đang bị chiếm.
- Upload CV không tạo được ứng viên:
	- Kiểm tra định dạng/nội dung file CV.
	- Xem lại trạng thái job (closed/filled/archived sẽ chặn import).
- Không có AI key:
	- Hệ thống vẫn chạy với fallback parser/scoring local.
