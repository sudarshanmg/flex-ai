"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SKILL_TIERS, type Filters, type SkillTier } from "@/lib/schema";
import type { FilterResult } from "@/lib/filter";
import { Funnel } from "./funnel";
import { TIER_META } from "./tier";

/* An editable chip. Everything the model inferred can be removed by hand, which
 * is what turns its guesses into proposals the recruiter audits. */
function Chip({
  children,
  onRemove,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        "bg-card border-border text-foreground",
        className,
      )}
    >
      {children}
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${typeof children === "string" ? children : "value"}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function AddChip({ onAdd, label, disabled }: { onAdd: (v: string) => void; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (disabled) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-forest/40 hover:text-foreground"
      >
        <Plus className="size-3" />
        {label}
      </button>
    );
  }

  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setOpen(false);
  };

  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setValue(""); setOpen(false); }
      }}
      className="h-7 w-32 rounded-full px-3 text-xs"
      placeholder={label}
    />
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {count && <span className="tnum text-[11px] text-muted-foreground">{count}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function FilterPanel({
  filters,
  result,
  readOnly = false,
  onChange,
}: {
  filters: Filters;
  result: FilterResult | null;
  readOnly?: boolean;
  onChange: (next: Filters) => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const editSkill = (index: number, patch: Partial<Filters["skillRequirements"][number]>) => {
    const next = filters.skillRequirements.map((r, i) => (i === index ? { ...r, ...patch } : r));
    set({ skillRequirements: next });
  };

  return (
    <div className="space-y-5">
      {result && <Funnel total={result.total} steps={result.funnel} />}

      {result && <Separator />}

      {/* ── Skills, expanded by tier ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Skills</span>
          {!readOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2">
                  how matching works
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-xs leading-relaxed">
                Each skill is expanded into three tiers. Remove any term you disagree with and the
                match count updates instantly, with no model call.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {filters.skillRequirements.length === 0 && (
          <p className="text-xs text-muted-foreground">No skill requirements.</p>
        )}

        {filters.skillRequirements.map((req, i) => (
          <div key={`${req.canonical}-${i}`} className="rounded-xl border border-border bg-card/60 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{req.canonical}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => editSkill(i, { required: !req.required })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                    req.required
                      ? "border-forest/20 bg-forest text-primary-foreground"
                      : "border-border bg-secondary text-muted-foreground",
                    readOnly && "pointer-events-none",
                  )}
                >
                  {req.required ? "Required" : "Bonus"}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      set({ skillRequirements: filters.skillRequirements.filter((_, x) => x !== i) })
                    }
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${req.canonical}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {SKILL_TIERS.map((tier) => {
                const values = req[tier];
                const meta = TIER_META[tier];
                const dimmed = SKILL_TIERS.indexOf(tier) > SKILL_TIERS.indexOf(filters.acceptedTier);
                return (
                  <div key={tier} className={cn("flex items-start gap-2", dimmed && "opacity-40")}>
                    <span className="mt-1.5 w-20 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    <div className="flex flex-1 flex-wrap items-center gap-1">
                      {values.length === 0 && (
                        <span className="py-1 text-[11px] text-muted-foreground/70">none</span>
                      )}
                      {values.map((v) => (
                        <Chip
                          key={v}
                          className={cn("text-[11px]", meta.chip)}
                          disabled={readOnly}
                          onRemove={() => editSkill(i, { [tier]: values.filter((x) => x !== v) })}
                        >
                          {v}
                        </Chip>
                      ))}
                      <AddChip
                        disabled={readOnly}
                        label="add"
                        onAdd={(v) => editSkill(i, { [tier]: [...values, v] })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Looseness is opt-in, and the cost of each step is shown as a count. */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Accept matches up to
          </span>
          <ToggleGroup
            type="single"
            value={filters.acceptedTier}
            onValueChange={(v) => v && !readOnly && set({ acceptedTier: v as SkillTier })}
            className="w-full"
            disabled={readOnly}
          >
            {SKILL_TIERS.map((tier) => (
              <ToggleGroupItem key={tier} value={tier} className="flex-1 text-xs data-[state=on]:bg-forest data-[state=on]:text-primary-foreground">
                {TIER_META[tier].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <Separator />

      {/* ── Objective fields ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <Field label="Experience">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={filters.yearsMin ?? ""}
              placeholder="any"
              disabled={readOnly}
              onChange={(e) => set({ yearsMin: e.target.value === "" ? null : Number(e.target.value) })}
              className="tnum h-8 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="number"
              min={0}
              value={filters.yearsMax ?? ""}
              placeholder="any"
              disabled={readOnly}
              onChange={(e) => set({ yearsMax: e.target.value === "" ? null : Number(e.target.value) })}
              className="tnum h-8 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">years</span>
          </div>
        </Field>

        <Field label="Location">
          {filters.locations.map((l) => (
            <Chip key={l} disabled={readOnly} onRemove={() => set({ locations: filters.locations.filter((x) => x !== l) })}>
              {l}
            </Chip>
          ))}
          <AddChip disabled={readOnly} label="add location" onAdd={(v) => set({ locations: [...filters.locations, v] })} />
        </Field>

        <Field label="Company type">
          {filters.companyTypes.map((c) => (
            <Chip key={c} disabled={readOnly} onRemove={() => set({ companyTypes: filters.companyTypes.filter((x) => x !== c) })}>
              {c}
            </Chip>
          ))}
          <AddChip disabled={readOnly} label="add type" onAdd={(v) => set({ companyTypes: [...filters.companyTypes, v] })} />
        </Field>

        <Field label="Title contains">
          {filters.titleKeywords.length === 0 && (
            <span className="text-[11px] text-muted-foreground/70">any title</span>
          )}
          {filters.titleKeywords.map((t) => (
            <Chip key={t} disabled={readOnly} onRemove={() => set({ titleKeywords: filters.titleKeywords.filter((x) => x !== t) })}>
              {t}
            </Chip>
          ))}
          <AddChip disabled={readOnly} label="add word" onAdd={(v) => set({ titleKeywords: [...filters.titleKeywords, v] })} />
        </Field>
      </div>
    </div>
  );
}
