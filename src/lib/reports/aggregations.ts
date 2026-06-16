// Pure helpers to aggregate attendance rows fetched from supabase.
export type AttendanceStatus = "present" | "late" | "absent" | "excused" | string;

export interface AttendanceFlatRow {
  date: string;
  time: string;
  student_id: string;
  student_no: string;
  student: string;
  program: string;
  section_id: string | null;
  section: string;
  subject: string;
  subject_name: string;
  teacher_id: string | null;
  teacher: string;
  status: AttendanceStatus;
}

export interface Totals {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  pct: number; // (present+late)/total * 100
}

export function tally(rows: AttendanceFlatRow[]): Totals {
  const t: Totals = { total: 0, present: 0, late: 0, absent: 0, excused: 0, pct: 0 };
  for (const r of rows) {
    t.total += 1;
    if (r.status === "present") t.present += 1;
    else if (r.status === "late") t.late += 1;
    else if (r.status === "absent") t.absent += 1;
    else if (r.status === "excused") t.excused += 1;
  }
  t.pct = t.total ? Math.round(((t.present + t.late) / t.total) * 1000) / 10 : 0;
  return t;
}

export function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const r of rows) {
    const k = key(r);
    (out[k] ||= []).push(r);
  }
  return out;
}

export function isoWeekStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay() || 7; // 1..7, Mon=1
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthRange(yyyymm: string): { from: string; to: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  return { from: fmtDate(from), to: fmtDate(to) };
}

export function weekRange(anyDateIso: string): { from: string; to: string } {
  const start = isoWeekStart(new Date(anyDateIso));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: fmtDate(start), to: fmtDate(end) };
}
