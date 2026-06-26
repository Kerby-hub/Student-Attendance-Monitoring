import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Settings, User as UserIcon, KeyRound, ChevronRight, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  users: "User Accounts",
  devices: "Device Management",
  students: "Students",
  teachers: "Teachers",
  subjects: "Subjects",
  sections: "Classes",
  schedules: "Schedules",
  departments: "Departments",
  geofencing: "Geofencing",
  notifications: "Notifications",
  reports: "Reports",
  "audit-logs": "Audit Logs",
  settings: "System Settings",
  attendance: "Attendance",
  calendar: "Calendar",
  history: "History",
  profile: "Profile",
  "attendance-session": "Live Session",
};

function prettify(seg: string) {
  return SEGMENT_LABELS[seg] || seg.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function Topbar({ portal = "Admin" }: { portal?: string }) {
  const { profile, roles, signOut, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const { data: unread = 0 } = useQuery({
    queryKey: ["topbar-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const segments = pathname.split("/").filter(Boolean);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate({ to: "/login", replace: true });
    } finally {
      setSigningOut(false);
      setConfirmOpen(false);
    }
  };

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-6">
      <SidebarTrigger className="text-foreground" />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
        <span className="font-semibold text-foreground">{portal}</span>
        {segments.slice(1).map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            <span className={i === segments.length - 2 ? "truncate font-medium text-foreground" : "truncate"}>
              {prettify(seg)}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Per-module search bars are used instead of a non-functional global search */}

        {/* Notifications */}
        <Link to={(roles.includes("teacher") ? "/teacher/notifications" : roles.includes("admin") ? "/admin/notifications" : "/student/notifications") as any} className="relative">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-foreground/80 hover:text-foreground">
            <Bell className="h-[18px] w-[18px]" />
          </Button>
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-secondary">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-[11px] font-semibold text-primary-foreground">
                {initials}
              </div>
              <div className="hidden text-left leading-tight sm:block">
                <p className="max-w-[140px] truncate text-xs font-semibold">
                  {profile?.full_name || profile?.email}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {roles[0] || "user"}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{profile?.full_name || "Account"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={"/dashboard" as any}><UserIcon className="mr-2 h-4 w-4" />Dashboard</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={"/change-password" as any}><KeyRound className="mr-2 h-4 w-4" />Change password</Link>
            </DropdownMenuItem>
            {roles.includes("admin") && (
              <DropdownMenuItem asChild>
                <Link to={"/admin/settings" as any}><Settings className="mr-2 h-4 w-4" />System settings</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmOpen(true); }} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => { if (!signingOut) setConfirmOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? You'll need to log in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleSignOut(); }}
              disabled={signingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {signingOut ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing out…</>) : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
