# Backend Service

This directory houses the backend server and API endpoints for **Aether Gesture Synth**, powered by Express and Supabase (PostgreSQL + Auth).

---

## 1. Environment Setup

Create `backend/.env` with your Supabase credentials:

```env
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-or-publishable-key"
PORT=3000
```

---

## 2. API Endpoints

### Health & Music Theory
- `GET /api/health` — Server status and uptime.
- `GET /api/chords` — Music theory interval definitions and gesture mapping dictionary.

### Authentication (`/api/auth`)
- `POST /api/auth/signup` — Register a new user.
  - **Validasi:**
    - `email`: wajib berdomain `@gmail.com`.
    - `phone`: wajib diawali angka `0` (bukan `+62`), hanya angka tanpa spasi/strip (10–15 digit).
    - `password`: minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.
  ```json
  {
    "full_name": "Budi Santoso",
    "email": "budi@gmail.com",
    "password": "Password123",
    "phone": "081234567890"
  }
  ```
- `POST /api/auth/login` — Login and receive `access_token` & `refresh_token` (otomatis mencatat tracking login dalam format WIB).
  ```json
  {
    "email": "budi@gmail.com",
    "password": "Password123"
  }
  ```
- `POST /api/auth/refresh` — Perbarui `access_token` menggunakan `refresh_token` tanpa login ulang.
  ```json
  {
    "refresh_token": "<refresh_token>"
  }
  ```
- `GET /api/auth/me` — Get current logged-in user profile (`Authorization: Bearer <access_token>`).
- `GET /api/auth/sessions` — Get login/guest session history in WIB format (`Authorization: Bearer <access_token>`).
- `GET /api/auth/logs` — Get login/signup/logout activity history in WIB format (`Authorization: Bearer <access_token>`).
- `POST /api/auth/logout` — Sign out current user & record logout timestamp in WIB (`Authorization: Bearer <access_token>`).

### Security & Rate Limiting
- **HTTP Security Headers:** Dilindungi menggunakan `helmet`.
- **Rate Limiting:**
  - `/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh`: maks **15 request / 15 menit**.
  - `/api/tracking/*`: maks **120 request / 15 menit**.
  - `/api/*` (umum): maks **300 request / 15 menit**.

### Custom Sound Presets (`/api/presets`)
- `GET /api/presets` — List all default & public presets (plus user's private presets if logged in). Supports `?mine=true` (requires login) and `?search=keyword`.
- `GET /api/presets/:id` — Get a single preset by UUID.
- `POST /api/presets` — Create a new custom sound preset (**requires login**).
  ```json
  {
    "name": "Neon Pluck",
    "description": "Suara synth pendek dan tajam",
    "is_public": true,
    "oscillator": { "type": "fatsawtooth", "count": 2, "spread": 20 },
    "envelope": { "attack": 0.02, "decay": 0.4, "sustain": 0.3, "release": 0.8 },
    "filter_cutoff": 3500,
    "reverb_wet": 0.35
  }
  ```
- `PUT /api/presets/:id` — Update your own preset (**requires login**).
- `DELETE /api/presets/:id` — Delete your own preset (**requires login**).

---

## 3. Running the Server

```bash
npm install

# Start server
npm start

# Development with hot reload
npm run dev
```

Server starts on `http://localhost:3000`.
