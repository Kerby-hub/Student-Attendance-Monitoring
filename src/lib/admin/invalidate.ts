import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every cache that displays user/profile/student/teacher data.
 * Call this after any admin create / update / status-change / delete so
 * all related modules (Students, Teachers, User Accounts, Devices, Reports,
 * Broadcast recipients, Schedules dropdowns, etc.) refresh immediately.
 */
export function invalidateUserCaches(qc: QueryClient) {
  const keys = [
    ["students"],
    ["teachers"],
    ["admin-users"],
    ["admin-counts"],
    ["admin-devices"],
    ["bcast-recipients"],
    ["bcast-programs"],
    ["teachers-for-schedule"],
    ["subjects-active"],
    ["report-users"],
    ["report-logs"],
    ["report-attendance"],
  ];
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}
