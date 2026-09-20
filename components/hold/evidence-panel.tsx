"use client";

import { Alert02Icon, ArrowUpRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvidenceCandidate, EvidenceResponse } from "@/packages/core";
import { formatCost } from "./decision-receipt";

const labels: Record<EvidenceResponse["status"], string> = {
  NOT_NEEDED: "No evidence needed",
  SUPPORTED: "Evidence supports the claim",
  DISPUTED: "Evidence disputes the claim",
  MIXED: "Evidence is mixed",
  INSUFFICIENT: "Evidence is insufficient",
  UNAVAILABLE: "Evidence unavailable",
};

function direction(candidate: EvidenceCandidate): "support" | "dispute" | "neutral" {
  if ((candidate.supportsClaim ?? 0) > (candidate.contradictsClaim ?? 0)) return "support";
  if ((candidate.contradictsClaim ?? 0) > (candidate.supportsClaim ?? 0)) return "dispute";
  return "neutral";
}

export function EvidencePanel({ result }: { result: EvidenceResponse }) {
  if (result.status === "NOT_NEEDED" && !result.claim) return null;
  const visible = result.candidates.slice(0, 3);
  const requestLabel = result.receipt.provider.startsWith("fake") ? "simulated request" : "Jev request";
  return (
    <Card className="border border-border/80 shadow-sm" aria-live="polite">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
            <CardTitle className="text-lg">Evidence</CardTitle>
          </div>
          <Badge variant={result.status === "DISPUTED" || result.status === "MIXED" ? "destructive" : "secondary"}>
            {labels[result.status]}
          </Badge>
        </div>
        <CardDescription>Retrieved sources are inspectable evidence, not a claim of factual truth.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {result.claim && (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected claim</div>
            <p className="mt-1 break-words text-sm leading-relaxed text-foreground">{result.claim.text}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md bg-muted/40 p-2">
            <strong className="block text-base">{result.supportCount}</strong>support
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <strong className="block text-base">{result.disputeCount}</strong>dispute
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <strong className="block text-base">{result.independentDomainCount}</strong>domains
          </div>
        </div>

        {result.partialFailure && (
          <Alert variant="default">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />
            <AlertDescription>
              Some search lanes failed. This result is partial and should be reviewed carefully.
            </AlertDescription>
          </Alert>
        )}

        {visible.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Top inspectable sources
            </div>
            {visible.map((candidate) => {
              const evidenceDirection = direction(candidate);
              return (
                <article key={candidate.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-sm font-semibold underline underline-offset-2 hover:text-muted-foreground"
                    >
                      {candidate.title}
                      <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="ml-1 inline size-3" />
                    </a>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {evidenceDirection}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {candidate.source}
                    {candidate.publishedDate ? ` · ${candidate.publishedDate}` : ""}
                  </p>
                  <p className="mt-2 break-words text-xs leading-relaxed text-foreground/80">{candidate.snippet}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Relevance {Math.round((candidate.relevance ?? 0) * 100)}% · authority{" "}
                    {Math.round((candidate.authoritativeSource ?? 0) * 100)}% · support{" "}
                    {Math.round((candidate.supportsClaim ?? 0) * 100)}% · dispute{" "}
                    {Math.round((candidate.contradictsClaim ?? 0) * 100)}%
                  </p>
                </article>
              );
            })}
            {result.candidates.length > visible.length && (
              <details className="rounded-md border border-border/70 p-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  View all sources ({result.candidates.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {result.candidates.slice(3).map((candidate) => (
                    <li key={candidate.id}>
                      <a className="break-all text-xs underline" href={candidate.url} target="_blank" rel="noreferrer">
                        {candidate.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No trustworthy source candidates were available.</p>
        )}

        <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Why this status?</strong>{" "}
          {result.status === "SUPPORTED"
            ? "Relevant authoritative sources support the claim without material contradiction."
            : result.status === "DISPUTED"
              ? "Relevant authoritative sources materially contradict the claim."
              : result.status === "MIXED"
                ? "Meaningful support and contradiction both appear across independent sources."
                : "The retrieved sources were too weak, incomplete, or unavailable to support a trustworthy conclusion."}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span>{result.receipt.latencyMs} ms</span>
          <span>{formatCost(result.receipt.estimatedCostUsd)}</span>
          <span>{result.receipt.model ?? "no model"}</span>
          <span>
            {result.receipt.requestCount} {requestLabel}
            {result.receipt.requestCount === 1 ? "" : "s"}
          </span>
          <span>{result.policyVersion}</span>
        </div>
      </CardContent>
    </Card>
  );
}
