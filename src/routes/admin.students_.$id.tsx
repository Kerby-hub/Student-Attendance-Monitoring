import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, GraduationCap, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/students/$id")({
  component: StudentDetailsPage,
});

function StudentDetailsPage() {
  const { id } = useParams({ from: "/admin/students/$id" });

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, sections(name, school_year, program, year_level)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["student-attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, check_in_at, check_out_at, attendance_sessions(opened_at, class_schedules(subject_id, subjects(code, name)))")
        .eq("student_id", id)
        .order("check_in_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const late = records.filter((r) => r.status === "late").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const pct = total ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, pct };
  }, [records]);

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;
  if (!student) return (
    <div className="py-10 text-center">
      <p className="text-muted-foreground">Student not found.</p>
      <Button asChild className="mt-4"><Link to="/admin/students">Back to students</Link></Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/students"><ArrowLeft className="mr-1 h-4 w-4" />Back to students</Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6 text-center">
            <Avatar className="h-24 w-24">
              <AvatarImage src={student.profile_picture_url ?? undefined} />
              <AvatarFallback className="text-2xl">{(student.first_name?.[0] ?? student.full_name[0] ?? "?").toUpperCase()}</AvatarFallback>
            </Avatar>
            <h2 className="mt-4 text-xl font-bold">{student.full_name}</h2>
            <p className="font-mono text-sm text-muted-foreground">{student.student_no}</p>
            <Badge className="mt-2" variant={student.status === "active" ? "default" : "secondary"}>
              {student.status}
            </Badge>
            <div className="mt-6 w-full space-y-2 text-left text-sm">
              {student.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{student.email}</p>}
              {student.contact_number && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{student.contact_number}</p>}
              {student.program && <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-muted-foreground" />{student.program} · Year {student.year_level ?? "—"}</p>}
              {student.sections && <p className="flex items-center gap-2"><Layers className="h-4 w-4 text-muted-foreground" />{student.sections.name}</p>}
              {student.home_address && <p className="text-muted-foreground"><span className="font-medium text-foreground">Address:</span> {student.home_address}</p>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {(student.guardian_name || student.guardian_phone || student.emergency_contact_name) && (
            <Card>
              <CardHeader><CardTitle>Parent / Guardian information</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                {student.guardian_name && <div><p className="text-xs uppercase text-muted-foreground">Guardian</p><p className="font-medium">{student.guardian_name}</p></div>}
                {student.guardian_relationship && <div><p className="text-xs uppercase text-muted-foreground">Relationship</p><p>{student.guardian_relationship}</p></div>}
                {student.guardian_phone && <div><p className="text-xs uppercase text-muted-foreground">Guardian mobile</p><p className="font-mono">{student.guardian_phone}</p></div>}
                {student.guardian_email && <div><p className="text-xs uppercase text-muted-foreground">Guardian email</p><p>{student.guardian_email}</p></div>}
                {student.emergency_contact_name && <div><p className="text-xs uppercase text-muted-foreground">Emergency contact</p><p>{student.emergency_contact_name}{student.emergency_contact_relationship ? ` (${student.emergency_contact_relationship})` : ""}</p></div>}
                {student.emergency_contact_phone && <div><p className="text-xs uppercase text-muted-foreground">Emergency mobile</p><p className="font-mono">{student.emergency_contact_phone}</p></div>}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Attendance summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Total" value={stats.total} />
                <Stat label="Present" value={stats.present} className="text-green-600" />
                <Stat label="Late" value={stats.late} className="text-yellow-600" />
                <Stat label="Absent" value={stats.absent} className="text-destructive" />
              </div>
              <div className="mt-6">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Attendance rate</span>
                  <span className="font-semibold">{stats.pct}%</span>
                </div>
                <Progress value={stats.pct} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent attendance</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No attendance records yet.</TableCell></TableRow>
                  ) : records.map((r) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const subj: any = r.attendance_sessions?.class_schedules?.subjects;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.check_in_at ? new Date(r.check_in_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{subj ? `${subj.code} · ${subj.name}` : "—"}</TableCell>
                        <TableCell>{r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell><Badge variant={r.status === "present" ? "default" : r.status === "late" ? "secondary" : "destructive"}>{r.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${className}`}>{value}</p>
    </div>
  );
}
