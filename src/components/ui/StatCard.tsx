import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "info" | "neutral";

const TONES: Record<Tone, { icon: string; ring: string }> = {
  primary:     { icon: "bg-primary/10 text-primary",         ring: "ring-primary/10" },
  success:     { icon: "bg-success/10 text-success",         ring: "ring-success/10" },
  warning:     { icon: "bg-warning/15 text-warning-foreground", ring: "ring-warning/15" },
  destructive: { icon: "bg-destructive/10 text-destructive", ring: "ring-destructive/10" },
  info:        { icon: "bg-info/10 text-info",               ring: "ring-info/10" },
  neutral:     { icon: "bg-secondary text-foreground/70",    ring: "ring-border" },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;          // percentage change
  tone?: Tone;
}) {
  const t = TONES[tone];
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="group rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-4", t.icon, t.ring)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {typeof delta === "number" && (
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium">
          <span className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
            positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs last period</span>
        </div>
      )}
    </div>
  );
}
