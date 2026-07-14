import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Archive, ArchiveRestore, Search, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser, adminSetStatus, adminUpdateUserProfile } from "@/lib/admin/users.functions";
import { invalidateUserCaches } from "@/lib/admin/invalidate";
import { PageHeader } from "@/components/admin/PageHeader";
import { TempPasswordDialog, generateTempPassword } from "@/components/admin/TempPasswordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/students")({
  component: StudentsPage,
});

type Student = {
  id: string;
  student_no: string;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  program: string | null;
  year_level: number | null;
  section_id: string | null;
  status: "active" | "inactive" | "graduated" | "archived";
  user_id: string | null;
  profile_picture_url: string | null;
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  home_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  sections?: { name: string } | null;
};

type Section = { id: string; name: string; program: string | null; year_level: number | null };

const STATUS_VARIANTS: Record<Student["status"], "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", inactive: "secondary", graduated: "outline", archived: "destructive",
};

const GUARDIAN_RELATIONSHIPS = ["Mother", "Father", "Legal Guardian", "Grandparent", "Other"];

function genStudentNo() {
  const y = new Date().getFullYear().toString().slice(-2);
  const r = Math.floor(1000 + Math.random() * 9000);
  return `S${y}-${r}`;
}

/** Normalize PH mobile → +639XXXXXXXXX or null when invalid. */
function normalizePhPhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, "");
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return null;
}

const Req = () => <span className="text-destructive"> *</span>;
const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p className="mt-1 text-xs text-destructive">{msg}</p> : null;

function StudentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const emptyForm = {
    student_no: "", first_name: "", last_name: "", middle_name: "",
    email: "", contact_number: "", program: "", year_level: "1",
    section_id: "" as string,
    temp_password: "",
    guardian_name: "", guardian_relationship: "", guardian_phone: "",
    guardian_email: "", home_address: "",
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const createUserFn = useServerFn(adminCreateUser);
  const setStatusFn = useServerFn(adminSetStatus);
  const updateProfileFn = useServerFn(adminUpdateUserProfile);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, sections(name)")
        .order("last_name", { ascending: true, nullsFirst: false })
        .order("full_name");
      if (error) throw error;
      return data as unknown as Student[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("id, name, program, year_level")
        .order("name");
      if (error) throw error;
      return data as Section[];
    },
  });

  const programs = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => s.program && set.add(s.program));
    sections.forEach((s) => s.program && set.add(s.program));
    return Array.from(set).sort();
  }, [students, sections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterProgram !== "all" && s.program !== filterProgram) return false;
      if (filterYear !== "all" && String(s.year_level) !== filterYear) return false;
      if (filterSection !== "all" && s.section_id !== filterSection) return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.student_no.toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, search, filterProgram, filterYear, filterSection, filterStatus]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.student_no.trim()) e.student_no = "Student ID is required.";
    if (!form.first_name.trim()) e.first_name = "First name is required.";
    if (!form.last_name.trim()) e.last_name = "Last name is required.";
    if (!editing && !form.email.trim()) e.email = "Email is required for a login account.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "Invalid email address.";
    if (!form.guardian_name.trim()) e.guardian_name = "Guardian name is required.";
    if (!form.guardian_relationship) e.guardian_relationship = "Please select a relationship.";
    if (!form.guardian_phone.trim()) e.guardian_phone = "Guardian mobile number is required.";
    else if (!normalizePhPhone(form.guardian_phone))
      e.guardian_phone = "Invalid PH mobile number (e.g. 09171234567 or +639171234567).";
    if (form.guardian_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardian_email.trim()))
      e.guardian_email = "Invalid guardian email.";
    if (form.emergency_contact_phone.trim() && !normalizePhPhone(form.emergency_contact_phone))
      e.emergency_contact_phone = "Invalid PH mobile number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("Please fix the highlighted fields.");
      const first = form.first_name.trim();
      const last = form.last_name.trim();
      const mid = form.middle_name.trim();
      const full = [first, mid, last].filter(Boolean).join(" ");
      const email = form.email.trim();
      const guardianPhone = normalizePhPhone(form.guardian_phone) ?? form.guardian_phone.trim();
      const emergencyPhone = form.emergency_contact_phone.trim()
        ? (normalizePhPhone(form.emergency_contact_phone) ?? form.emergency_contact_phone.trim())
        : null;

      const guardianPayload = {
        guardian_name: form.guardian_name.trim() || null,
        guardian_relationship: form.guardian_relationship || null,
        guardian_phone: guardianPhone || null,
        guardian_email: form.guardian_email.trim() || null,
        home_address: form.home_address.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: emergencyPhone,
        emergency_contact_relationship: form.emergency_contact_relationship.trim() || null,
      };

      if (editing) {
        const trimmedNo = form.student_no.trim();
        const trimmedEmail = email.toLowerCase();

        // Duplicate Student ID check (only if changed).
        if (trimmedNo && trimmedNo !== editing.student_no) {
          const { data: dup } = await supabase
            .from("students").select("id").eq("student_no", trimmedNo).neq("id", editing.id).maybeSingle();
          if (dup) {
            setErrors((e) => ({ ...e, student_no: "Student ID already exists." }));
            throw new Error("STUDENT_NO_TAKEN: Student ID already exists.");
          }
        }

        // Duplicate email check (only if changed).
        const currentEmail = (editing.email ?? "").trim().toLowerCase();
        if (trimmedEmail && trimmedEmail !== currentEmail) {
          const { data: dupEmail } = await supabase
            .from("students").select("id").ilike("email", trimmedEmail).neq("id", editing.id).maybeSingle();
          if (dupEmail) {
            setErrors((e) => ({ ...e, email: "Email already exists." }));
            throw new Error("EMAIL_TAKEN: Email already exists.");
          }
        }

        const payload = {
          student_no: trimmedNo,
          first_name: first || null,
          last_name: last || null,
          middle_name: mid || null,
          full_name: full || form.student_no,
          email: trimmedEmail || null,
          contact_number: form.contact_number.trim() || null,
          program: form.program || null,
          year_level: form.year_level ? parseInt(form.year_level, 10) : null,
          section_id: form.section_id || null,
          ...guardianPayload,
        };
        const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
        if (error) {
          if ((error as { code?: string }).code === "23505" && /student_no/i.test(error.message)) {
            setErrors((e) => ({ ...e, student_no: "Student ID already exists." }));
            throw new Error("STUDENT_NO_TAKEN: Student ID already exists.");
          }
          throw error;
        }
        if (editing.user_id) {
          try {
            await updateProfileFn({
              data: {
                userId: editing.user_id,
                fullName: full || form.student_no,
                email: trimmedEmail || undefined,
              },
            });
          } catch (e) {
            const msg = (e as Error).message || "";
            if (/EMAIL_TAKEN/.test(msg)) {
              setErrors((er) => ({ ...er, email: "Email already exists." }));
              throw new Error("EMAIL_TAKEN: Email already exists.");
            }
            /* other errors non-fatal */
          }
        }
        return null;
      }

      if (!email) throw new Error("Email is required to create a login account.");
      const password = form.temp_password.trim() || generateTempPassword();
      if (password.length < 8) throw new Error("Temporary password must be at least 8 characters.");

      const res = await createUserFn({
        data: {
          email,
          password,
          fullName: full || form.student_no,
          role: "student",
          status: "active",
          studentData: {
            student_no: form.student_no.trim(),
            program: form.program || undefined,
            year_level: form.year_level ? parseInt(form.year_level, 10) : undefined,
            section_id: form.section_id || null,
            contact_number: form.contact_number.trim() || undefined,
          },
        },
      });

      if (res?.userId) {
        await supabase.from("students").update({
          first_name: first || null,
          last_name: last || null,
          middle_name: mid || null,
          ...guardianPayload,
        }).eq("user_id", res.userId);
      }
      return { email, password };
    },
    onSuccess: (result) => {
      toast.success(editing ? "Student updated" : "Student created");
      invalidateUserCaches(qc);
      setOpen(false); setEditing(null); setForm(emptyForm); setErrors({});
      if (result) setCredentials(result);
    },
    onError: (e: Error) => {
      const msg = e.message || "Failed to save student";
      if (/STUDENT_NO_TAKEN/.test(msg)) {
        setErrors((er) => ({ ...er, student_no: "Student ID already exists." }));
        toast.error("Student ID already exists");
      } else if (/TEACHER_NO_TAKEN/.test(msg)) {
        toast.error("Teacher ID already exists");
      } else if (/EMAIL_TAKEN/.test(msg) || /already registered|already exists|duplicate/i.test(msg)) {
        setErrors((er) => ({ ...er, email: "Email already exists." }));
        toast.error("Email already exists");
      } else if (/invalid.*email/i.test(msg)) {
        setErrors((er) => ({ ...er, email: "Invalid email address." }));
        toast.error("Invalid email");
      } else if (/password/i.test(msg) && /weak|short|length/i.test(msg)) {
        toast.error("Password too weak");
      } else {
        toast.error(msg.replace(/^[A-Z_]+:\s*/, ""));
      }
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, userId }: { id: string; status: Student["status"]; userId: string | null }) => {
      const { error } = await supabase.from("students").update({ status }).eq("id", id);
      if (error) throw error;
      if (userId) {
        try {
          await setStatusFn({ data: { userId, status: status === "active" ? "active" : "inactive" } });
        } catch { /* non-fatal */ }
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "archived" ? "Student archived" : v.status === "active" ? "Student restored" : "Student updated");
      invalidateUserCaches(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setErrors({});
    setForm({ ...emptyForm, student_no: genStudentNo(), temp_password: generateTempPassword() });
    setOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setErrors({});
    setForm({
      student_no: s.student_no,
      first_name: s.first_name ?? "",
      last_name: s.last_name ?? "",
      middle_name: s.middle_name ?? "",
      email: s.email ?? "",
      contact_number: s.contact_number ?? "",
      program: s.program ?? "",
      year_level: s.year_level ? String(s.year_level) : "",
      section_id: s.section_id ?? "",
      temp_password: "",
      guardian_name: s.guardian_name ?? "",
      guardian_relationship: s.guardian_relationship ?? "",
      guardian_phone: s.guardian_phone ?? "",
      guardian_email: s.guardian_email ?? "",
      home_address: s.home_address ?? "",
      emergency_contact_name: s.emergency_contact_name ?? "",
      emergency_contact_phone: s.emergency_contact_phone ?? "",
      emergency_contact_relationship: s.emergency_contact_relationship ?? "",
    });
    setOpen(true);
  };


  return (
    <div>
      <PageHeader
        title="Students"
        description="Register students, manage records, and assign them to programs and sections."
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New student</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit student" : "New student"}</DialogTitle>
              </DialogHeader>

              <h4 className="mt-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Student information</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Student ID<Req /></Label>
                  <div className="flex gap-2">
                    <Input value={form.student_no} aria-invalid={!!errors.student_no}
                      onChange={(e) => { setForm({ ...form, student_no: e.target.value }); clearErr("student_no"); }} />
                    {!editing && (
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, student_no: genStudentNo() })}>
                        Generate
                      </Button>
                    )}
                  </div>
                  <FieldError msg={errors.student_no} />
                </div>
                <div>
                  <Label>Email{!editing && <Req />}</Label>
                  <Input type="email" value={form.email} aria-invalid={!!errors.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); clearErr("email"); }} />
                  <FieldError msg={errors.email} />
                </div>
                <div>
                  <Label>First name<Req /></Label>
                  <Input value={form.first_name} aria-invalid={!!errors.first_name}
                    onChange={(e) => { setForm({ ...form, first_name: e.target.value }); clearErr("first_name"); }} />
                  <FieldError msg={errors.first_name} />
                </div>
                <div>
                  <Label>Last name<Req /></Label>
                  <Input value={form.last_name} aria-invalid={!!errors.last_name}
                    onChange={(e) => { setForm({ ...form, last_name: e.target.value }); clearErr("last_name"); }} />
                  <FieldError msg={errors.last_name} />
                </div>
                <div>
                  <Label>Middle name</Label>
                  <Input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} />
                </div>
                <div>
                  <Label>Student contact number</Label>
                  <Input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="+63..." />
                </div>
                <div>
                  <Label>Program</Label>
                  <Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="BSCS" />
                </div>
                <div>
                  <Label>Year level</Label>
                  <Select value={form.year_level} onValueChange={(v) => setForm({ ...form, year_level: v })}>
                    <SelectTrigger><SelectValue placeholder="Select year level" /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Section</Label>
                  <Select value={form.section_id || "none"} onValueChange={(v) => setForm({ ...form, section_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Home address</Label>
                  <Input value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} placeholder="Street, Barangay, City" />
                </div>
              </div>

              <h4 className="mt-6 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Parent / Guardian information</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Guardian full name<Req /></Label>
                  <Input value={form.guardian_name} aria-invalid={!!errors.guardian_name}
                    onChange={(e) => { setForm({ ...form, guardian_name: e.target.value }); clearErr("guardian_name"); }} />
                  <FieldError msg={errors.guardian_name} />
                </div>
                <div>
                  <Label>Relationship<Req /></Label>
                  <Select value={form.guardian_relationship}
                    onValueChange={(v) => { setForm({ ...form, guardian_relationship: v }); clearErr("guardian_relationship"); }}>
                    <SelectTrigger aria-invalid={!!errors.guardian_relationship}><SelectValue placeholder="Select relationship" /></SelectTrigger>
                    <SelectContent>
                      {GUARDIAN_RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FieldError msg={errors.guardian_relationship} />
                </div>
                <div>
                  <Label>Guardian mobile number<Req /></Label>
                  <Input value={form.guardian_phone} aria-invalid={!!errors.guardian_phone}
                    onChange={(e) => { setForm({ ...form, guardian_phone: e.target.value }); clearErr("guardian_phone"); }}
                    placeholder="09171234567 or +639171234567" />
                  <FieldError msg={errors.guardian_phone} />
                </div>
                <div>
                  <Label>Guardian email <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input type="email" value={form.guardian_email} aria-invalid={!!errors.guardian_email}
                    onChange={(e) => { setForm({ ...form, guardian_email: e.target.value }); clearErr("guardian_email"); }} />
                  <FieldError msg={errors.guardian_email} />
                </div>
              </div>

              <h4 className="mt-6 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Emergency contact <span className="normal-case text-xs">(optional — if different from guardian)</span></h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Contact name</Label>
                  <Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
                </div>
                <div>
                  <Label>Contact number</Label>
                  <Input value={form.emergency_contact_phone} aria-invalid={!!errors.emergency_contact_phone}
                    onChange={(e) => { setForm({ ...form, emergency_contact_phone: e.target.value }); clearErr("emergency_contact_phone"); }}
                    placeholder="+63..." />
                  <FieldError msg={errors.emergency_contact_phone} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Relationship</Label>
                  <Input value={form.emergency_contact_relationship} onChange={(e) => setForm({ ...form, emergency_contact_relationship: e.target.value })} />
                </div>
              </div>

              {!editing && (
                <div className="mt-4">
                  <Label>Temporary password</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.temp_password}
                      onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                      placeholder="Auto-generated"
                      className="font-mono"
                    />
                    <Button type="button" variant="outline" onClick={() => setForm({ ...form, temp_password: generateTempPassword() })}>
                      <RefreshCw className="mr-1.5 h-4 w-4" />Generate
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Student will be required to change this on first login.
                  </p>
                </div>
              )}

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => upsert.mutate()}
                  disabled={upsert.isPending}
                >
                  {upsert.isPending ? "Saving…" : editing ? "Save changes" : "Create student"}
                </Button>
              </DialogFooter>
            </DialogContent>

          </Dialog>
        }
      />

      <TempPasswordDialog
        open={!!credentials}
        onClose={() => setCredentials(null)}
        email={credentials?.email ?? ""}
        password={credentials?.password ?? ""}
      />


      {/* Filters */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, email…" className="pl-8"
          />
        </div>
        <Select value={filterProgram} onValueChange={setFilterProgram}>
          <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All programs</SelectItem>
            {programs.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger><SelectValue placeholder="Year level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSection} onValueChange={setFilterSection}>
          <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="graduated">Graduated</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No students match the filters.</TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id} className={s.status === "archived" ? "opacity-50" : ""}>
                <TableCell>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={s.profile_picture_url ?? undefined} />
                    <AvatarFallback>{(s.first_name?.[0] ?? s.full_name[0] ?? "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-mono text-sm">{s.student_no}</TableCell>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.program ?? "—"}</TableCell>
                <TableCell>{s.year_level ?? "—"}</TableCell>
                <TableCell>{s.sections?.name ?? "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[s.status]}>{s.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="View">
                    <Link to="/admin/students/$id" params={{ id: s.id }}><Eye className="h-4 w-4" /></Link>
                  </Button>
                  <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {s.status === "archived" ? (
                    <Button variant="ghost" size="icon" title="Restore"
                      onClick={() => setStatus.mutate({ id: s.id, status: "active", userId: s.user_id })}>
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" title="Archive"
                      onClick={() => {
                        if (confirm(`Archive ${s.full_name}? They will no longer be able to access the system, but historical records will be preserved.`)) {
                          setStatus.mutate({ id: s.id, status: "archived", userId: s.user_id });
                        }
                      }}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
