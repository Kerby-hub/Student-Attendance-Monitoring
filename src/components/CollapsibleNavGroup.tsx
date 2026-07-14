import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

// ---------------------------------------------------------------------------
// Accordion context: only one group open at a time per sidebar.
// ---------------------------------------------------------------------------
type AccordionCtx = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};
const SidebarAccordionContext = createContext<AccordionCtx | null>(null);

export function SidebarAccordion({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [openId, setOpenIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const setOpenId = (id: string | null) => {
    setOpenIdState(id);
    try {
      if (id) window.localStorage.setItem(storageKey, id);
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  };

  return (
    <SidebarAccordionContext.Provider value={{ openId, setOpenId }}>
      {children}
    </SidebarAccordionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Group renderer. Single-child groups render as a direct link (no dropdown).
// ---------------------------------------------------------------------------
export function CollapsibleNavGroup({
  group,
  storageKey,
}: {
  group: NavGroup;
  /** Unique id used for accordion state within a sidebar. */
  storageKey: string;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const groupActive = group.items.some((i) => isItemActive(pathname, i));
  const ctx = useContext(SidebarAccordionContext);

  // Single-child group → direct clickable sidebar item, no dropdown.
  if (group.items.length === 1) {
    const item = group.items[0];
    const active = isItemActive(pathname, item);
    return (
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={group.label}
                className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-medium"
              >
                <Link to={item.url as never}>
                  <group.icon className="h-4 w-4" />
                  <span>{group.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const open = ctx ? ctx.openId === storageKey : false;

  // Auto-open the group containing the active route (only when nothing else is open).
  useEffect(() => {
    if (!ctx) return;
    if (groupActive && ctx.openId === null) {
      ctx.setOpenId(storageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupActive]);

  const toggle = () => {
    if (!ctx) return;
    ctx.setOpenId(open ? null : storageKey);
  };

  const Icon = group.icon;

  return (
    <SidebarGroup className="py-1">
      <button
        type="button"
        onClick={toggle}
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
        <SidebarMenu className="ml-3 border-l border-sidebar-border/60 pl-2 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:pl-0">
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
                  <Link to={item.url as never}>
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
