import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentSemester, useCurrentAcademicYear } from "@/lib/academic/hooks";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/student/schedules")({
  component: StudentSchedulesPage,
});

type ScheduleRow = {
  id: string;
  subject_id: string;
  section_id: string;
  teacher_id: string;
  day: string;
  start_time: string;
  end_time: string;
  room: string | null;
  semester_id: string | null;
  subjects: { code: string; name: string; units: number | null } | null;
  sections: { name: string } | null;
  teachers: { full_name: string } | null;
};

const DAY_ORDER: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};
const DAY_LABEL: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function fmtTime(t: string): string {
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${suffix}`;
}

function StudentSchedulesPage() {
  const { user } = useAuth();
  const { data: currentSem } = useCurrentSemester();
  const { data: currentAY } = useCurrentAcademicYear();

  // Resolve student record + active section from enrollment (fallback to students.section_id)
  const { data: sectionInfo } = useQuery({
    queryKey: ["student-active-section", user?.id, currentSem?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: student } = await supabase
        .from("students")
        .select("id, section_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!student) return null;
      let sectionId: string | null = student.section_id;
      if (currentSem?.id) {
        const { data: enr } = await supabase
          .from("student_enrollments" as never)
          .select("section_id")
          .eq("student_id", student.id)
          .eq("semester_id", currentSem.id)
          .eq("status", "active")
          .maybeSingle();
        const enrRow = enr as unknown as { section_id: string } | null;
        if (enrRow?.section_id) sectionId = enrRow.section_id;
      }
      return { studentId: student.id, sectionId };
    },
  });

  const sectionId = sectionInfo?.sectionId ?? null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student-schedules", sectionId, currentSem?.id],
    enabled: !!sectionId,
    queryFn: async () => {
      let q = supabase
        .from("class_schedules")
        .select(`id, subject_id, section_id, teacher_id, day, start_time, end_time, room, semester_id,
          subjects:subjects!class_schedules_subject_id_fkey(code, name, units),
          sections:sections!class_schedules_section_id_fkey(name),
          teachers:teachers!class_schedules_teacher_id_fkey(full_name)`)
        .eq("section_id", sectionId!)
        .order("start_time");
      if (currentSem?.id) q = q.eq("semester_id", currentSem.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ScheduleRow[];
    },
  });

  // Group by subject + teacher + time + room to combine multi-day schedules
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; days: string[]; row: ScheduleRow }>();
    rows.forEach((r) => {
      const k = `${r.subject_id}|${r.teacher_id}|${r.start_time}|${r.end_time}|${r.room ?? ""}`;
      const existing = map.get(k);
      if (existing) existing.days.push(r.day);
      else map.set(k, { key: k, days: [r.day], row: r });
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      days: g.days.sort((a, b) => (DAY_ORDER[a] ?? 99) - (DAY_ORDER[b] ?? 99)),
    })).sort((a, b) => {
      const da = DAY_ORDER[a.days[0]] ?? 99;
      const db = DAY_ORDER[b.days[0]] ?? 99;
      if (da !== db) return da - db;
      return a.row.start_time.localeCompare(b.row.start_time);
    });
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="My Class Schedule"
        description="Read-only view of the class schedules assigned to your section for the active semester."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 pt-6 text-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Active term:</span>
          <Badge variant="secondary">{currentAY?.name ?? "—"}</Badge>
          <Badge>{currentSem?.name ?? "No active semester"}</Badge>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject Code</TableHead>
              <TableHead>Subject Name</TableHead>
              <TableHead className="text-center">Units</TableHead>
              <TableHead>Day(s) &amp; Time</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Teacher</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !sectionId ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No section assigned to your account yet.</TableCell></TableRow>
            ) : grouped.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No class schedules assigned yet.</TableCell></TableRow>
            ) : grouped.map((g) => {
              const s = g.row;
              const dayLabel = g.days.map((d) => DAY_LABEL[d] ?? d).join(", ");
              return (
                <TableRow key={g.key}>
                  <TableCell className="font-mono text-xs">{s.subjects?.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{s.subjects?.name ?? "—"}</TableCell>
                  <TableCell className="text-center">{s.subjects?.units ?? "—"}</TableCell>
                  <TableCell>
                    <span className="font-medium">{dayLabel}</span>
                    <span className="text-muted-foreground"> • {fmtTime(s.start_time)} – {fmtTime(s.end_time)}</span>
                  </TableCell>
                  <TableCell>{s.room ?? "—"}</TableCell>
                  <TableCell>{s.teachers?.full_name ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
