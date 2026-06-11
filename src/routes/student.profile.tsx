import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/student/profile")({
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: student, isLoading } = useQuery({
    queryKey: ["my-student-full", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students").select("*, sections(name, school_year)").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: extra } = useQuery({
    queryKey: ["my-student-profile", student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_profiles").select("*").eq("student_id", student!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    first_name: "", last_name: "", middle_name: "", contact_number: "",
    address: "", birthdate: "", gender: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  useEffect(() => {
    if (student) {
      setForm((f) => ({
        ...f,
        first_name: student.first_name ?? "",
        last_name: student.last_name ?? "",
        middle_name: student.middle_name ?? "",
        contact_number: student.contact_number ?? "",
      }));
    }
  }, [student]);

  useEffect(() => {
    if (extra) {
      setForm((f) => ({
        ...f,
        address: extra.address ?? "",
        birthdate: extra.birthdate ?? "",
        gender: extra.gender ?? "",
        emergency_contact_name: extra.emergency_contact_name ?? "",
        emergency_contact_phone: extra.emergency_contact_phone ?? "",
      }));
    }
  }, [extra]);

  const save = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("No student record linked.");
      const full = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ").trim();
      const { error: e1 } = await supabase.from("students").update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        middle_name: form.middle_name || null,
        full_name: full || student.full_name,
        contact_number: form.contact_number || null,
      }).eq("id", student.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("student_profiles").upsert({
        student_id: student.id,
        address: form.address || null,
        birthdate: form.birthdate || null,
        gender: form.gender || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-student-full"] });
      qc.invalidateQueries({ queryKey: ["my-student-profile"] });
      qc.invalidateQueries({ queryKey: ["my-student"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !student || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${student.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("student-avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: signed } = await supabase.storage.from("student-avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? null;
    const { error: updErr } = await supabase.from("students").update({ profile_picture_url: url }).eq("id", student.id);
    if (updErr) { toast.error(updErr.message); return; }
    toast.success("Profile picture updated");
    qc.invalidateQueries({ queryKey: ["my-student-full"] });
    qc.invalidateQueries({ queryKey: ["my-student"] });
  }

  if (isLoading) return <p className="text-center text-muted-foreground">Loading…</p>;
  if (!student) return (
    <Card><CardContent className="py-10 text-center text-muted-foreground">
      No student record is linked to your account yet. Please contact your administrator.
    </CardContent></Card>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardContent className="flex flex-col items-center pt-6 text-center">
          <div className="relative">
            <Avatar className="h-28 w-28">
              <AvatarImage src={student.profile_picture_url ?? undefined} />
              <AvatarFallback className="text-2xl">{(student.first_name?.[0] ?? student.full_name[0] ?? "?").toUpperCase()}</AvatarFallback>
            </Avatar>
            <Button
              size="icon" variant="secondary"
              className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full"
              onClick={() => fileRef.current?.click()}
              title="Change picture"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
          <h2 className="mt-4 text-xl font-bold">{student.full_name}</h2>
          <p className="font-mono text-sm text-muted-foreground">{student.student_no}</p>
          <Badge className="mt-2">{student.status}</Badge>
          <div className="mt-6 grid w-full grid-cols-1 gap-2 text-left text-sm">
            <ReadOnly label="Email" value={student.email ?? user?.email ?? "—"} />
            <ReadOnly label="Program" value={student.program ?? "—"} />
            <ReadOnly label="Year level" value={student.year_level ? `Year ${student.year_level}` : "—"} />
            <ReadOnly label="Section" value={student.sections?.name ?? "—"} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Student ID, program, section, year level, and role are managed by your administrator.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
            <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
            <Field label="Middle name" value={form.middle_name} onChange={(v) => setForm({ ...form, middle_name: v })} />
            <Field label="Contact number" value={form.contact_number} onChange={(v) => setForm({ ...form, contact_number: v })} />
            <Field label="Birthdate" type="date" value={form.birthdate} onChange={(v) => setForm({ ...form, birthdate: v })} />
            <Field label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} />
            <div className="sm:col-span-2">
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            </div>
            <Field label="Emergency contact name" value={form.emergency_contact_name} onChange={(v) => setForm({ ...form, emergency_contact_name: v })} />
            <Field label="Emergency contact phone" value={form.emergency_contact_phone} onChange={(v) => setForm({ ...form, emergency_contact_phone: v })} />
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1.5 h-4 w-4" />{save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
