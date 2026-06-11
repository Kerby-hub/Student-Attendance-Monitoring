import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarClock,
  Building2,
  Layers,
  MapPin,
  Bell,
  FileBarChart,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const manage = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Teachers", url: "/admin/teachers", icon: Users },
  { title: "Students", url: "/admin/students", icon: GraduationCap },
  { title: "Subjects", url: "/admin/subjects", icon: BookOpen },
  { title: "Sections", url: "/admin/sections", icon: Layers },
  { title: "Schedules", url: "/admin/schedules", icon: CalendarClock },
  { title: "Departments", url: "/admin/departments", icon: Building2 },
];

const system = [
  { title: "Geofencing", url: "/admin/geofences", icon: MapPin, disabled: true },
  { title: "Notifications", url: "/admin/notifications", icon: Bell, disabled: true },
  { title: "Reports", url: "/admin/reports", icon: FileBarChart, disabled: true },
  { title: "Settings", url: "/admin/settings", icon: Settings, disabled: true },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
            SA
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">SAMS Admin</p>
            <p className="truncate text-xs text-muted-foreground">Attendance System</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manage.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System (coming soon)</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {system.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton disabled className="opacity-50">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
