import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarClock, ClipboardCheck, FileBarChart, Bell,
  Radio, BookMarked, Megaphone, BarChart3, Calendar as CalendarIcon,
  GraduationCap as Logo,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { CollapsibleNavGroup, SidebarAccordion, type NavGroup } from "@/components/CollapsibleNavGroup";

const groups: NavGroup[] = [
  {
    label: "Dashboard", icon: LayoutDashboard,
    items: [{ title: "Dashboard", url: "/teacher", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Classes", icon: BookMarked,
    items: [
      { title: "Schedules", url: "/teacher/schedules", icon: CalendarClock },
      { title: "Calendar", url: "/teacher/calendar", icon: CalendarIcon },
    ],
  },
  {
    label: "Attendance", icon: Radio,
    items: [
      { title: "Attendance Session", url: "/teacher/attendance", icon: Radio },
      { title: "Check-In Records", url: "/teacher/check-in-records", icon: ClipboardCheck },
    ],
  },
  {
    label: "Reports", icon: BarChart3,
    items: [
      { title: "Teacher Reports", url: "/teacher/reports", icon: FileBarChart },
    ],
  },
  {
    label: "Communication", icon: Megaphone,
    items: [
      { title: "Notifications", url: "/teacher/notifications", icon: Bell },
    ],
  },
];

export function TeacherSidebar() {
  const { profile, roles } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-3 py-4">
        <Link to="/teacher" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md">
            <Logo className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">SAMS</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">Teacher Portal</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar scrollbar-thin">
        <SidebarAccordion storageKey="sams.sidebar.teacher.openGroup">
          {groups.map((g) => (
            <CollapsibleNavGroup
              key={g.label}
              group={g}
              storageKey={g.label}
            />
          ))}
        </SidebarAccordion>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:hidden">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {(profile?.full_name || profile?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-sidebar-foreground">
              {profile?.full_name || profile?.email}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
              {roles.find((r) => r === "teacher") || roles[0] || "user"}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
