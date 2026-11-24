# User Access & Session Tracking Guide (WIB)

Dokumen ini menjelaskan arsitektur, struktur database, endpoint API, cara pengujian, serta query SQL untuk memeriksa seluruh metrik akses pengguna (**Guest Mode**, **Sign Up**, **Login**, **Logout**, dan **Guest-to-Registered Transition**).

---

## 1. Struktur Database Supabase

Jalankan file `backend/supabase_user_access_tracking.sql` di **Supabase → SQL Editor → Run**.

File tersebut membuat 3 tabel utama (semuanya memiliki kolom UTC `TIMESTAMPTZ` dan kolom format WIB `*_wib`):

1. **`public.user_visitors`** — Identitas pengunjung anonim (`visitor_id` UUID).
   - Menyimpan `first_seen_at_wib`, `last_seen_at_wib`, `first_access_type` (`Guest` / `Registered`), `linked_user_id`, `converted_from_guest`, `converted_at_wib`, dan `total_sessions`.
2. **`public.user_sessions`** — Riwayat setiap sesi (Guest & Registered).
   - Menyimpan `session_id`, `visitor_id`, `user_id`, `access_type`, `started_as_guest`, `login_at_wib`, `session_started_at_wib`, `session_ended_at_wib`, `last_activity_at_wib`, `duration_seconds`, `session_status` (`Active`, `Ended`, `Expired`), dan `end_reason`.
3. **`public.user_activity_logs`** — Event `signup`, `login`, `logout`, `guest_session_start`, dan `guest_to_registered`.
   - Memiliki *unique partial index* pada `(user_id) WHERE event_type = 'signup'` sehingga 1 akun tidak pernah memiliki catatan pendaftaran ganda.

### Keamanan
- Seluruh RPC (`track_start_session`, `track_heartbeat`, `track_end_session`, `track_auth_event`) menggunakan **`auth.uid()`** di dalam PostgreSQL — **UserID tidak pernah dipercaya dari body request frontend**.
- Password dan access token tidak pernah disimpan di tabel tracking.
- Inactivity timeout default: **15 menit** (bisa diatur via `SESSION_INACTIVITY_TIMEOUT_MINUTES` di `backend/.env`), dilengkapi *background sweeper* setiap 5 menit dan pengecekan otomatis saat heartbeat/session start.

---

## 2. API Endpoints Tracking

### Tracking Sesi (`/api/tracking`)
- `POST /api/tracking/session/start`
  - Body: `{ "visitor_id": "<uuid>", "session_id": "<uuid opsional>" }`
  - Memulai sesi Guest baru (atau Registered jika menyertakan header `Authorization: Bearer <token>`). Jika `session_id` masih `Active`, sesi dilanjutkan tanpa duplikasi.
- `POST /api/tracking/session/heartbeat`
  - Body: `{ "visitor_id": "<uuid>", "session_id": "<uuid>" }`
  - Memperbarui `last_activity_at_wib` dan `duration_seconds`. Otomatis menandai `Expired` jika melebihi batas inactivity.
- `POST /api/tracking/session/end`
  - Body: `{ "visitor_id": "<uuid>", "session_id": "<uuid>", "reason": "page_unload" }`
  - Mengakhiri sesi (mendukung `navigator.sendBeacon` saat browser ditutup tiba-tiba).

### Auth dengan Transisi Guest → Registered (`/api/auth`)
- `POST /api/auth/signup` — Sertakan `visitor_id` & `session_id` (opsional) di body atau header `x-visitor-id` / `x-session-id`.
- `POST /api/auth/login` — Sertakan `visitor_id` & `session_id` (opsional) agar riwayat sesi Guest ditutup rapi (`transitioned_to_registered`) dan sesi Registered baru dimulai dengan `visitor_id` yang sama.
- `POST /api/auth/logout` — Menutup sesi aktif (`end_reason = 'logout'`) dan mencatat event `logout` dalam WIB.
- `GET /api/auth/sessions` — Melihat riwayat sesi user yang sedang login.
- `GET /api/auth/logs` — Melihat riwayat aktivitas user yang sedang login.

---

## 3. Cara Menguji (End-to-End via Postman / Frontend)

1. Jalankan SQL `backend/supabase_user_access_tracking.sql` di Supabase SQL Editor.
2. Jalankan backend:
   ```bash
   cd backend && npm run dev
   ```
3. **Tes Guest Mode:**
   - Kirim `POST http://localhost:3000/api/tracking/session/start` dengan `{ "visitor_id": "11111111-1111-4111-8111-111111111111" }`.
   - Salin `tracking.session_id`.
   - Kirim `POST http://localhost:3000/api/tracking/session/heartbeat` dengan `visitor_id` & `session_id` tersebut.
4. **Tes Guest → Sign Up (Transisi):**
   - Kirim `POST http://localhost:3000/api/auth/signup` dengan `full_name`, `email` (`@gmail.com`), `password` (min 8 char, huruf besar+kecil+angka), `phone` (`08...`), **plus** `visitor_id` & `session_id` Guest tadi.
   - Cek di Supabase:
     - `user_visitors`: `converted_from_guest = true`, `linked_user_id` terisi, `visitor_id` tetap sama.
     - `user_sessions`: sesi Guest lama berstatus `Ended` (`end_reason = 'transitioned_to_registered'`), sesi Registered baru berstatus `Active` dengan `started_as_guest = true`.
     - `user_activity_logs`: tercatat 1 event `guest_to_registered` dan 1 event `signup` (tidak duplikat).
5. **Tes Logout:**
   - Kirim `POST http://localhost:3000/api/auth/logout` dengan header `Authorization: Bearer <access_token>` dan body `{ "visitor_id": "...", "session_id": "..." }`.
   - Sesi Registered berubah menjadi `Ended` (`end_reason = 'logout'`) dengan `duration_seconds` dan `session_ended_at_wib` terisi.

---

## 4. Query SQL Pemeriksaan Hasil di Supabase

Jalankan query berikut di **Supabase → SQL Editor** untuk mengecek seluruh 10 indikator:

```sql
-- 1 & 10. Total pengunjung unik (Visitor ID unik)
SELECT COUNT(*) AS total_unique_visitors FROM public.user_visitors;

-- 2. Jumlah pengunjung yang pernah menggunakan Guest Mode
SELECT COUNT(DISTINCT visitor_id) AS total_guest_visitors
FROM public.user_sessions
WHERE access_type = 'Guest';

-- 3. Jumlah pengguna yang melakukan Sign Up
SELECT COUNT(*) AS total_signups
FROM public.user_activity_logs
WHERE event_type = 'signup';

-- 4. Jumlah pengguna unik & total kejadian Login
SELECT
  COUNT(DISTINCT user_id) AS unique_logged_in_users,
  COUNT(*) AS total_login_events
FROM public.user_activity_logs
WHERE event_type = 'login';

-- 5 & 6. Kapan masing-masing pengunjung pertama kali mengakses & terakhir aktif (WIB)
SELECT
  v.visitor_id,
  p.full_name,
  p.email,
  v.first_access_type,
  v.converted_from_guest,
  v.first_seen_at_wib,
  v.last_seen_at_wib,
  v.total_sessions
FROM public.user_visitors v
LEFT JOIN public.profiles p ON p.id = v.linked_user_id
ORDER BY v.last_seen_at DESC;

-- 7 & 8. Jumlah sesi & durasi tiap sesi berlangsung (WIB)
SELECT
  s.session_id,
  s.visitor_id,
  p.email,
  s.access_type,
  s.started_as_guest,
  s.session_status,
  s.session_started_at_wib,
  s.last_activity_at_wib,
  s.session_ended_at_wib,
  s.duration_seconds,
  s.end_reason
FROM public.user_sessions s
LEFT JOIN public.profiles p ON p.id = s.user_id
ORDER BY s.session_started_at DESC;

-- 9. Daftar pengguna yang awalnya Guest lalu melakukan Sign Up / Login
SELECT
  v.visitor_id,
  p.full_name,
  p.email,
  v.first_seen_at_wib AS first_guest_visit_wib,
  v.converted_at_wib AS converted_to_registered_wib
FROM public.user_visitors v
JOIN public.profiles p ON p.id = v.linked_user_id
WHERE v.converted_from_guest = TRUE
ORDER BY v.converted_at DESC;
```
