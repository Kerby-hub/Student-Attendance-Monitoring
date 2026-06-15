# Manual migration to your Supabase project (`rkfjmkowkhpchtwcthma`)

These three SQL files were extracted from the current backend and are safe
to paste into your own Supabase dashboard.

## 1. Run the SQL

Open your project at https://supabase.com/dashboard/project/rkfjmkowkhpchtwcthma
→ **SQL Editor** → **New query**, and run **in this order** (one file at a time):

1. `01_schema.sql` — all enums, tables, GRANTs, RLS policies, functions
   (`has_role`, `handle_new_user`, `student_check_in`, `rotate_session_qr`,
   `process_expired_sessions`, `attendance_record_notify`, `touch_updated_at`,
   `set_updated_at`), and table-level triggers.
2. `02_auth_trigger.sql` — installs `on_auth_user_created` on `auth.users`
   (must run *after* `handle_new_user` exists).
3. `03_storage.sql` — creates the private `student-avatars` storage bucket.

If any statement complains "already exists", you can safely ignore it or
prepend `DROP ... IF EXISTS` for that object.

## 2. Seed the first admin

In your Supabase dashboard → **Authentication → Users → Add user → Create new user**:

- Email: `kerbydelatorre08@gmail.com`
- Password: pick a strong temporary password (write it down)
- ☑ **Auto Confirm User**
- Under **User Metadata (raw_user_meta_data)** paste:
  ```json
  { "full_name": "Kerby Dela Torre", "role": "admin" }
  ```

The `on_auth_user_created` trigger will automatically create the matching
`profiles` row and insert `('user_id', 'admin')` into `public.user_roles`.

Then in **SQL Editor** run:
```sql
UPDATE public.profiles
SET must_change_password = true
WHERE email = 'kerbydelatorre08@gmail.com';
```
(If your `profiles` table doesn't have that column yet, add it:
`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;`)

## 3. Verify

In **SQL Editor**:
```sql
-- tables
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY 1;

-- admin row
SELECT p.email, p.full_name, ur.role
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.email = 'kerbydelatorre08@gmail.com';
```

Then run the **Database → Linter** (left sidebar → Database → Linter) and
resolve any errors it flags (warnings about extension placement can be left).

## 4. Environment variables

Grab these from your Supabase dashboard:
**Project Settings → API**

- `Project URL` → `https://rkfjmkowkhpchtwcthma.supabase.co`
- `anon public` key
- `service_role` key (server only — never ship to the browser)

### Local `.env` (project root)

```env
VITE_SUPABASE_URL="https://rkfjmkowkhpchtwcthma.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your anon public key>"
VITE_SUPABASE_PROJECT_ID="rkfjmkowkhpchtwcthma"

# server-side (TanStack server fns / SSR)
SUPABASE_URL="https://rkfjmkowkhpchtwcthma.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<your anon public key>"
SUPABASE_SERVICE_ROLE_KEY="<your service_role key>"
SUPABASE_PROJECT_ID="rkfjmkowkhpchtwcthma"
```

Then:
```bash
bun install
bun dev
```
Open http://localhost:8080 and sign in with the admin email + temp password.

### Lovable hosting

⚠️ Important: the `.env` in this Lovable project is **managed by Lovable
Cloud** and is regenerated to point at the Cloud-managed project
(`zhvuopsexzqbyauffard`). It cannot be permanently overridden from inside
the editor. Lovable hosting will therefore continue to talk to the
Cloud-managed Supabase, **not** to `rkfjmkowkhpchtwcthma`.

To make Lovable hosting use your own Supabase, you must either:
- migrate the project off Lovable Cloud (not currently supported — Cloud
  cannot be disconnected from a project once added), **or**
- self-host the build (Vercel / Netlify / Cloudflare Pages) with the
  `.env` above. Local `bun dev` is unaffected.

Your professor's requirement (data lives in your own Supabase dashboard)
is satisfied on local hosting and on any self-hosted deploy that uses the
`.env` above.
