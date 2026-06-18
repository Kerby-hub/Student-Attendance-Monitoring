import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Audience options shown in the UI
type Audience =
  | "everyone"   // all active students + teachers
  | "students"   // all active students
  | "teachers"   // all active teachers
  | "section"    // students in a section
  | "program";   // students in a program

interface RecipientUser {
  user_id: string;
  full_name: string;
  contact_number: string | null;
  kind: "student" | "teacher";
}

function BroadcastPage() {
  const { hasRole, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const [audience, setAudience] = useState<Audience>("students");
  const [sectionId, setSectionId] = useState("");
  const [program, setProgram] = useState("");
  const [title, setTitle] = useState("");
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

  const { data: recipients = [], isFetching: loadingRecipients } = useQuery<RecipientUser[]>({
    queryKey: ["bcast-recipients", audience, sectionId, program],
    queryFn: async () => {
      const out: RecipientUser[] = [];

      const includeStudents = audience === "everyone" || audience === "students" || audience === "section" || audience === "program";
      const includeTeachers = audience === "everyone" || audience === "teachers";

      if (includeStudents) {
        let q = supabase.from("students")
          .select("full_name, contact_number, user_id, status, section_id, program")
          .eq("status", "active");
        if (audience === "section" && sectionId) q = q.eq("section_id", sectionId);
        if (audience === "program" && program) q = q.eq("program", program);
        const { data, error } = await q.limit(5000);
        if (error) throw error;
        (data ?? []).forEach((s: any) => {
          if (s.user_id) {
            out.push({ user_id: s.user_id, full_name: s.full_name, contact_number: s.contact_number, kind: "student" });
          }
        });
      }

      if (includeTeachers) {
        const { data, error } = await supabase.from("teachers")
          .select("full_name, user_id, status")
          .eq("status", "active")
          .limit(5000);
        if (error) throw error;
        (data ?? []).forEach((t: any) => {
          if (t.user_id) {
            out.push({ user_id: t.user_id, full_name: t.full_name, contact_number: null, kind: "teacher" });
          }
        });
      }

      return out;
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

  const smsRecipients = useMemo(
    () => recipients.filter((r) => r.contact_number && normalizePhMobile(r.contact_number) !== null),
    [recipients],
  );

  const send = useMutation({
    mutationFn: async () => {
      if (!message.trim()) throw new Error("Message is required.");
      if (recipients.length === 0) throw new Error("No recipients in the selected audience.");

      const notifTitle = title.trim() || "Announcement";

      const { data: bcast, error } = await (supabase as any).from("broadcasts").insert({
        sender_id: user?.id ?? null,
        audience_type: audience,
        audience_filter:
          audience === "section" ? { sectionId } :
          audience === "program" ? { program } : {},
        message,
        recipient_count: recipients.length,
      }).select("id").single();
      if (error) throw error;

      // 1) In-app notifications for ALL recipients (students + teachers)
      const notifRows = recipients.map((r) => ({
        user_id: r.user_id,
        sender_id: user?.id ?? null,
        broadcast_id: bcast.id,
        title: notifTitle,
        body: message,
        type: "announcement",
      }));
      // Chunk insert to avoid payload limits
      const chunkSize = 500;
      for (let i = 0; i < notifRows.length; i += chunkSize) {
        const { error: nErr } = await supabase.from("notifications").insert(notifRows.slice(i, i + chunkSize));
        if (nErr) throw nErr;
      }

      // 2) SMS (only to recipients with valid PH numbers — usually students)
      let sent = 0, failed = 0;
      for (const r of smsRecipients) {
        try {
          const res = await sendSmsFn({ data: { phone: r.contact_number!, message, recipientUserId: r.user_id } } as any);
          if (res?.ok) sent++; else failed++;
          await (supabase as any).from("sms_logs").update({ broadcast_id: bcast.id })
            .eq("phone", r.contact_number!).eq("message", message).is("broadcast_id", null);
        } catch { failed++; }
      }
      await (supabase as any).from("broadcasts").update({ sent_count: sent, failed_count: failed }).eq("id", bcast.id);
      return { recipients: recipients.length, sent, failed };
    },
    onSuccess: ({ recipients, sent, failed }) => {
      toast.success(`Broadcast sent to ${recipients} recipient(s). SMS: ${sent} sent, ${failed} failed.`);
      setTitle(""); setMessage("");
      qc.invalidateQueries({ queryKey: ["bcast-history"] });
      qc.invalidateQueries({ queryKey: ["sms-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <Card><CardContent className="p-6">Admin access required.</CardContent></Card>;

  const studentCount = recipients.filter((r) => r.kind === "student").length;
  const teacherCount = recipients.filter((r) => r.kind === "teacher").length;

  return (
    <div>
      <PageHeader title="Broadcast Messages" description="Send an in-app notification (and SMS where a phone is available) to a group of users." />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="space-y-4 p-4">
          <div>
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone (students + teachers)</SelectItem>
                <SelectItem value="students">All active students</SelectItem>
                <SelectItem value="teachers">All active teachers</SelectItem>
                <SelectItem value="section">Students by section</SelectItem>
                <SelectItem value="program">Students by program</SelectItem>
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
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title (optional)" />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your announcement…" />
            <p className="mt-1 text-xs text-muted-foreground">{message.length} chars · SMS will be ~{Math.ceil((message.length || 1) / 160)} segment(s)</p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-sm">
              <p className="flex items-center gap-1 font-medium"><Users className="h-4 w-4" />{loadingRecipients ? "…" : recipients.length} recipients</p>
              <p className="text-xs text-muted-foreground">
                {studentCount} student(s), {teacherCount} teacher(s) · {smsRecipients.length} with valid PH phone
              </p>
            </div>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !message.trim() || recipients.length === 0}>
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
                  <p className="mt-1 text-muted-foreground">
                    {h.recipient_count} recipient(s) · SMS {h.sent_count}/{h.sent_count + h.failed_count} sent
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
