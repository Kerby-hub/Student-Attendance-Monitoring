import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, BarChart3, Activity,
  Users, GraduationCap, UserCog, Smartphone,
  Radio, BookOpen, Layers, CalendarClock, CalendarDays, Building2,
  MapPin, Map,
  Bell, MessageSquare, ScrollText,
  Download, Settings,
  GraduationCap as Logo,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

type NavItem = { title: string; url: string; icon: any; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { title: "Overview", url: "/admin", icon: LayoutDashboard, exact: true },
      { title: "Reports & Analytics", url: "/admin/reports", icon: BarChart3 },
      { title: "Audit Logs", url: "/admin/audit-logs", icon: Activity },
    ],
  },
  {
    label: "User Management",
    items: [
      { title: "Students", url: "/admin/students", icon: GraduationCap },
      { title: "Teachers", url: "/admin/teachers", icon: Users },
      { title: "User Accounts", url: "/admin/users", icon: UserCog },
      { title: "Device Management", url: "/admin/devices", icon: Smartphone },
    ],
  },
  {
    label: "Academic",
    items: [
      { title: "Classes", url: "/admin/sections", icon: Layers },
      { title: "Subjects", url: "/admin/subjects", icon: BookOpen },
      { title: "Schedules", url: "/admin/schedules", icon: CalendarClock },
      { title: "Calendar", url: "/admin/calendar", icon: CalendarDays },
      { title: "Departments", url: "/admin/departments", icon: Building2 },
    ],
  },
  {
    label: "Attendance",
    items: [
      { title: "Attendance Sessions", url: "/teacher/attendance", icon: Radio },
    ],
  },
  {
    label: "Geofencing",
    items: [
      { title: "Geofence Zones", url: "/admin/geofencing", icon: MapPin },
      { title: "Location Monitoring", url: "/admin/location", icon: Map },
    ],
  },
  {
    label: "Notifications",
    items: [
      { title: "Notification Logs", url: "/admin/notifications", icon: ScrollText },
      { title: "Broadcast Messages", url: "/admin/broadcast", icon: Bell },
      { title: "Email Logs", url: "/admin/email-logs", icon: MessageSquare },
    ],
  },

  {
    label: "Reports",
    items: [
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
      { title: "Export Center", url: "/admin/exports", icon: Download },
    ],
  },
  {
    label: "System",
    items: [
      { title: "System Settings", url: "/admin/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { profile, roles } = useAuth();

  // Match exact path only — avoids highlighting multiple items that share a URL prefix.
  const isActive = (url: string, exact?: boolean) => {
    if (exact) return pathname === url;
    return pathname === url || pathname.startsWith(url + "/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md">
            <Logo className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">SAMS</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              Attendance Platform
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar scrollbar-thin">
        {groups.map((group) => {
          const groupActive = group.items.some((i) => isActive(i.url, i.exact));
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel
                className={
                  "px-3 text-[10px] font-semibold uppercase tracking-wider " +
                  (groupActive ? "text-primary" : "text-sidebar-foreground/50")
                }
              >
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isActive(item.url, item.exact);
                    return (
                      <SidebarMenuItem key={`${group.label}-${item.title}`}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-white data-[active=true]:font-medium"
                        >
                          <Link to={item.url as any}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
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
