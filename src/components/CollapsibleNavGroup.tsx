import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type NavItem = { title: string; url: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

function isItemActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.url;
  return pathname === item.url || pathname.startsWith(item.url + "/");
}

export function CollapsibleNavGroup({
  group, storageKey,
}: {
  group: NavGroup;
  /** localStorage key (per-role + group label) so open state persists across reloads */
  storageKey: string;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const groupActive = group.items.some((i) => isItemActive(pathname, i));

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return groupActive;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "true") return true;
      if (v === "false") return false;
    } catch { /* noop */ }
    return groupActive;
  });

  // Auto-open the group containing the active route.
  useEffect(() => {
    if (groupActive && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupActive]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(open)); } catch { /* noop */ }
  }, [open, storageKey]);

  const Icon = group.icon;

  return (
    <SidebarGroup className="py-1">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-controls={`navgroup-${storageKey}`}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
          "hover:bg-sidebar-accent/40",
          groupActive ? "text-primary" : "text-sidebar-foreground/60",
          "group-data-[collapsible=icon]:hidden",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
        />
      </button>

      <SidebarGroupContent
        id={`navgroup-${storageKey}`}
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-200",
          open ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0",
          // Always show items when sidebar is in icon-collapsed mode
          "group-data-[collapsible=icon]:!max-h-none group-data-[collapsible=icon]:!opacity-100",
        )}
      >
        <SidebarMenu>
          {group.items.map((item) => {
            const active = isItemActive(pathname, item);
            return (
              <SidebarMenuItem key={`${group.label}-${item.title}`}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-medium"
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
}
