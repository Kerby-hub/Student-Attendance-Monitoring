import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, BarChart3, Activity,
  Users, GraduationCap, UserCog, Smartphone,
  Radio, BookOpen, Layers, CalendarClock, CalendarDays, Building2,
  MapPin, Map,
  Bell, MessageSquare, ScrollText,
  Download, Settings,
  GraduationCap as Logo,
  ShieldCheck, Megaphone, BookMarked,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { CollapsibleNavGroup, SidebarAccordion, type NavGroup } from "@/components/CollapsibleNavGroup";

const groups: NavGroup[] = [
  {
    label: "Dashboard", icon: LayoutDashboard,
    items: [{ title: "Overview", url: "/admin", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "User Management", icon: UserCog,
    items: [
      { title: "User Accounts", url: "/admin/users", icon: UserCog },
      { title: "Students", url: "/admin/students", icon: GraduationCap },
      { title: "Teachers", url: "/admin/teachers", icon: Users },
      { title: "Device Management", url: "/admin/devices", icon: Smartphone },
    ],
  },
  {
    label: "Academic", icon: BookMarked,
    items: [
      { title: "Academic Management", url: "/admin/academic", icon: CalendarDays },
      { title: "Departments", url: "/admin/departments", icon: Building2 },
      { title: "Program/Course", url: "/admin/programs", icon: BookMarked },
      { title: "Classes", url: "/admin/sections", icon: Layers },
      { title: "Subjects", url: "/admin/subjects", icon: BookOpen },
      { title: "Schedules", url: "/admin/schedules", icon: CalendarClock },
      { title: "Calendar", url: "/admin/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Attendance", icon: Radio,
    items: [
      { title: "Attendance Sessions", url: "/teacher/attendance", icon: Radio },
      { title: "Location Monitoring", url: "/admin/location", icon: Map },
      { title: "Geofence Zones", url: "/admin/geofencing", icon: MapPin },
    ],
  },
  {
    label: "Reports", icon: BarChart3,
    items: [
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
      { title: "Export Center", url: "/admin/exports", icon: Download },
    ],
  },
  {
    label: "Communication", icon: Megaphone,
    items: [
      { title: "Broadcast Messages", url: "/admin/broadcast", icon: Bell },
      { title: "Notification Logs", url: "/admin/notifications", icon: ScrollText },
      { title: "Email Logs", url: "/admin/email-logs", icon: MessageSquare },
    ],
  },
  {
    label: "System Administration", icon: ShieldCheck,
    items: [
      { title: "Audit Logs", url: "/admin/audit-logs", icon: Activity },
      { title: "System Settings", url: "/admin/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { profile, roles } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-3 py-4">
        <Link to="/admin" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md">
            <Logo className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">SAMS</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">Admin Console</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar scrollbar-thin">
        <SidebarAccordion storageKey="sams.sidebar.admin.openGroup">
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
              {roles[0] || "user"}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
