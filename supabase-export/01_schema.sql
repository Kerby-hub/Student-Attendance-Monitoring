--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; (exists)


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'teacher',
    'student'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'present',
    'late',
    'absent'
);


--
-- Name: calendar_audience; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_audience AS ENUM (
    'all',
    'teachers',
    'students'
);


--
-- Name: day_of_week; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.day_of_week AS ENUM (
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
);


--
-- Name: session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_status AS ENUM (
    'waiting',
    'open',
    'closed',
    'expired'
);


--
-- Name: sms_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sms_status AS ENUM (
    'pending',
    'sent',
    'failed'
);


--
-- Name: student_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.student_status AS ENUM (
    'active',
    'inactive',
    'graduated',
    'archived'
);


--
-- Name: teacher_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.teacher_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: attendance_record_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attendance_record_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_phone text;
  v_subject text;
  v_title text;
  v_body text;
  v_type text;
BEGIN
  SELECT s.user_id, s.contact_number INTO v_user_id, v_phone
    FROM public.students s WHERE s.id = NEW.student_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(sub.code || ' · ' || sub.name, 'Class')
    INTO v_subject
    FROM public.attendance_sessions sess
    JOIN public.class_schedules cs ON cs.id = sess.schedule_id
    LEFT JOIN public.subjects sub ON sub.id = cs.subject_id
    WHERE sess.id = NEW.session_id;

  IF NEW.status = 'present' THEN
    v_title := 'Attendance recorded';
    v_body := 'You were marked present for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'confirmation';
  ELSIF NEW.status = 'late' THEN
    v_title := 'Marked late';
    v_body := 'You were marked late for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'late';
  ELSIF NEW.status = 'absent' THEN
    v_title := 'Absence recorded';
    v_body := 'You were marked absent for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'absence';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, title, body, type)
    VALUES (v_user_id, v_title, v_body, v_type);

  IF v_phone IS NOT NULL AND length(v_phone) > 0 THEN
    INSERT INTO public.sms_logs(recipient_user_id, phone, message, status, provider_response)
      VALUES (v_user_id, v_phone, v_title || ': ' || v_body, 'stubbed', jsonb_build_object('stub', true, 'auto', true));
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  default_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );

  -- Read role from signup metadata, default to 'student'
  BEGIN
    default_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  EXCEPTION WHEN OTHERS THEN
    default_role := 'student';
  END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: process_expired_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_expired_sessions() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sess record;
  v_closed int := 0;
  v_absents int := 0;
BEGIN
  FOR v_sess IN
    SELECT sess.id, sess.schedule_id, cs.section_id, cs.end_time
      FROM public.attendance_sessions sess
      JOIN public.class_schedules cs ON cs.id = sess.schedule_id
      WHERE sess.status IN ('waiting','open')
        AND (
          (sess.expires_at IS NOT NULL AND now() > sess.expires_at)
          OR (now()::time > cs.end_time AND COALESCE(sess.opened_at, sess.created_at)::date = current_date)
        )
  LOOP
    UPDATE public.attendance_sessions
      SET status = 'closed', closed_at = now()
      WHERE id = v_sess.id;
    v_closed := v_closed + 1;

    INSERT INTO public.attendance_records(session_id, student_id, status)
      SELECT v_sess.id, st.id, 'absent'
        FROM public.students st
        WHERE st.section_id = v_sess.section_id
          AND st.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM public.attendance_records r
              WHERE r.session_id = v_sess.id AND r.student_id = st.id
          );
    GET DIAGNOSTICS v_absents = ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object('closed', v_closed, 'absents_marked', v_absents);
END;
$$;


--
-- Name: rotate_session_qr(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_session_qr(_session_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner uuid;
  v_token text;
BEGIN
  SELECT teacher_id INTO v_owner FROM public.attendance_sessions WHERE id = _session_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.teachers WHERE id = v_owner AND user_id = auth.uid()
  )) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_token := encode(gen_random_bytes(16), 'hex');
  UPDATE public.attendance_sessions
    SET qr_token = v_token, qr_rotated_at = now(), status = CASE WHEN status='waiting' THEN 'open'::session_status ELSE status END, opened_at = COALESCE(opened_at, now())
    WHERE id = _session_id;
  RETURN v_token;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: student_check_in(text, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_check_in(_qr_token text, _lat double precision, _lng double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session record;
  v_student_id uuid;
  v_existing uuid;
  v_grace_minutes int;
  v_qr_seconds int;
  v_now timestamptz := now();
  v_zone record;
  v_in_zone boolean := true; -- if no zones assigned, allow
  v_distance double precision;
  v_status attendance_status := 'present';
  v_schedule record;
  v_class_start timestamptz;
BEGIN
  -- Load settings
  SELECT (value::text)::int INTO v_qr_seconds FROM public.system_settings WHERE key='qr_rotation_seconds';
  SELECT (value::text)::int INTO v_grace_minutes FROM public.system_settings WHERE key='late_grace_minutes';
  v_qr_seconds := COALESCE(v_qr_seconds, 15);
  v_grace_minutes := COALESCE(v_grace_minutes, 10);

  -- Find session for token
  SELECT * INTO v_session FROM public.attendance_sessions
    WHERE qr_token = _qr_token AND status = 'open'
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'QR code is invalid or session is closed.');
  END IF;

  -- Token freshness (rotation + small grace)
  IF v_session.qr_rotated_at IS NOT NULL 
     AND v_now > v_session.qr_rotated_at + make_interval(secs => v_qr_seconds + 5) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired_token', 'message', 'QR code expired. Please scan the latest one.');
  END IF;

  -- Find student record
  SELECT id INTO v_student_id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_student', 'message', 'Student record not found.');
  END IF;

  -- Duplicate check
  SELECT id INTO v_existing FROM public.attendance_records
    WHERE session_id = v_session.id AND student_id = v_student_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', 'Already checked in for this class.');
  END IF;

  -- Geofence validation
  IF EXISTS (SELECT 1 FROM public.schedule_geofences WHERE schedule_id = v_session.schedule_id) THEN
    v_in_zone := false;
    FOR v_zone IN
      SELECT gz.* FROM public.geofence_zones gz
        JOIN public.schedule_geofences sg ON sg.zone_id = gz.id
        WHERE sg.schedule_id = v_session.schedule_id AND gz.active = true
    LOOP
      -- Haversine
      v_distance := 2 * 6371000 * asin(sqrt(
        sin(radians((_lat - v_zone.center_lat)/2))^2 +
        cos(radians(v_zone.center_lat)) * cos(radians(_lat)) *
        sin(radians((_lng - v_zone.center_lng)/2))^2
      ));
      IF v_distance <= v_zone.radius_meters THEN
        v_in_zone := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_in_zone THEN
      RETURN jsonb_build_object('ok', false, 'code', 'outside_zone', 'message', 'You are outside the allowed location.');
    END IF;
  END IF;

  -- Late detection (compare to class_schedules.start_time today)
  SELECT * INTO v_schedule FROM public.class_schedules WHERE id = v_session.schedule_id;
  IF v_schedule.start_time IS NOT NULL THEN
    v_class_start := (current_date + v_schedule.start_time) AT TIME ZONE current_setting('TIMEZONE');
    IF v_now > v_class_start + make_interval(mins => v_grace_minutes) THEN
      v_status := 'late';
    END IF;
  END IF;

  -- Insert record
  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, check_in_lat, check_in_lng)
  VALUES (v_session.id, v_student_id, v_status, v_now, _lat, _lng);

  RETURN jsonb_build_object('ok', true, 'status', v_status::text, 'message', 'Attendance recorded.');
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    student_id uuid NOT NULL,
    check_in_at timestamp with time zone,
    check_out_at timestamp with time zone,
    check_in_lat double precision,
    check_in_lng double precision,
    check_out_lat double precision,
    check_out_lng double precision,
    status public.attendance_status DEFAULT 'present'::public.attendance_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    status public.session_status DEFAULT 'waiting'::public.session_status NOT NULL,
    qr_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    qr_rotated_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    audience public.calendar_audience DEFAULT 'all'::public.calendar_audience NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_events_check CHECK ((ends_at >= starts_at))
);


--
-- Name: class_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    section_id uuid NOT NULL,
    room text,
    day public.day_of_week NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    semester text NOT NULL,
    school_year text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_schedules_check CHECK ((end_time > start_time))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_fingerprint text NOT NULL,
    device_name text,
    user_agent text,
    platform text,
    status text DEFAULT 'active'::text NOT NULL,
    registration_date timestamp with time zone DEFAULT now() NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: geofence_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geofence_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    center_lat double precision NOT NULL,
    center_lng double precision NOT NULL,
    radius_meters integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT geofence_zones_radius_meters_check CHECK ((radius_meters > 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    type text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL
);


--
-- Name: schedule_geofences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_geofences (
    schedule_id uuid NOT NULL,
    zone_id uuid NOT NULL
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    program text,
    year_level integer,
    school_year text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sections_year_level_check CHECK (((year_level >= 1) AND (year_level <= 10)))
);


--
-- Name: sms_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid,
    phone text NOT NULL,
    message text NOT NULL,
    status public.sms_status DEFAULT 'pending'::public.sms_status NOT NULL,
    provider_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_profiles (
    student_id uuid NOT NULL,
    address text,
    birthdate date,
    gender text,
    emergency_contact_name text,
    emergency_contact_phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    student_no text NOT NULL,
    full_name text NOT NULL,
    program text,
    year_level integer,
    section_id uuid,
    contact_number text,
    parent_contact text,
    status public.student_status DEFAULT 'active'::public.student_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text,
    last_name text,
    middle_name text,
    email text,
    profile_picture_url text,
    CONSTRAINT students_year_level_check CHECK (((year_level >= 1) AND (year_level <= 10)))
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    units numeric(3,1) DEFAULT 3 NOT NULL,
    department_id uuid,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subjects_units_check CHECK ((units >= (0)::numeric))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: teacher_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_sections (
    teacher_id uuid NOT NULL,
    section_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: teacher_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_subjects (
    teacher_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    teacher_no text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    department_id uuid,
    "position" text,
    status public.teacher_status DEFAULT 'active'::public.teacher_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_session_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_session_id_student_id_key UNIQUE (session_id, student_id);


--
-- Name: attendance_sessions attendance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: class_schedules class_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_schedules
    ADD CONSTRAINT class_schedules_pkey PRIMARY KEY (id);


--
-- Name: departments departments_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: device_registrations device_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_registrations
    ADD CONSTRAINT device_registrations_pkey PRIMARY KEY (id);


--
-- Name: device_registrations device_registrations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_registrations
    ADD CONSTRAINT device_registrations_user_id_key UNIQUE (user_id);


--
-- Name: geofence_zones geofence_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_zones
    ADD CONSTRAINT geofence_zones_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: schedule_geofences schedule_geofences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_geofences
    ADD CONSTRAINT schedule_geofences_pkey PRIMARY KEY (schedule_id, zone_id);


--
-- Name: sections sections_name_school_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_name_school_year_key UNIQUE (name, school_year);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: sms_logs sms_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_pkey PRIMARY KEY (student_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_student_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_no_key UNIQUE (student_no);


--
-- Name: students students_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_key UNIQUE (user_id);


--
-- Name: subjects subjects_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_code_key UNIQUE (code);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: teacher_sections teacher_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_sections
    ADD CONSTRAINT teacher_sections_pkey PRIMARY KEY (teacher_id, section_id);


--
-- Name: teacher_subjects teacher_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_pkey PRIMARY KEY (teacher_id, subject_id);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: teachers teachers_teacher_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_teacher_no_key UNIQUE (teacher_no);


--
-- Name: teachers teachers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_key UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_device_registrations_fp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_registrations_fp ON public.device_registrations USING btree (device_fingerprint);


--
-- Name: idx_device_registrations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_registrations_user ON public.device_registrations USING btree (user_id);


--
-- Name: idx_notif_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_user ON public.notifications USING btree (user_id);


--
-- Name: idx_rec_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rec_student ON public.attendance_records USING btree (student_id);


--
-- Name: idx_sess_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sess_schedule ON public.attendance_sessions USING btree (schedule_id);


--
-- Name: idx_sess_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sess_status ON public.attendance_sessions USING btree (status);


--
-- Name: profiles_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_status_idx ON public.profiles USING btree (status);


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: device_registrations touch_device_registrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_device_registrations_updated_at BEFORE UPDATE ON public.device_registrations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attendance_records trg_attendance_record_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_record_notify AFTER INSERT ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.attendance_record_notify();


--
-- Name: calendar_events trg_cal_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cal_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: departments trg_dept_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dept_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: geofence_zones trg_geo_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_geo_updated BEFORE UPDATE ON public.geofence_zones FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attendance_records trg_rec_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: class_schedules trg_sched_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sched_updated BEFORE UPDATE ON public.class_schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: sections trg_sec_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sec_updated BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attendance_sessions trg_sess_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sess_updated BEFORE UPDATE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: students trg_stud_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stud_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: student_profiles trg_student_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_student_profiles_updated BEFORE UPDATE ON public.student_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: subjects trg_subj_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subj_updated BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: teachers trg_teach_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teach_updated BEFORE UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attendance_records attendance_records_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: attendance_sessions attendance_sessions_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.class_schedules(id) ON DELETE CASCADE;


--
-- Name: attendance_sessions attendance_sessions_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: class_schedules class_schedules_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_schedules
    ADD CONSTRAINT class_schedules_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE RESTRICT;


--
-- Name: class_schedules class_schedules_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_schedules
    ADD CONSTRAINT class_schedules_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;


--
-- Name: class_schedules class_schedules_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_schedules
    ADD CONSTRAINT class_schedules_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT;


--
-- Name: device_registrations device_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_registrations
    ADD CONSTRAINT device_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: schedule_geofences schedule_geofences_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_geofences
    ADD CONSTRAINT schedule_geofences_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.class_schedules(id) ON DELETE CASCADE;


--
-- Name: schedule_geofences schedule_geofences_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_geofences
    ADD CONSTRAINT schedule_geofences_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.geofence_zones(id) ON DELETE CASCADE;


--
-- Name: sms_logs sms_logs_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: student_profiles student_profiles_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE SET NULL;


--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subjects subjects_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: teacher_sections teacher_sections_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_sections
    ADD CONSTRAINT teacher_sections_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE CASCADE;


--
-- Name: teacher_sections teacher_sections_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_sections
    ADD CONSTRAINT teacher_sections_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: teachers teachers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: device_registrations Admins can delete devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete devices" ON public.device_registrations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all profiles" ON public.profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins manage all user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all user_roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: student_profiles Admins manage student profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage student profiles" ON public.student_profiles USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_logs Admins read audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_settings Admins write settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins write settings" ON public.system_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_settings Anyone authenticated reads settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated reads settings" ON public.system_settings FOR SELECT TO authenticated USING (true);


--
-- Name: audit_logs Authenticated insert audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = actor_id));


--
-- Name: student_profiles Students update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students update own profile" ON public.student_profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_profiles.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: students Students update own student row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students update own student row" ON public.students FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: student_profiles Students upsert own profile insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students upsert own profile insert" ON public.student_profiles FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_profiles.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: student_profiles Students view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view own profile" ON public.student_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_profiles.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: students Students view own student row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view own student row" ON public.students FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: student_profiles Teachers view student profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view student profiles" ON public.student_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.students s
     JOIN public.teacher_sections ts ON ((ts.section_id = s.section_id)))
     JOIN public.teachers t ON ((t.id = ts.teacher_id)))
  WHERE ((s.id = student_profiles.student_id) AND (t.user_id = auth.uid())))));


--
-- Name: device_registrations Users can insert own device; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own device" ON public.device_registrations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: device_registrations Users can update own device last_login; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own device last_login" ON public.device_registrations FOR UPDATE TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: device_registrations Users can view own device; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own device" ON public.device_registrations FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_admin_all ON public.audit_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events cal_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cal_admin_all ON public.calendar_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: calendar_events cal_read_audience; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cal_read_audience ON public.calendar_events FOR SELECT TO authenticated USING (((audience = 'all'::public.calendar_audience) OR ((audience = 'teachers'::public.calendar_audience) AND public.has_role(auth.uid(), 'teacher'::public.app_role)) OR ((audience = 'students'::public.calendar_audience) AND public.has_role(auth.uid(), 'student'::public.app_role))));


--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: class_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments dept_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_admin_all ON public.departments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: departments dept_read_all_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_read_all_auth ON public.departments FOR SELECT TO authenticated USING (true);


--
-- Name: device_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: geofence_zones geo_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY geo_admin_all ON public.geofence_zones TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: geofence_zones geo_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY geo_read_auth ON public.geofence_zones FOR SELECT TO authenticated USING (true);


--
-- Name: geofence_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notif_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_admin_all ON public.notifications TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notifications notif_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_own_read ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notif_own_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_own_update ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records rec_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rec_admin_all ON public.attendance_records TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attendance_records rec_student_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rec_student_insert ON public.attendance_records FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = attendance_records.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: attendance_records rec_student_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rec_student_own ON public.attendance_records FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = attendance_records.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: attendance_records rec_student_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rec_student_update_own ON public.attendance_records FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = attendance_records.student_id) AND (s.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = attendance_records.student_id) AND (s.user_id = auth.uid())))));


--
-- Name: attendance_records rec_teacher_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rec_teacher_session ON public.attendance_records FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.attendance_sessions sess
     JOIN public.teachers t ON ((t.id = sess.teacher_id)))
  WHERE ((sess.id = attendance_records.session_id) AND (t.user_id = auth.uid())))));


--
-- Name: class_schedules sched_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sched_admin_all ON public.class_schedules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: class_schedules sched_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sched_read_auth ON public.class_schedules FOR SELECT TO authenticated USING (true);


--
-- Name: schedule_geofences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_geofences ENABLE ROW LEVEL SECURITY;

--
-- Name: sections sec_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sec_admin_all ON public.sections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sections sec_read_all_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sec_read_all_auth ON public.sections FOR SELECT TO authenticated USING (true);


--
-- Name: sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_sessions sess_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sess_admin_all ON public.attendance_sessions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attendance_sessions sess_student_read_section; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sess_student_read_section ON public.attendance_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.class_schedules cs
     JOIN public.students s ON ((s.section_id = cs.section_id)))
  WHERE ((cs.id = attendance_sessions.schedule_id) AND (s.user_id = auth.uid())))));


--
-- Name: attendance_sessions sess_teacher_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sess_teacher_own ON public.attendance_sessions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.teachers t
  WHERE ((t.id = attendance_sessions.teacher_id) AND (t.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.teachers t
  WHERE ((t.id = attendance_sessions.teacher_id) AND (t.user_id = auth.uid())))));


--
-- Name: schedule_geofences sgeo_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sgeo_admin_all ON public.schedule_geofences TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: schedule_geofences sgeo_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sgeo_read_auth ON public.schedule_geofences FOR SELECT TO authenticated USING (true);


--
-- Name: sms_logs sms_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_admin_all ON public.sms_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sms_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: students stud_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stud_admin_all ON public.students TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: students stud_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stud_self_read ON public.students FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: students stud_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stud_self_update ON public.students FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: students stud_teacher_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stud_teacher_read ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'::public.app_role));


--
-- Name: student_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects subj_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subj_admin_all ON public.subjects TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: subjects subj_read_all_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subj_read_all_auth ON public.subjects FOR SELECT TO authenticated USING (true);


--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers teach_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teach_admin_all ON public.teachers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: teachers teach_read_basic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teach_read_basic ON public.teachers FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'student'::public.app_role)));


--
-- Name: teachers teach_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teach_self_read ON public.teachers FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: teacher_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_subjects ts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ts_admin_all ON public.teacher_subjects TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: teacher_subjects ts_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ts_read_auth ON public.teacher_subjects FOR SELECT TO authenticated USING (true);


--
-- Name: teacher_sections tsec_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tsec_admin_all ON public.teacher_sections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: teacher_sections tsec_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tsec_read_auth ON public.teacher_sections FOR SELECT TO authenticated USING (true);


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO sandbox_exec;


--
-- Name: FUNCTION attendance_record_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.attendance_record_notify() TO anon;
GRANT ALL ON FUNCTION public.attendance_record_notify() TO authenticated;
GRANT ALL ON FUNCTION public.attendance_record_notify() TO service_role;
GRANT ALL ON FUNCTION public.attendance_record_notify() TO sandbox_exec;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user() TO sandbox_exec;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO sandbox_exec;


--
-- Name: FUNCTION process_expired_sessions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.process_expired_sessions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_expired_sessions() TO anon;
GRANT ALL ON FUNCTION public.process_expired_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.process_expired_sessions() TO service_role;
GRANT ALL ON FUNCTION public.process_expired_sessions() TO sandbox_exec;


--
-- Name: FUNCTION rotate_session_qr(_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rotate_session_qr(_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.rotate_session_qr(_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rotate_session_qr(_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rotate_session_qr(_session_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;
GRANT ALL ON FUNCTION public.set_updated_at() TO sandbox_exec;


--
-- Name: FUNCTION student_check_in(_qr_token text, _lat double precision, _lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.student_check_in(_qr_token text, _lat double precision, _lng double precision) TO anon;
GRANT ALL ON FUNCTION public.student_check_in(_qr_token text, _lat double precision, _lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.student_check_in(_qr_token text, _lat double precision, _lng double precision) TO service_role;
GRANT ALL ON FUNCTION public.student_check_in(_qr_token text, _lat double precision, _lng double precision) TO sandbox_exec;


--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;
GRANT ALL ON FUNCTION public.touch_updated_at() TO sandbox_exec;


--
-- Name: TABLE attendance_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_records TO anon;
GRANT ALL ON TABLE public.attendance_records TO authenticated;
GRANT ALL ON TABLE public.attendance_records TO service_role;
GRANT SELECT,INSERT ON TABLE public.attendance_records TO sandbox_exec;


--
-- Name: TABLE attendance_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_sessions TO anon;
GRANT ALL ON TABLE public.attendance_sessions TO authenticated;
GRANT ALL ON TABLE public.attendance_sessions TO service_role;
GRANT SELECT,INSERT ON TABLE public.attendance_sessions TO sandbox_exec;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.audit_logs TO sandbox_exec;


--
-- Name: TABLE calendar_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calendar_events TO anon;
GRANT ALL ON TABLE public.calendar_events TO authenticated;
GRANT ALL ON TABLE public.calendar_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.calendar_events TO sandbox_exec;


--
-- Name: TABLE class_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_schedules TO anon;
GRANT ALL ON TABLE public.class_schedules TO authenticated;
GRANT ALL ON TABLE public.class_schedules TO service_role;
GRANT SELECT,INSERT ON TABLE public.class_schedules TO sandbox_exec;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.departments TO anon;
GRANT ALL ON TABLE public.departments TO authenticated;
GRANT ALL ON TABLE public.departments TO service_role;
GRANT SELECT,INSERT ON TABLE public.departments TO sandbox_exec;


--
-- Name: TABLE device_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_registrations TO anon;
GRANT ALL ON TABLE public.device_registrations TO authenticated;
GRANT ALL ON TABLE public.device_registrations TO service_role;
GRANT SELECT,INSERT ON TABLE public.device_registrations TO sandbox_exec;


--
-- Name: TABLE geofence_zones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.geofence_zones TO anon;
GRANT ALL ON TABLE public.geofence_zones TO authenticated;
GRANT ALL ON TABLE public.geofence_zones TO service_role;
GRANT SELECT,INSERT ON TABLE public.geofence_zones TO sandbox_exec;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
GRANT SELECT,INSERT ON TABLE public.notifications TO sandbox_exec;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT,INSERT ON TABLE public.profiles TO sandbox_exec;


--
-- Name: TABLE schedule_geofences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schedule_geofences TO anon;
GRANT ALL ON TABLE public.schedule_geofences TO authenticated;
GRANT ALL ON TABLE public.schedule_geofences TO service_role;
GRANT SELECT,INSERT ON TABLE public.schedule_geofences TO sandbox_exec;


--
-- Name: TABLE sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sections TO anon;
GRANT ALL ON TABLE public.sections TO authenticated;
GRANT ALL ON TABLE public.sections TO service_role;
GRANT SELECT,INSERT ON TABLE public.sections TO sandbox_exec;


--
-- Name: TABLE sms_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_logs TO anon;
GRANT ALL ON TABLE public.sms_logs TO authenticated;
GRANT ALL ON TABLE public.sms_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.sms_logs TO sandbox_exec;


--
-- Name: TABLE student_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_profiles TO anon;
GRANT ALL ON TABLE public.student_profiles TO authenticated;
GRANT ALL ON TABLE public.student_profiles TO service_role;
GRANT SELECT,INSERT ON TABLE public.student_profiles TO sandbox_exec;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;
GRANT SELECT,INSERT ON TABLE public.students TO sandbox_exec;


--
-- Name: TABLE subjects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subjects TO anon;
GRANT ALL ON TABLE public.subjects TO authenticated;
GRANT ALL ON TABLE public.subjects TO service_role;
GRANT SELECT,INSERT ON TABLE public.subjects TO sandbox_exec;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.system_settings TO sandbox_exec;


--
-- Name: TABLE teacher_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_sections TO anon;
GRANT ALL ON TABLE public.teacher_sections TO authenticated;
GRANT ALL ON TABLE public.teacher_sections TO service_role;
GRANT SELECT,INSERT ON TABLE public.teacher_sections TO sandbox_exec;


--
-- Name: TABLE teacher_subjects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_subjects TO anon;
GRANT ALL ON TABLE public.teacher_subjects TO authenticated;
GRANT ALL ON TABLE public.teacher_subjects TO service_role;
GRANT SELECT,INSERT ON TABLE public.teacher_subjects TO sandbox_exec;


--
-- Name: TABLE teachers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teachers TO anon;
GRANT ALL ON TABLE public.teachers TO authenticated;
GRANT ALL ON TABLE public.teachers TO service_role;
GRANT SELECT,INSERT ON TABLE public.teachers TO sandbox_exec;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_roles TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


