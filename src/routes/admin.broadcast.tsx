import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { sendSmsFn } from "@/lib/sms/sms.functions";
import { normalizePhMobile } from "@/lib/sms/templates";

export const Route = createFileRoute("/admin/broadcast")({
  component: BroadcastPage,
});

type Audience = "all" | "section" | "program";

function BroadcastPage() {
  const { hasRole, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const [audience, setAudience] = useState<Audience>("all");
  const [sectionId, setSectionId] = useState("");
  const [program, setProgram] = useState("");
  const [message, setMessage] = useState("");

  const { data: sections = [] } = useQuery({
    queryKey: ["bcast-sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
  const { data: programs = [] } = useQuery({
    queryKey: ["bcast-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("program").not("program", "is", null).limit(2000);
      if (error) throw error;
      return Array.from(new Set((data as { program: string }[]).map((r) => r.program).filter(Boolean))).sort();
    },
  });

  const { data: recipients = [], isFetching: loadingRecipients } = useQuery({
    queryKey: ["bcast-recipients", audience, sectionId, program],
    queryFn: async () => {
      let q = supabase.from("students").select("id, full_name, contact_number, user_id, status").eq("status", "active");
      if (audience === "section" && sectionId) q = q.eq("section_id", sectionId);
      if (audience === "program" && program) q = q.eq("program", program);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data as any[]).filter((s) => s.contact_number && s.contact_number.trim().length > 0);
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["bcast-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const validRecipients = useMemo(
    () => recipients.filter((r: any) => normalizePhMobile(r.contact_number) !== null),
    [recipients],
  );

  const send = useMutation({
    mutationFn: async () => {
      if (!message.trim()) throw new Error("Message is required.");
      if (validRecipients.length === 0) throw new Error("No valid recipients.");

      const { data: bcast, error } = await (supabase as any).from("broadcasts").insert({
        sender_id: user?.id ?? null,
        audience_type: audience,
        audience_filter: audience === "section" ? { sectionId } : audience === "program" ? { program } : {},
        message,
        recipient_count: validRecipients.length,
      }).select("id").single();
      if (error) throw error;

      let sent = 0, failed = 0;
      for (const r of validRecipients as any[]) {
        try {
          const res = await sendSmsFn({ data: { phone: r.contact_number, message, recipientUserId: r.user_id ?? null } } as any);
          if (res?.ok) sent++; else failed++;
          // tag the sms_log row with broadcast id (best-effort)
          await (supabase as any).from("sms_logs").update({ broadcast_id: bcast.id })
            .eq("phone", r.contact_number).eq("message", message).is("broadcast_id", null);
        } catch { failed++; }
      }
      await (supabase as any).from("broadcasts").update({ sent_count: sent, failed_count: failed }).eq("id", bcast.id);
      return { sent, failed };
    },
    onSuccess: ({ sent, failed }) => {
      toast.success(`Broadcast complete: ${sent} sent, ${failed} failed`);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["bcast-history"] });
      qc.invalidateQueries({ queryKey: ["sms-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <Card><CardContent className="p-6">Admin access required.</CardContent></Card>;

  return (
    <div>
      <PageHeader title="Broadcast Messages" description="Send an SMS to a group of students. Uses the configured SMS provider (stub or Semaphore)." />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="space-y-4 p-4">
          <div>
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active students</SelectItem>
                <SelectItem value="section">By section</SelectItem>
                <SelectItem value="program">By program</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === "section" && (
            <div>
              <Label>Section</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger><SelectValue placeholder="Pick a section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {audience === "program" && (
            <div>
              <Label>Program</Label>
              <Select value={program} onValueChange={setProgram}>
                <SelectTrigger><SelectValue placeholder="Pick a program" /></SelectTrigger>
                <SelectContent>
                  {programs.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Message</Label>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your announcement…" />
            <p className="mt-1 text-xs text-muted-foreground">{message.length} chars · ~{Math.ceil((message.length || 1) / 160)} SMS segment(s)</p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-sm">
              <p className="font-medium flex items-center gap-1"><Users className="h-4 w-4" />{loadingRecipients ? "…" : validRecipients.length} recipients</p>
              {recipients.length !== validRecipients.length && (
                <p className="text-xs text-muted-foreground">{recipients.length - validRecipients.length} skipped (invalid PH number)</p>
              )}
            </div>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !message.trim() || validRecipients.length === 0}>
              <Send className="mr-1.5 h-4 w-4" />{send.isPending ? "Sending…" : "Send Broadcast"}
            </Button>
          </div>
        </CardContent></Card>

        <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Recent broadcasts</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                    <Badge variant="outline">{h.audience_type}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2">{h.message}</p>
                  <p className="mt-1 text-muted-foreground">{h.sent_count}/{h.recipient_count} sent · {h.failed_count} failed</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
