import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/teacher/reports")({
  component: () => (
    <div>
      <PageHeader title="My Reports" description="Per-class attendance summary and export." />
      <Card className="shadow-[var(--shadow-card)]"><CardContent className="py-10 text-center text-muted-foreground">
        Coming soon. Use Admin → Reports for full attendance export.
      </CardContent></Card>
    </div>
  ),
});
