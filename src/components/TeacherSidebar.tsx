import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarClock, ClipboardCheck, FileBarChart, Bell,
  Radio, GraduationCap as Logo,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

const groups = [
  {
    label: "Teaching",
    items: [
      { title: "Dashboard", url: "/teacher", icon: LayoutDashboard, exact: true },
      { title: "Schedules", url: "/teacher/schedules", icon: CalendarClock },
      { title: "Attendance Sessions", url: "/teacher/attendance", icon: Radio },
      { title: "Check-In Records", url: "/teacher/attendance", icon: ClipboardCheck },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports", url: "/teacher/reports", icon: FileBarChart },
      { title: "Notifications", url: "/teacher/notifications", icon: Bell },
    ],
  },
];

export function TeacherSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { profile, roles } = useAuth();
  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md">
            <Logo className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">SAMS</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">Teacher Portal</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-sidebar scrollbar-thin">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item, i) => (
                  <SidebarMenuItem key={`${item.title}-${i}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url, item.exact)}
                      tooltip={item.title}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-white data-[active=true]:font-medium"
                    >
                      <Link to={item.url as any}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
