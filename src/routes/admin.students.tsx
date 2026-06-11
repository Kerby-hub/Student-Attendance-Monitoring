import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/students")({
  component: () => (
    <div>
      <PageHeader title="Students" description="Student management — Phase 2." />
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Student Management module ships in the next phase.
        </CardContent>
      </Card>
    </div>
  ),
});
