import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, MessageSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/admin/notifications")({
  component: NotificationsPage,
});

type Log = {
  id: string;
  recipient_user_id: string | null;
  phone: string;
  message: string;
  status: string;
  provider_response: any;
  broadcast_id: string | null;
  created_at: string;
};

const PAGE = 25;

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "sent") return "default";
  if (s === "failed") return "destructive";
  if (s === "stubbed") return "secondary";
  return "outline";
}

function NotificationsPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const today = new Date().toISOString().slice(0, 10);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [phone, setPhone] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sms-logs", from, to, status, phone, page],
    queryFn: async () => {
      let q = (supabase as any).from("sms_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      if (status !== "all") q = q.eq("status", status);
      if (phone) q = q.ilike("phone", `%${phone}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as Log[], count: count ?? 0 };
    },
  });

  const retry = useMutation({
    mutationFn: async (log: Log) => {
      const { sendSmsFn } = await import("@/lib/sms/sms.functions");
      const res = await sendSmsFn({ data: { phone: log.phone, message: log.message, recipientUserId: log.recipient_user_id } } as any);
      return res;
    },
    onSuccess: (r: any) => {
      toast.success(`Retried: ${r?.status ?? "queued"}`);
      qc.invalidateQueries({ queryKey: ["sms-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const summary = useMemo(() => {
    const c = { sent: 0, failed: 0, stubbed: 0 };
    for (const r of rows) c[r.status as keyof typeof c] = (c[r.status as keyof typeof c] ?? 0) + 1;
    return c;
  }, [rows]);

  if (!isAdmin) {
    return <Card><CardContent className="p-6">Admin access required.</CardContent></Card>;
  }

  return (
    <div>
      <PageHeader
        title="Notification Logs"
        description="Every SMS attempt is recorded here. Filter, retry failed sends, and audit delivery."
      />

      <Card className="mb-4 shadow-[var(--shadow-card)]"><CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} max={today} /></div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="stubbed">Stubbed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label>Phone contains</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={phone} onChange={(e) => { setPhone(e.target.value); setPage(0); }} placeholder="+639…" />
            </div>
          </div>
        </div>
      </CardContent></Card>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{isLoading ? "Loading…" : `${total} total`}</span>
        <Badge>{summary.sent} sent</Badge>
        <Badge variant="destructive">{summary.failed} failed</Badge>
        <Badge variant="secondary">{summary.stubbed} stubbed</Badge>
      </div>

      {error ? <Card className="mb-3"><CardContent className="p-3 text-sm text-destructive">{(error as Error).message}</CardContent></Card> : null}

      <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead><TableHead>Phone</TableHead>
              <TableHead>Message</TableHead><TableHead>Status</TableHead>
              <TableHead>Source</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />No SMS logs match the filter.
              </TableCell></TableRow>
            ) : rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-sm">{l.phone}</TableCell>
                <TableCell className="max-w-[420px] text-sm"><span className="line-clamp-2">{l.message}</span></TableCell>
                <TableCell><Badge variant={statusVariant(l.status)}>{l.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.broadcast_id ? "Broadcast" : "Auto"}</TableCell>
                <TableCell className="text-right">
                  {l.status === "failed" && (
                    <Button size="sm" variant="ghost" onClick={() => retry.mutate(l)} disabled={retry.isPending}>
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />Retry
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Next</Button>
        </div>
      </div>
    </div>
  );
}
