import { useState } from "react";
import { Copy, Check, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function generateTempPassword(): string {
  // 12 chars: ensure upper, lower, digit, symbol
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const L = "abcdefghijkmnopqrstuvwxyz";
  const D = "23456789";
  const S = "!@#$%^&*";
  const all = U + L + D + S;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(U), pick(L), pick(D), pick(S)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

export function TempPasswordDialog({
  open, onClose, email, password, emailStatus, emailError,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  password: string;
  emailStatus?: "sent" | "failed" | "stubbed";
  emailError?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Password copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };
  const sent = emailStatus === "sent";
  const failed = emailStatus === "failed";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account created successfully</DialogTitle>
          <DialogDescription>
            {sent
              ? "The login credentials have been sent to the user's registered email address."
              : failed
                ? "The account was created, but the credentials email could not be sent. Please check the Email Logs or resend the credentials."
                : "The account was created. Credentials will be delivered to the user's email when email sending is enabled."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {sent && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>Credentials email delivered to <span className="font-medium">{email}</span>.</p>
            </div>
          )}
          {failed && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p>Email delivery failed{emailError ? `: ${emailError}` : ""}. Use the fallback password below.</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input readOnly value={email} className="font-mono text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Temporary password {sent ? "(fallback only)" : ""}
            </label>
            <div className="flex gap-2">
              <Input readOnly value={password} className="font-mono text-sm" />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {sent
                ? "Shown for fallback only. Credentials were also sent to the user's registered email address."
                : "This password will not be shown again. The user must change it on first login."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
