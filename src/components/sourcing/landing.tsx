"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FaultPanel } from "./composer";
import { Failure, TopProgress } from "./states";
import type { Fault } from "@/lib/llm";
import type { ErrorState } from "@/lib/session";

const EXAMPLES = [
  "RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore",
  "Senior frontend engineers who care about accessibility and design systems, remote friendly",
  "Data engineers comfortable with Spark and Airflow, ideally from scaleups",
];

export function Landing({
  busy,
  fault,
  initialQuery = "",
  error,
  onSearch,
  onFaultChange,
  onDismissError,
}: {
  busy: boolean;
  fault: Fault;
  /** Preserved across a failure: losing what they typed is its own small insult. */
  initialQuery?: string;
  error?: ErrorState | null;
  onSearch: (query: string) => void;
  onFaultChange: (f: Fault) => void;
  onDismissError?: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const ready = query.trim().length > 2;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-2xl flex-col justify-center px-5 py-16">
      {busy && <TopProgress phase="interpreting" />}
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-mint px-2.5 py-1 text-[11px] font-medium text-forest">
          <Sparkles className="size-3" /> Sourcing
        </span>
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          Describe who you are looking for.
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Write it the way you would say it out loud. We turn it into filters you can edit and a
          rubric you can argue with, then refine both from your feedback.
        </p>
      </div>

      {error && (
        <div className="mt-5">
          <Failure
            error={error}
            onRetry={() => query.trim() && onSearch(query.trim())}
            onDismiss={onDismissError}
          />
        </div>
      )}

      <div className="mt-6 space-y-2.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <Textarea
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready && !busy) onSearch(query.trim());
          }}
          placeholder="RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore"
          rows={3}
          disabled={busy}
          className="min-h-[84px] resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <FaultPanel fault={fault} onChange={onFaultChange} />
          <Button
            onClick={() => onSearch(query.trim())}
            disabled={!ready || busy}
            className="h-9 bg-lime font-semibold text-forest hover:bg-lime-deep disabled:bg-secondary disabled:text-muted-foreground"
          >
            {busy ? "Reading…" : "Search"}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Try</p>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            disabled={busy}
            onClick={() => setQuery(e)}
            className="block w-full rounded-xl border border-border bg-card/60 px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:border-forest/25 hover:bg-card hover:text-foreground disabled:opacity-50"
          >
            {e}
          </button>
        ))}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/80">
        48 profiles in this pool. Skills are matched by adjacency, so someone who lists Kubernetes
        still surfaces for Docker, and we always show you which bridge we used.
      </p>
    </div>
  );
}
