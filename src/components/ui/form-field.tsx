import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Red asterisk for required field labels. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("ml-0.5 text-destructive", className)}
      title="Required"
    >
      *
    </span>
  );
}

/** Inline field error message. Renders nothing when empty. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

/** Convenience wrapper if a form wants `<RequiredLabel>Name</RequiredLabel>`. */
export function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RequiredMark />
    </>
  );
}

/** Utility tailwind class to mark an invalid input with a red border. */
export const invalidInputClass =
  "border-destructive focus-visible:ring-destructive/40";
