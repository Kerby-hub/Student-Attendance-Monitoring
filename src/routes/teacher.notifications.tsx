import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/teacher/notifications")({
  component: TeacherNotificationsPage,
});

function TeacherNotificationsPage() {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["teacher-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div>
      <PageHeader title="Notifications" />
      {data.length === 0 ? (
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="py-10 text-center text-muted-foreground">
          <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />No notifications yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((n) => (
            <Card key={n.id} className="shadow-[var(--shadow-card)]"><CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div><p className="font-semibold">{n.title}</p><p className="text-sm text-muted-foreground">{n.body}</p></div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
