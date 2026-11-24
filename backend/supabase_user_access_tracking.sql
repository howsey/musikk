-- ============================================================================
-- AETHER GESTURE SYNTH — USER ACCESS & SESSION TRACKING (WIB SUPPORT)
-- Jalankan SQL ini di Supabase -> SQL Editor -> New query -> Run
-- Aman dijalankan berdampingan dengan tabel presets & profiles yang sudah ada.
-- ============================================================================

-- Helper function: format timestamp ke WIB ("YYYY-MM-DD HH24:MI:SS WIB")
CREATE OR REPLACE FUNCTION public.to_wib_text(ts TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT AS $$
BEGIN
  IF ts IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN to_char(ts AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') || ' WIB';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- A. TABEL user_visitors (Anonymous Visitor Identification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_visitors (
  visitor_id UUID PRIMARY KEY,
  first_access_type TEXT NOT NULL DEFAULT 'Guest' CHECK (first_access_type IN ('Guest', 'Registered')),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_from_guest BOOLEAN NOT NULL DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  converted_at_wib TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at_wib TEXT NOT NULL DEFAULT public.to_wib_text(NOW()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at_wib TEXT NOT NULL DEFAULT public.to_wib_text(NOW()),
  total_sessions INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_visitors_linked_user_id ON public.user_visitors(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_visitors_first_seen_at ON public.user_visitors(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_visitors_converted ON public.user_visitors(converted_from_guest);

ALTER TABLE public.user_visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own linked visitor" ON public.user_visitors;
CREATE POLICY "Users can view their own linked visitor"
ON public.user_visitors FOR SELECT
USING (auth.uid() = linked_user_id);

-- ============================================================================
-- B. TABEL user_sessions (Riwayat Sesi Guest & Registered User)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES public.user_visitors(visitor_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('Guest', 'Registered')),
  started_as_guest BOOLEAN NOT NULL DEFAULT FALSE,
  login_at TIMESTAMPTZ,
  login_at_wib TEXT,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_started_at_wib TEXT NOT NULL DEFAULT public.to_wib_text(NOW()),
  session_ended_at TIMESTAMPTZ,
  session_ended_at_wib TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at_wib TEXT NOT NULL DEFAULT public.to_wib_text(NOW()),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  session_status TEXT NOT NULL DEFAULT 'Active' CHECK (session_status IN ('Active', 'Ended', 'Expired')),
  end_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_visitor_id ON public.user_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_access_type ON public.user_sessions(access_type);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status_last_activity ON public.user_sessions(session_status, last_activity_at);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions FOR SELECT
USING (auth.uid() = user_id);

-- ============================================================================
-- C. TABEL user_activity_logs (Event Sign Up, Login, Logout, Transisi Guest)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id UUID REFERENCES public.user_visitors(visitor_id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.user_sessions(session_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('signup', 'login', 'logout', 'guest_session_start', 'guest_to_registered')
  ),
  access_type TEXT NOT NULL CHECK (access_type IN ('Guest', 'Registered')),
  registration_method TEXT,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_at_wib TEXT NOT NULL DEFAULT public.to_wib_text(NOW())
);

-- Jika tabel sudah terlanjur dibuat sebelumnya, hapus kolom ip_address & user_agent
ALTER TABLE public.user_activity_logs DROP COLUMN IF EXISTS ip_address;
ALTER TABLE public.user_activity_logs DROP COLUMN IF EXISTS user_agent;

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_visitor_id ON public.user_activity_logs(visitor_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_event_type ON public.user_activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_event_at ON public.user_activity_logs(event_at DESC);

-- Mencegah duplikasi event signup untuk UserID yang sama
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_activity_logs_single_signup
ON public.user_activity_logs(user_id)
WHERE event_type = 'signup' AND user_id IS NOT NULL;

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own activity logs" ON public.user_activity_logs;
CREATE POLICY "Users can view their own activity logs"
ON public.user_activity_logs FOR SELECT
USING (auth.uid() = user_id);

-- ============================================================================
-- D. SECURE RPC FUNCTIONS (Menggunakan auth.uid() agar UserID tidak bisa dipalsukan)
-- ============================================================================

-- Bersihkan signature lama jika sebelumnya sudah pernah dijalankan
DROP FUNCTION IF EXISTS public.track_start_session(UUID, UUID, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.track_auth_event(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- 1. Expire sesi yang tidak aktif melebihi batas inactivity (default 15 menit)
CREATE OR REPLACE FUNCTION public.expire_inactive_sessions(p_timeout_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE public.user_sessions
  SET
    session_status = 'Expired',
    session_ended_at = last_activity_at,
    session_ended_at_wib = public.to_wib_text(last_activity_at),
    duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - session_started_at))::INTEGER),
    end_reason = 'inactivity_timeout'
  WHERE session_status = 'Active'
    AND last_activity_at < (NOW() - make_interval(mins => GREATEST(1, p_timeout_minutes)));

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

-- 2. Mulai atau lanjutkan sesi (Guest maupun Registered berdasarkan auth.uid())
CREATE OR REPLACE FUNCTION public.track_start_session(
  p_visitor_id UUID,
  p_existing_session_id UUID DEFAULT NULL,
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_access_type TEXT := CASE WHEN v_user_id IS NOT NULL THEN 'Registered' ELSE 'Guest' END;
  v_now TIMESTAMPTZ := NOW();
  v_now_wib TEXT := public.to_wib_text(v_now);
  v_session public.user_sessions%ROWTYPE;
BEGIN
  -- Auto-expire sesi lama milik visitor ini yang sudah lewat batas inactivity
  UPDATE public.user_sessions
  SET
    session_status = 'Expired',
    session_ended_at = last_activity_at,
    session_ended_at_wib = public.to_wib_text(last_activity_at),
    duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - session_started_at))::INTEGER),
    end_reason = 'inactivity_timeout'
  WHERE visitor_id = p_visitor_id
    AND session_status = 'Active'
    AND last_activity_at < (v_now - make_interval(mins => GREATEST(1, p_timeout_minutes)));

  -- Upsert visitor
  INSERT INTO public.user_visitors (
    visitor_id, first_access_type, linked_user_id,
    first_seen_at, first_seen_at_wib, last_seen_at, last_seen_at_wib, total_sessions
  )
  VALUES (
    p_visitor_id, v_access_type, v_user_id,
    v_now, v_now_wib, v_now, v_now_wib, 0
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    last_seen_at = v_now,
    last_seen_at_wib = v_now_wib,
    linked_user_id = COALESCE(public.user_visitors.linked_user_id, v_user_id);

  -- Jika frontend mengirim existing_session_id yang masih Active & cocok, perpanjang (jangan duplikasi sesi)
  IF p_existing_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.user_sessions
    WHERE session_id = p_existing_session_id
      AND visitor_id = p_visitor_id
      AND session_status = 'Active'
      AND access_type = v_access_type
      AND (v_user_id IS NULL OR user_id = v_user_id);

    IF FOUND THEN
      UPDATE public.user_sessions
      SET
        last_activity_at = v_now,
        last_activity_at_wib = v_now_wib,
        duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - session_started_at))::INTEGER)
      WHERE session_id = v_session.session_id
      RETURNING * INTO v_session;

      RETURN jsonb_build_object(
        'reused', TRUE,
        'session_id', v_session.session_id,
        'visitor_id', v_session.visitor_id,
        'user_id', v_session.user_id,
        'access_type', v_session.access_type,
        'session_status', v_session.session_status,
        'session_started_at_wib', v_session.session_started_at_wib,
        'last_activity_at_wib', v_session.last_activity_at_wib
      );
    END IF;
  END IF;

  -- Buat sesi baru
  INSERT INTO public.user_sessions (
    visitor_id, user_id, access_type, started_as_guest,
    login_at, login_at_wib,
    session_started_at, session_started_at_wib,
    last_activity_at, last_activity_at_wib,
    session_status
  )
  VALUES (
    p_visitor_id,
    v_user_id,
    v_access_type,
    (v_access_type = 'Guest'),
    CASE WHEN v_access_type = 'Registered' THEN v_now ELSE NULL END,
    CASE WHEN v_access_type = 'Registered' THEN v_now_wib ELSE NULL END,
    v_now, v_now_wib,
    v_now, v_now_wib,
    'Active'
  )
  RETURNING * INTO v_session;

  UPDATE public.user_visitors
  SET total_sessions = total_sessions + 1
  WHERE visitor_id = p_visitor_id;

  IF v_access_type = 'Guest' THEN
    INSERT INTO public.user_activity_logs (
      user_id, visitor_id, session_id, event_type, access_type,
      event_at, event_at_wib
    )
    VALUES (
      NULL, p_visitor_id, v_session.session_id, 'guest_session_start', 'Guest',
      v_now, v_now_wib
    );
  END IF;

  RETURN jsonb_build_object(
    'reused', FALSE,
    'session_id', v_session.session_id,
    'visitor_id', v_session.visitor_id,
    'user_id', v_session.user_id,
    'access_type', v_session.access_type,
    'session_status', v_session.session_status,
    'session_started_at_wib', v_session.session_started_at_wib,
    'last_activity_at_wib', v_session.last_activity_at_wib
  );
END;
$$;

-- 3. Heartbeat ringan untuk memperbarui last_activity_at & durasi sesi
CREATE OR REPLACE FUNCTION public.track_heartbeat(
  p_visitor_id UUID,
  p_session_id UUID,
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_now_wib TEXT := public.to_wib_text(v_now);
  v_session public.user_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE session_id = p_session_id
    AND visitor_id = p_visitor_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_session.session_status <> 'Active' THEN
    RETURN jsonb_build_object(
      'status', v_session.session_status,
      'session_id', v_session.session_id
    );
  END IF;

  -- Cek apakah sesi sudah melewati batas inactivity
  IF v_session.last_activity_at < (v_now - make_interval(mins => GREATEST(1, p_timeout_minutes))) THEN
    UPDATE public.user_sessions
    SET
      session_status = 'Expired',
      session_ended_at = last_activity_at,
      session_ended_at_wib = public.to_wib_text(last_activity_at),
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - session_started_at))::INTEGER),
      end_reason = 'inactivity_timeout'
    WHERE session_id = p_session_id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
      'status', 'Expired',
      'session_id', v_session.session_id,
      'session_ended_at_wib', v_session.session_ended_at_wib,
      'duration_seconds', v_session.duration_seconds
    );
  END IF;

  UPDATE public.user_sessions
  SET
    last_activity_at = v_now,
    last_activity_at_wib = v_now_wib,
    duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - session_started_at))::INTEGER)
  WHERE session_id = p_session_id
  RETURNING * INTO v_session;

  UPDATE public.user_visitors
  SET
    last_seen_at = v_now,
    last_seen_at_wib = v_now_wib
  WHERE visitor_id = p_visitor_id;

  RETURN jsonb_build_object(
    'status', 'Active',
    'session_id', v_session.session_id,
    'last_activity_at_wib', v_session.last_activity_at_wib,
    'duration_seconds', v_session.duration_seconds
  );
END;
$$;

-- 4. Akhiri sesi (saat browser ditutup / logout)
CREATE OR REPLACE FUNCTION public.track_end_session(
  p_visitor_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'page_unload'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
  v_now_wib TEXT := public.to_wib_text(v_now);
  v_updated_count INTEGER := 0;
BEGIN
  IF p_session_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET
      session_status = 'Ended',
      session_ended_at = v_now,
      session_ended_at_wib = v_now_wib,
      last_activity_at = v_now,
      last_activity_at_wib = v_now_wib,
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - session_started_at))::INTEGER),
      end_reason = p_reason
    WHERE session_id = p_session_id
      AND visitor_id = p_visitor_id
      AND session_status = 'Active';
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  ELSIF v_user_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET
      session_status = 'Ended',
      session_ended_at = v_now,
      session_ended_at_wib = v_now_wib,
      last_activity_at = v_now,
      last_activity_at_wib = v_now_wib,
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - session_started_at))::INTEGER),
      end_reason = p_reason
    WHERE user_id = v_user_id
      AND (p_visitor_id IS NULL OR visitor_id = p_visitor_id)
      AND session_status = 'Active';
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  END IF;

  IF p_visitor_id IS NOT NULL THEN
    UPDATE public.user_visitors
    SET last_seen_at = v_now, last_seen_at_wib = v_now_wib
    WHERE visitor_id = p_visitor_id;
  END IF;

  RETURN jsonb_build_object(
    'ended_sessions', v_updated_count,
    'ended_at_wib', v_now_wib
  );
END;
$$;

-- 5. Transisi Auth (Sign Up / Login / Logout / Guest-to-Registered) — HANYA untuk user terautentikasi (auth.uid())
CREATE OR REPLACE FUNCTION public.track_auth_event(
  p_event_type TEXT, -- 'signup', 'login', atau 'logout'
  p_visitor_id UUID DEFAULT NULL,
  p_guest_session_id UUID DEFAULT NULL,
  p_registration_method TEXT DEFAULT 'email_password',
  p_email TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
  v_now_wib TEXT := public.to_wib_text(v_now);
  v_visitor_id UUID := COALESCE(p_visitor_id, gen_random_uuid());
  v_was_guest BOOLEAN := FALSE;
  v_existing_visitor public.user_visitors%ROWTYPE;
  v_new_session public.user_sessions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: auth.uid() is required';
  END IF;

  IF p_event_type NOT IN ('signup', 'login', 'logout') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  IF p_event_type = 'logout' THEN
    PERFORM public.track_end_session(p_visitor_id, p_guest_session_id, 'logout');

    INSERT INTO public.user_activity_logs (
      user_id, visitor_id, session_id, event_type, access_type,
      email, full_name, phone, event_at, event_at_wib
    )
    VALUES (
      v_user_id, p_visitor_id, p_guest_session_id, 'logout', 'Registered',
      p_email, p_full_name, p_phone, v_now, v_now_wib
    );

    RETURN jsonb_build_object(
      'event_type', 'logout',
      'event_at_wib', v_now_wib
    );
  END IF;

  SELECT * INTO v_existing_visitor
  FROM public.user_visitors
  WHERE visitor_id = v_visitor_id;

  IF FOUND THEN
    IF v_existing_visitor.first_access_type = 'Guest' AND v_existing_visitor.converted_from_guest = FALSE THEN
      v_was_guest := TRUE;
    END IF;

    UPDATE public.user_visitors
    SET
      linked_user_id = v_user_id,
      converted_from_guest = CASE WHEN first_access_type = 'Guest' THEN TRUE ELSE converted_from_guest END,
      converted_at = CASE WHEN first_access_type = 'Guest' AND converted_at IS NULL THEN v_now ELSE converted_at END,
      converted_at_wib = CASE WHEN first_access_type = 'Guest' AND converted_at_wib IS NULL THEN v_now_wib ELSE converted_at_wib END,
      last_seen_at = v_now,
      last_seen_at_wib = v_now_wib
    WHERE visitor_id = v_visitor_id;
  ELSE
    INSERT INTO public.user_visitors (
      visitor_id, first_access_type, linked_user_id, converted_from_guest,
      first_seen_at, first_seen_at_wib, last_seen_at, last_seen_at_wib, total_sessions
    )
    VALUES (
      v_visitor_id, 'Registered', v_user_id, FALSE,
      v_now, v_now_wib, v_now, v_now_wib, 0
    );
  END IF;

  IF p_guest_session_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET
      session_status = 'Ended',
      session_ended_at = v_now,
      session_ended_at_wib = v_now_wib,
      last_activity_at = v_now,
      last_activity_at_wib = v_now_wib,
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - session_started_at))::INTEGER),
      end_reason = 'transitioned_to_registered'
    WHERE session_id = p_guest_session_id
      AND visitor_id = v_visitor_id
      AND access_type = 'Guest'
      AND session_status = 'Active';

    IF FOUND THEN
      v_was_guest := TRUE;
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    visitor_id, user_id, access_type, started_as_guest,
    login_at, login_at_wib,
    session_started_at, session_started_at_wib,
    last_activity_at, last_activity_at_wib,
    session_status
  )
  VALUES (
    v_visitor_id, v_user_id, 'Registered', v_was_guest,
    v_now, v_now_wib,
    v_now, v_now_wib,
    v_now, v_now_wib,
    'Active'
  )
  RETURNING * INTO v_new_session;

  UPDATE public.user_visitors
  SET total_sessions = total_sessions + 1
  WHERE visitor_id = v_visitor_id;

  IF v_was_guest THEN
    INSERT INTO public.user_activity_logs (
      user_id, visitor_id, session_id, event_type, access_type,
      email, full_name, phone, event_at, event_at_wib
    )
    VALUES (
      v_user_id, v_visitor_id, v_new_session.session_id, 'guest_to_registered', 'Registered',
      p_email, p_full_name, p_phone, v_now, v_now_wib
    );
  END IF;

  IF p_event_type = 'signup' THEN
    INSERT INTO public.user_activity_logs (
      user_id, visitor_id, session_id, event_type, access_type, registration_method,
      email, full_name, phone, event_at, event_at_wib
    )
    VALUES (
      v_user_id, v_visitor_id, v_new_session.session_id, 'signup', 'Registered', p_registration_method,
      p_email, p_full_name, p_phone, v_now, v_now_wib
    )
    ON CONFLICT (user_id) WHERE event_type = 'signup' AND user_id IS NOT NULL
    DO NOTHING;
  ELSE
    INSERT INTO public.user_activity_logs (
      user_id, visitor_id, session_id, event_type, access_type,
      email, full_name, phone, event_at, event_at_wib
    )
    VALUES (
      v_user_id, v_visitor_id, v_new_session.session_id, 'login', 'Registered',
      p_email, p_full_name, p_phone, v_now, v_now_wib
    );
  END IF;

  RETURN jsonb_build_object(
    'visitor_id', v_visitor_id,
    'session_id', v_new_session.session_id,
    'user_id', v_user_id,
    'access_type', 'Registered',
    'converted_from_guest', v_was_guest,
    'event_type', p_event_type,
    'event_at_wib', v_now_wib
  );
END;
$$;

-- Izinkan anon & authenticated memanggil RPC secara aman (UserID tetap dikunci lewat auth.uid())
GRANT EXECUTE ON FUNCTION public.expire_inactive_sessions(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_start_session(UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_heartbeat(UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_end_session(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_auth_event(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
