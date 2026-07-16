/**
 * Admin server functions for user provisioning.
 * Only callable by users with the 'admin' role. All actions are audit-logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CreateUserInput = {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "teacher" | "student";
  status: "active" | "inactive";
  /** Origin of the calling browser, used to build the login URL in the credentials email. */
  origin?: string;
  studentData?: {
    student_no: string;
    program?: string;
    year_level?: number;
    section_id?: string | null;
    contact_number?: string;
    parent_contact?: string;
  };
  teacherData?: {
    teacher_no: string;
    department_id?: string | null;
    position?: string;
    contact_number?: string;
  };
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin role required.");
}

/**
 * Generate the next sequential ID for a student or teacher in the
 * STU-YYYY-#### / TCH-YYYY-#### format. The sequence resets per year.
 */
async function nextAutoId(
  supabaseAdmin: any,
  kind: "student" | "teacher",
): Promise<string> {
  const prefix = kind === "student" ? "STU" : "TCH";
  const table = kind === "student" ? "students" : "teachers";
  const col = kind === "student" ? "student_no" : "teacher_no";
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;
  const { data } = await supabaseAdmin
    .from(table)
    .select(col)
    .ilike(col, `${yearPrefix}%`)
    .order(col, { ascending: false })
    .limit(1);
  let next = 1;
  const last = data?.[0]?.[col] as string | undefined;
  if (last) {
    const tail = last.slice(yearPrefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${yearPrefix}${String(next).padStart(4, "0")}`;
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateUserInput) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const normalizedEmail = data.email.trim().toLowerCase();

    // 0) Pre-flight duplicate checks — avoid creating an orphan auth user
    //    when the student_no/teacher_no or email is already taken.
    if (data.role === "student") {
      const sn = data.studentData?.student_no?.trim();
      if (sn) {
        const { data: existing } = await supabaseAdmin
          .from("students").select("id").eq("student_no", sn).maybeSingle();
        if (existing) throw new Error("STUDENT_NO_TAKEN: Student ID already exists.");
      }
    } else if (data.role === "teacher") {
      const tn = data.teacherData?.teacher_no?.trim();
      if (tn) {
        const { data: existing } = await supabaseAdmin
          .from("teachers").select("id").eq("teacher_no", tn).maybeSingle();
        if (existing) throw new Error("TEACHER_NO_TAKEN: Teacher ID already exists.");
      }
    }
    {
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles").select("id").ilike("email", normalizedEmail).maybeSingle();
      if (existingProfile) throw new Error("EMAIL_TAKEN: Email already exists.");
    }

    // 1) Create auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role: data.role },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Failed to create user";
      if (/already.*registered|already.*exists|duplicate/i.test(msg)) {
        throw new Error("EMAIL_TAKEN: Email already exists.");
      }
      throw new Error(msg);
    }
    const newUserId = created.user.id;

    // 2) Mark profile as needing password change + status (handle_new_user trigger already inserted profile+role)
    await supabaseAdmin.from("profiles").update({
      must_change_password: true,
      status: data.status,
      full_name: data.fullName,
    }).eq("id", newUserId);

    // 3) Ensure role is correct (trigger reads metadata, but be defensive)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: data.role });

    // 4) Role-specific record (auto-generate IDs if missing). Roll back the
    //    auth user if the insert fails so we never leave an orphan account.
    async function rollbackAuth() {
      try { await supabaseAdmin.auth.admin.deleteUser(newUserId); } catch { /* noop */ }
    }
    if (data.role === "student") {
      const sd = data.studentData ?? ({} as NonNullable<typeof data.studentData>);
      const studentNo = sd.student_no?.trim() || await nextAutoId(supabaseAdmin, "student");
      const { error: insErr } = await supabaseAdmin.from("students").insert({
        user_id: newUserId,
        student_no: studentNo,
        full_name: data.fullName,
        email: normalizedEmail,
        program: sd.program ?? null,
        year_level: sd.year_level ?? null,
        section_id: sd.section_id ?? null,
        contact_number: sd.contact_number ?? null,
        parent_contact: sd.parent_contact ?? null,
        status: data.status,
      });
      if (insErr) {
        await rollbackAuth();
        if ((insErr as { code?: string }).code === "23505" || /duplicate|unique/i.test(insErr.message)) {
          throw new Error("STUDENT_NO_TAKEN: Student ID already exists.");
        }
        throw new Error(insErr.message);
      }
    } else if (data.role === "teacher") {
      const td = data.teacherData ?? ({} as NonNullable<typeof data.teacherData>);
      const teacherNo = td.teacher_no?.trim() || await nextAutoId(supabaseAdmin, "teacher");
      const { error: insErr } = await supabaseAdmin.from("teachers").insert({
        user_id: newUserId,
        teacher_no: teacherNo,
        full_name: data.fullName,
        email: normalizedEmail,
        department_id: td.department_id ?? null,
        position: td.position ?? null,
        status: data.status,
      });
      if (insErr) {
        await rollbackAuth();
        if ((insErr as { code?: string }).code === "23505" || /duplicate|unique/i.test(insErr.message)) {
          throw new Error("TEACHER_NO_TAKEN: Teacher ID already exists.");
        }
        throw new Error(insErr.message);
      }
    }

    // 5) Credential email — provider resolved from Admin → Settings first,
    //    then EMAIL_PROVIDER env, finally stub. Supports stub/resend/smtp.
    //    Login URL priority: request origin (from browser) > APP_PUBLIC_URL >
    //    APP_URL > SITE_URL env. Never emit "[your site]" — send a bare "/login"
    //    only as a last resort so the anchor in the email still renders.
    const rawOrigin =
      data.origin?.trim() ||
      process.env.APP_PUBLIC_URL ||
      process.env.APP_URL ||
      process.env.SITE_URL ||
      "";
    const origin = rawOrigin.replace(/\/+$/, "");
    const loginUrl = origin ? `${origin}/login` : "/login";
    const { sendCredentialsEmail, resolveEmailProvider } = await import(
      "@/lib/email/credentials.server"
    );
    const { data: setting } = await supabaseAdmin
      .from("system_settings").select("value").eq("key", "email_provider").maybeSingle();
    const provider = resolveEmailProvider(setting?.value);
    const subject = "Your Student Attendance Monitoring System Account";
    const body =
      `Hello ${data.fullName},\n\n` +
      `An account has been created for you in the Student Attendance Monitoring System.\n\n` +
      `Login email: ${data.email}\n` +
      `Temporary password: ${data.password}\n` +
      `Login page: ${loginUrl}\n\n` +
      `For security, you will be required to change your password after your first login.\n` +
      `Please do not share this password with anyone.\n\nThank you.`;

    const emailResult = await sendCredentialsEmail({
      toEmail: data.email,
      toName: data.fullName,
      tempPassword: data.password,
      loginUrl,
      provider,
    });

    await supabaseAdmin.from("email_logs").insert({
      recipient_user_id: newUserId,
      recipient_email: data.email,
      subject,
      body,
      template: "credentials",
      provider: emailResult.provider,
      status: emailResult.status,
      error_message: emailResult.error ?? null,
      provider_response: emailResult.info,
    } as never);
    const emailStatus = emailResult.status;

    // 6) Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "user_created",
      entity_type: "auth.users",
      entity_id: newUserId,
      metadata: { email: data.email, role: data.role, status: data.status, email_status: emailStatus },
    });


    return {
      ok: true,
      userId: newUserId,
      emailStatus,
      emailProvider: emailResult.provider,
      emailError: emailResult.error ?? null,
    };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; newPassword: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.userId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "password_reset",
      entity_type: "auth.users",
      entity_id: data.userId,
      metadata: {},
    });
    return { ok: true };
  });

export const adminSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; status: "active" | "inactive" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ status: data.status }).eq("id", data.userId);
    // mirror to student/teacher rows
    await supabaseAdmin.from("students").update({ status: data.status }).eq("user_id", data.userId);
    await supabaseAdmin.from("teachers").update({ status: data.status }).eq("user_id", data.userId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: data.status === "inactive" ? "user_deactivated" : "user_activated",
      entity_type: "auth.users",
      entity_id: data.userId,
      metadata: { status: data.status },
    });
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: "admin" | "teacher" | "student" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "role_changed",
      entity_type: "auth.users",
      entity_id: data.userId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

/**
 * Update profile fields that are shared across all role dashboards
 * (full_name, email). Keeps profiles, auth metadata, and the role-specific
 * row (students/teachers) in sync so dashboards never show a stale name.
 */
export const adminUpdateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { userId: string; fullName?: string; email?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If email is provided, check it against the current record. Only enforce
    // uniqueness when it actually changed to another account's email.
    let normalizedEmail: string | undefined;
    if (typeof data.email === "string" && data.email.trim()) {
      normalizedEmail = data.email.trim().toLowerCase();
      const { data: current } = await supabaseAdmin
        .from("profiles").select("email").eq("id", data.userId).maybeSingle();
      const currentEmail = (current?.email ?? "").trim().toLowerCase();
      if (normalizedEmail !== currentEmail) {
        const { data: taken } = await supabaseAdmin
          .from("profiles").select("id").ilike("email", normalizedEmail)
          .neq("id", data.userId).maybeSingle();
        if (taken) throw new Error("EMAIL_TAKEN: Email already exists.");
      }
    }

    const profilePatch: { full_name?: string; email?: string } = {};
    if (typeof data.fullName === "string") profilePatch.full_name = data.fullName;
    if (normalizedEmail) profilePatch.email = normalizedEmail;
    if (Object.keys(profilePatch).length > 0) {
      await supabaseAdmin.from("profiles").update(profilePatch).eq("id", data.userId);
    }

    // Keep auth metadata in sync so anything reading user_metadata also updates.
    const authUpdate: Record<string, unknown> = {};
    if (normalizedEmail) authUpdate.email = normalizedEmail;
    if (typeof data.fullName === "string") {
      authUpdate.user_metadata = { full_name: data.fullName };
    }
    if (Object.keys(authUpdate).length > 0) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate as never);
      } catch (e) {
        const msg = (e as Error).message || "";
        if (/already.*(registered|exists)|duplicate/i.test(msg)) {
          throw new Error("EMAIL_TAKEN: Email already exists.");
        }
        /* other errors non-fatal */
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "user_profile_updated",
      entity_type: "auth.users",
      entity_id: data.userId,
      metadata: profilePatch as never,
    });
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // students.user_id and teachers.user_id are ON DELETE SET NULL — so before
    // we delete the auth user, mark their role-specific rows as archived/inactive
    // to keep historical records intact but exclude them from active lists.
    await supabaseAdmin.from("students").update({ status: "archived" }).eq("user_id", data.userId);
    await supabaseAdmin.from("teachers").update({ status: "inactive" }).eq("user_id", data.userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "user_deleted",
      entity_type: "auth.users",
      entity_id: data.userId,
      metadata: {},
    });
    return { ok: true };
  });
