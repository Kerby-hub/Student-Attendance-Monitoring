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

    // 1) Create auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role: data.role },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");
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

    // 4) Role-specific record (auto-generate IDs if missing)
    if (data.role === "student") {
      const sd = data.studentData ?? ({} as NonNullable<typeof data.studentData>);
      const studentNo = sd.student_no?.trim() || await nextAutoId(supabaseAdmin, "student");
      await supabaseAdmin.from("students").insert({
        user_id: newUserId,
        student_no: studentNo,
        full_name: data.fullName,
        email: data.email,
        program: sd.program ?? null,
        year_level: sd.year_level ?? null,
        section_id: sd.section_id ?? null,
        contact_number: sd.contact_number ?? null,
        parent_contact: sd.parent_contact ?? null,
        status: data.status,
      });
    } else if (data.role === "teacher") {
      const td = data.teacherData ?? ({} as NonNullable<typeof data.teacherData>);
      const teacherNo = td.teacher_no?.trim() || await nextAutoId(supabaseAdmin, "teacher");
      await supabaseAdmin.from("teachers").insert({
        user_id: newUserId,
        teacher_no: teacherNo,
        full_name: data.fullName,
        email: data.email,
        department_id: td.department_id ?? null,
        position: td.position ?? null,
        status: data.status,
      });
    }

    // 5) Credential email — stub by default; sends via real provider when
    //    Admin → Settings → Email provider is set to a configured option.
    const appUrl = process.env.APP_PUBLIC_URL || process.env.SITE_URL || "";
    const subject = "Your Student Attendance Monitoring System Account";
    const body =
      `Hello ${data.fullName},\n\n` +
      `An account has been created for you in the Student Attendance Monitoring System.\n\n` +
      `Login email: ${data.email}\n` +
      `Temporary password: ${data.password}\n` +
      `Login page: ${appUrl || "[your site]"}/login\n\n` +
      `For security, you will be required to change your password after your first login.\n` +
      `Please do not share this password with anyone.\n\nThank you.`;

    let emailStatus: "stubbed" | "sent" | "failed" = "stubbed";
    let emailProviderInfo: Record<string, unknown> = { stub: true };
    try {
      const { data: setting } = await supabaseAdmin
        .from("system_settings").select("value").eq("key", "email_provider").maybeSingle();
      const provider = typeof setting?.value === "string"
        ? setting.value.replace(/^"|"$/g, "")
        : (setting?.value ?? "stub");
      const resendKey = process.env.RESEND_API_KEY;
      const fromAddr = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
      if (provider === "resend" && resendKey) {
        const html = body.split("\n").map((l) => l ? `<p>${l.replace(/</g, "&lt;")}</p>` : "<br/>").join("");
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: fromAddr, to: [data.email], subject, html, text: body }),
        });
        if (res.ok) {
          emailStatus = "sent";
          emailProviderInfo = { provider: "resend", id: (await res.json())?.id ?? null };
        } else {
          emailStatus = "failed";
          emailProviderInfo = { provider: "resend", error: await res.text().catch(() => "send failed") };
        }
      } else {
        emailProviderInfo = { provider: provider || "stub", stub: true };
      }
    } catch (err) {
      emailStatus = "failed";
      emailProviderInfo = { error: err instanceof Error ? err.message : String(err) };
    }

    await supabaseAdmin.from("email_logs").insert({
      recipient_user_id: newUserId,
      recipient_email: data.email,
      subject,
      body,
      template: "credentials",
      status: emailStatus,
      provider_response: emailProviderInfo as never,
    });

    // 6) Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "user_created",
      entity_type: "auth.users",
      entity_id: newUserId,
      metadata: { email: data.email, role: data.role, status: data.status, email_status: emailStatus },
    });


    return { ok: true, userId: newUserId };
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

    const profilePatch: { full_name?: string; email?: string } = {};
    if (typeof data.fullName === "string") profilePatch.full_name = data.fullName;
    if (typeof data.email === "string" && data.email) profilePatch.email = data.email;
    if (Object.keys(profilePatch).length > 0) {
      await supabaseAdmin.from("profiles").update(profilePatch).eq("id", data.userId);
    }

    // Keep auth metadata in sync so anything reading user_metadata also updates.
    const authUpdate: Record<string, unknown> = {};
    if (typeof data.email === "string" && data.email) authUpdate.email = data.email;
    if (typeof data.fullName === "string") {
      authUpdate.user_metadata = { full_name: data.fullName };
    }
    if (Object.keys(authUpdate).length > 0) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate as never);
      } catch { /* non-fatal */ }
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
