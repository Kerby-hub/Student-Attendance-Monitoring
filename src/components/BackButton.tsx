import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Professional back button. Uses browser history when safe,
 * falls back to the provided `fallbackTo` route otherwise.
 */
export function BackButton({
  fallbackTo = "/",
  label = "Back",
  className,
}: {
  fallbackTo?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.history.back();
        } else {
          router.navigate({ to: fallbackTo as never });
        }
      }}
    >
      <ArrowLeft className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}
