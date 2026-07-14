import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAcademicYears, useSemesters, useCurrentSemester } from "@/lib/academic/hooks";
import { useEffect } from "react";

export interface FilterValue {
  from: string;
  to: string;
  teacherId: string;
  sectionId: string;
  studentId: string;
  academicYearId: string; // "" = all
  semesterId: string; // "" = all
}

interface Props {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  showDateRange?: boolean;
}

export function ReportFilters({ value, onChange, showDateRange = true }: Props) {
  const { data: years = [] } = useAcademicYears();
  const { data: allSemesters = [] } = useSemesters(value.academicYearId || undefined);
  const { data: currentSemester } = useCurrentSemester();

  // Default to current semester the first time we load, if caller hasn't set one.
  useEffect(() => {
    if (!value.semesterId && !value.academicYearId && currentSemester) {
      onChange({
        ...value,
        academicYearId: currentSemester.academic_year_id,
        semesterId: currentSemester.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSemester?.id]);

  const { data: teachers = [] } = useQuery({
    queryKey: ["filter-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers").select("id, full_name").order("full_name").limit(500);
      if (error) throw error;
      return data as { id: string; full_name: string }[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["filter-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections").select("id, name").order("name").limit(500);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["filter-students", value.sectionId],
    queryFn: async () => {
      let q = supabase
        .from("students").select("id, full_name, student_no")
        .order("full_name").limit(500);
      if (value.sectionId) q = q.eq("section_id", value.sectionId);
      const { data, error } = await q;
      if (error) throw error;
      return data as { id: string; full_name: string; student_no: string }[];
    },
  });

  const set = (patch: Partial<FilterValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {showDateRange && (
        <>
          <div>
            <Label>From</Label>
            <Input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </>
      )}
      <div>
        <Label>Academic year</Label>
        <Select
          value={value.academicYearId || "all"}
          onValueChange={(v) => set({ academicYearId: v === "all" ? "" : v, semesterId: "" })}
        >
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Semester</Label>
        <Select value={value.semesterId || "all"} onValueChange={(v) => set({ semesterId: v === "all" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All semesters</SelectItem>
            {allSemesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Teacher</Label>
        <Select value={value.teacherId || "all"} onValueChange={(v) => set({ teacherId: v === "all" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teachers</SelectItem>
            {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Section</Label>
        <Select value={value.sectionId || "all"} onValueChange={(v) => set({ sectionId: v === "all" ? "" : v, studentId: "" })}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Student</Label>
        <Select value={value.studentId || "all"} onValueChange={(v) => set({ studentId: v === "all" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All students</SelectItem>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.student_no})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
