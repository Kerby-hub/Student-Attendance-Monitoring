import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Archive, ArchiveRestore, Search, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser } from "@/lib/admin/users.functions";
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
  profile_picture_url: string | null;
  sections?: { name: string } | null;
};

type Section = { id: string; name: string; program: string | null; year_level: number | null };

const STATUS_VARIANTS: Record<Student["status"], "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", inactive: "secondary", graduated: "outline", archived: "destructive",
};

function genStudentNo() {
  const y = new Date().getFullYear().toString().slice(-2);
  const r = Math.floor(1000 + Math.random() * 9000);
  return `S${y}-${r}`;
}

function StudentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
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
  };
  const [form, setForm] = useState(emptyForm);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const createUserFn = useServerFn(adminCreateUser);

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

  const upsert = useMutation({
    mutationFn: async () => {
      const first = form.first_name.trim();
      const last = form.last_name.trim();
      const mid = form.middle_name.trim();
      const full = [first, mid, last].filter(Boolean).join(" ");
      const payload = {
        student_no: form.student_no.trim(),
        first_name: first || null,
        last_name: last || null,
        middle_name: mid || null,
        full_name: full || form.student_no,
        email: form.email.trim() || null,
        contact_number: form.contact_number.trim() || null,
        program: form.program || null,
        year_level: form.year_level ? parseInt(form.year_level, 10) : null,
        section_id: form.section_id || null,
      };
      if (editing) {
        const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert({ ...payload, status: "active" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Student updated" : "Student created");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["admin-counts"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Student["status"] }) => {
      const { error } = await supabase.from("students").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "archived" ? "Student archived" : "Student restored");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["admin-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, student_no: genStudentNo() });
    setOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
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
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit student" : "New student"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Student ID</Label>
                  <div className="flex gap-2">
                    <Input value={form.student_no} onChange={(e) => setForm({ ...form, student_no: e.target.value })} />
                    {!editing && (
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, student_no: genStudentNo() })}>
                        Generate
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>First name</Label>
                  <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
                <div>
                  <Label>Middle name</Label>
                  <Input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} />
                </div>
                <div>
                  <Label>Contact number</Label>
                  <Input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="+63..." />
                </div>
                <div>
                  <Label>Program</Label>
                  <Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="BSCS" />
                </div>
                <div>
                  <Label>Year level</Label>
                  <Select value={form.year_level} onValueChange={(v) => setForm({ ...form, year_level: v })}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => upsert.mutate()}
                  disabled={!form.student_no || !form.first_name || !form.last_name || upsert.isPending}
                >
                  {editing ? "Save changes" : "Create student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
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
                      onClick={() => setStatus.mutate({ id: s.id, status: "active" })}>
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" title="Archive"
                      onClick={() => setStatus.mutate({ id: s.id, status: "archived" })}>
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
