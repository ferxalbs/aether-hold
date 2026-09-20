"use client";

import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
  PencilEdit02Icon,
  RotateLeft01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type EvaluationResponse, type EvidenceResponse, REASON_SIGNAL_MAP, type Verdict } from "@/packages/core";
import { DecisionReceipt, formatCost } from "./decision-receipt";
import { downloadShareCard, type ShareCardOptions } from "./share-card";
import { SignalList } from "./signal-list";

interface VerdictPanelProps {
  result: EvaluationResponse;
  onEditDraft: () => void;
  onJudgeAnother: () => void;
  onVerifyEvidence: () => void;
  evidenceLoading: boolean;
  evidence: EvidenceResponse | null;
}

const verdictConfig: Record<
  Verdict,
  {
    title: string;
    description: string;
    icon: typeof CheckmarkCircle02Icon;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    colorClass: string;
    bgClass: string;
    borderClass: string;
    iconColor: string;
  }
> = {
  SEND: {
    title: "Ready to send",
    description: "The draft clears all safety and communication thresholds.",
    icon: CheckmarkCircle02Icon,
    badgeVariant: "outline",
    colorClass: "text-emerald-800 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-700/25",
    iconColor: "text-emerald-700 dark:text-emerald-400",
  },
  REWRITE: {
    title: "Rewrite before sending",
    description: "Meaningful writing or fit problems detected in the draft.",
    icon: PencilEdit02Icon,
    badgeVariant: "outline",
    colorClass: "text-amber-800 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-700/25",
    iconColor: "text-amber-700 dark:text-amber-400",
  },
  HOLD: {
    title: "Hold for human check",
    description: "Uncertain claims or low model confidence detected. Check before sending.",
    icon: Alert02Icon,
    badgeVariant: "outline",
    colorClass: "text-orange-800 dark:text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-700/25",
    iconColor: "text-orange-700 dark:text-orange-400",
  },
  BLOCK: {
    title: "Do not send",
    description: "The draft crosses a serious policy, credential, or hostility threshold.",
    icon: CancelCircleIcon,
    badgeVariant: "destructive",
    colorClass: "text-rose-800 dark:text-rose-400",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-700/25",
    iconColor: "text-rose-700 dark:text-rose-400",
  },
};

export function VerdictPanel({
  result,
  onEditDraft,
  onJudgeAnother,
  onVerifyEvidence,
  evidenceLoading,
  evidence,
}: VerdictPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const config = verdictConfig[result.verdict];
  const evidenceHold = ["DISPUTED", "MIXED", "INSUFFICIENT", "UNAVAILABLE"].includes(result.evidenceStatus);

  async function handleCopy() {
    const triggeredSignals = result.reasons
      .map((reason) => {
        const signalId = REASON_SIGNAL_MAP[reason];
        if (!signalId) return `${reason}: no direct signal`;
        const signal = result.signals.find((candidate) => candidate.id === signalId);
        return signal ? `${signal.label} (${signal.displayValue})` : `${signalId}: unavailable`;
      })
      .join(", ");
    const text = [
      `HOLD verdict: ${result.verdict}`,
      config.description,
      result.reasonLabels.length > 0
        ? `Triggered reasons: ${result.reasonLabels.join(", ")}`
        : "No thresholds triggered.",
      ...(triggeredSignals ? [`Triggered signals: ${triggeredSignals}`] : []),
      ...(result.evidenceStatus !== "NOT_NEEDED" ? [`Evidence status: ${result.evidenceStatus}`] : []),
      `${result.latencyMs} ms · ${formatCost(result.estimatedCostUsd)} · ${result.policyVersion}`,
      "Powered by TypeSafe Jev",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Verdict copied to clipboard");
    } catch {
      toast.error("Could not access clipboard");
    }
  }

  async function handleDownload(options: ShareCardOptions = {}) {
    setIsDownloading(true);
    try {
      await downloadShareCard(result, { evidence, ...options });
      toast.success("Verdict card downloaded");
    } catch {
      toast.error("Could not download verdict card");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        HOLD verdict: {result.verdict}.
      </div>
      <Card
        data-verdict={result.verdict}
        className={`relative overflow-hidden border-2 ${config.borderClass} shadow-md transition-all animate-in fade-in-50 duration-300`}
      >
        {/* Top ambient color strip */}
        <div className={`h-1.5 w-full ${config.bgClass.replace("/10", "/80")}`} />

        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                HOLD Judgment
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                Experimental policy
              </Badge>
              {result.providerMode === "fake" && (
                <Badge
                  data-testid="development-simulation"
                  variant="secondary"
                  className="text-[10px] h-4 px-1.5 font-normal"
                >
                  Development simulation
                </Badge>
              )}
              {evidence && (
                <Badge variant="outline" className="text-[10px]">
                  Evidence: {evidence.status}
                </Badge>
              )}
            </div>
            <Badge
              variant={config.badgeVariant}
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 ${config.bgClass} ${config.colorClass} border-transparent`}
            >
              {config.title}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Verdict</span>
              <CardTitle className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                <h2 className={`inline ${config.colorClass}`}>{result.verdict}</h2>
              </CardTitle>
            </div>
            <div className={`p-3 rounded-2xl ${config.bgClass} ${config.iconColor}`}>
              <HugeiconsIcon icon={config.icon} strokeWidth={2.5} className="size-8 sm:size-9" />
            </div>
          </div>

          <CardDescription className="text-sm font-normal text-foreground/80 leading-relaxed pt-1">
            {config.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Why this verdict */}
          <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 border border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Why this verdict
            </span>
            {result.reasonLabels.length > 0 || evidenceHold ? (
              <div className="flex flex-wrap gap-1.5">
                {result.reasonLabels.map((reason) => (
                  <Badge
                    key={reason}
                    variant="secondary"
                    className="text-xs font-medium px-2 py-0.5 bg-background text-foreground border border-border/60"
                  >
                    {reason}
                  </Badge>
                ))}
                {evidenceHold && (
                  <Badge
                    variant="secondary"
                    className="text-xs font-medium px-2 py-0.5 bg-background text-foreground border border-border/60"
                  >
                    Evidence status: {result.evidenceStatus}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-400">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 shrink-0" />
                <span>No threshold was triggered.</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Signals */}
          <SignalList signals={result.signals} reasons={result.reasons} verdict={result.verdict} />

          <Separator />

          {/* Decision receipt */}
          <DecisionReceipt
            latencyMs={result.latencyMs}
            estimatedCostUsd={result.estimatedCostUsd}
            model={result.model}
            usage={result.usage}
            policyVersion={result.policyVersion}
            questionPackVersion={result.questionPackVersion}
          />
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2 pt-2 border-t border-border/50 bg-muted/20">
          <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 text-xs">
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
            Copy verdict
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloading}
            onClick={() => handleDownload()}
            className="h-8 text-xs"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
            Download card
          </Button>
          {evidence?.claim && (
            <Button
              variant="outline"
              size="sm"
              disabled={isDownloading}
              onClick={() => handleDownload({ includeClaim: true })}
              className="h-8 text-xs"
            >
              Include selected claim
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={evidenceLoading}
            onClick={onVerifyEvidence}
            className="h-8 text-xs"
          >
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
            {evidenceLoading ? "Checking evidence…" : "Verify claims"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditDraft} className="h-8 text-xs">
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
            Edit draft
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onJudgeAnother}
            className="h-8 text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
            Judge another
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
