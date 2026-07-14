/**
 * Shared hooks and helpers for Academic Year / Semester context.
 * All queries respect RLS via the browser Supabase client.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AcademicYear = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "archived";
  is_current: boolean;
};

export type Semester = {
  id: string;
  academic_year_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "closed" | "archived";
  is_current: boolean;
};

export type StudentEnrollment = {
  id: string;
  student_id: string;
  section_id: string;
  academic_year_id: string;
  semester_id: string;
  status: "active" | "completed" | "transferred" | "inactive";
  notes: string | null;
};

export function useAcademicYears() {
  return useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years" as never)
        .select("*")
        .order("name", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AcademicYear[];
    },
  });
}

export function useSemesters(academicYearId?: string) {
  return useQuery({
    queryKey: ["semesters", academicYearId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("semesters" as never).select("*").order("name");
      if (academicYearId) q = (q as never as { eq: (c: string, v: string) => typeof q }).eq("academic_year_id", academicYearId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Semester[];
    },
  });
}

/** Returns the semester currently flagged is_current=true (at most one). */
export function useCurrentSemester() {
  return useQuery({
    queryKey: ["current-semester"],
    queryFn: async () => {
      const { data } = await supabase
        .from("semesters" as never)
        .select("*")
        .eq("is_current", true)
        .maybeSingle();
      return (data ?? null) as unknown as Semester | null;
    },
  });
}

export function useCurrentAcademicYear() {
  return useQuery({
    queryKey: ["current-academic-year"],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years" as never)
        .select("*")
        .eq("is_current", true)
        .maybeSingle();
      return (data ?? null) as unknown as AcademicYear | null;
    },
  });
}
