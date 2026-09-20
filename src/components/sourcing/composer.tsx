"use client";

import { Bug, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FAULTS, type Fault } from "@/lib/llm";

const FAULT_LABEL: Record<Fault, string> = {
  none: "No fault",
  rate_limit: "Rate limit (429)",
  timeout: "Timeout",
  malformed: "Malformed JSON",
  server: "Provider 503",
  auth: "Bad API key",
};

/**
 * Development-only. Rate limits and malformed responses are real, but they
 * arrive on their own schedule, which is never the moment you need to show
 * that they are handled. This forces each path deliberately.
 */
export function FaultPanel({ fault, onChange }: { fault: Fault; onChange: (f: Fault) => void }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="flex items-center gap-2">
      <Bug className={cn("size-3.5 shrink-0", fault === "none" ? "text-muted-foreground/50" : "text-destructive")} />
      <Select value={fault} onValueChange={(v) => onChange(v as Fault)}>
        <SelectTrigger
          size="sm"
          className={cn(
            "h-7 w-[150px] border-dashed text-[11px]",
            fault !== "none" && "border-destructive/40 text-destructive",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FAULTS.map((f) => (
            <SelectItem key={f} value={f} className="text-xs">
              {FAULT_LABEL[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function Composer({
  note,
  verdictCount,
  busy,
  canFreeze,
  fault,
  onNoteChange,
  onRefine,
  onFreeze,
  onFaultChange,
}: {
  note: string;
  verdictCount: number;
  busy: boolean;
  canFreeze: boolean;
  fault: Fault;
  onNoteChange: (v: string) => void;
  onRefine: () => void;
  onFreeze: () => void;
  onFaultChange: (f: Fault) => void;
}) {
  const ready = verdictCount > 0 || note.trim().length > 0;

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <Textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready && !busy) onRefine();
        }}
        placeholder="Mark profiles above, or say what is wrong: “the first one is too junior, 2 and 4 are right”"
        rows={2}
        disabled={busy}
        className="min-h-[58px] resize-none border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex items-center gap-3">
          <FaultPanel fault={fault} onChange={onFaultChange} />
          {verdictCount > 0 && (
            <span className="tnum text-[11px] text-muted-foreground">{verdictCount} marked</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onFreeze}
            disabled={!canFreeze || busy}
            className="h-8 text-xs text-muted-foreground hover:text-forest"
          >
            <Lock className="size-3.5" /> Freeze search
          </Button>
          <Button
            size="sm"
            onClick={onRefine}
            disabled={!ready || busy}
            className="h-8 bg-lime text-xs font-semibold text-forest hover:bg-lime-deep disabled:bg-secondary disabled:text-muted-foreground"
          >
            <Send className="size-3.5" />
            {busy ? "Refining…" : "Refine search"}
          </Button>
        </div>
      </div>
    </div>
  );
}
