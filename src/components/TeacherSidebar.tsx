import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, ClipboardCheck, FileBarChart, Bell } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/teacher", icon: LayoutDashboard, exact: true },
  { title: "Schedules", url: "/teacher/schedules", icon: CalendarClock },
  { title: "Attendance", url: "/teacher/attendance", icon: ClipboardCheck },
  { title: "Reports", url: "/teacher/reports", icon: FileBarChart },
  { title: "Notifications", url: "/teacher/notifications", icon: Bell },
];

export function TeacherSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">T</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">SAMS Teacher</p>
            <p className="truncate text-xs text-muted-foreground">Attendance Portal</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Teaching</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
