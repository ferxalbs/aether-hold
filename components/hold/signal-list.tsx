"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  type NormalizedSignal,
  REASON_SIGNAL_MAP,
  type ReasonCode,
  SIGNAL_METADATA,
  type Verdict,
} from "@/packages/core";

interface SignalListProps {
  signals: NormalizedSignal[];
  reasons: ReasonCode[];
  verdict: Verdict;
}

const signalOrder = [
  "clarity",
  "recipientValue",
  "tone",
  "perceivedIntent",
  "spamRisk",
  "needsVerification",
  "containsCheckableClaim",
  "claimConsequence",
  "secretExposure",
  "hostility",
  "addressesRequest",
  "intentAlignment",
];

export function SignalList({ signals, reasons, verdict }: SignalListProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Identify signals that directly match triggered reasons
  const reasonKeys = new Set(
    reasons.map((reason) => REASON_SIGNAL_MAP[reason]).filter((signalId) => signalId !== null),
  );

  const prioritized = [...signals].sort((a, b) => {
    const aTriggered = reasonKeys.has(a.id);
    const bTriggered = reasonKeys.has(b.id);
    if (aTriggered && !bTriggered) return -1;
    if (!aTriggered && bTriggered) return 1;

    // Next, check default visual order index
    const aIndex = signalOrder.indexOf(a.id);
    const bIndex = signalOrder.indexOf(b.id);
    const aWeight = aIndex === -1 ? 99 : aIndex;
    const bWeight = bIndex === -1 ? 99 : bIndex;
    return aWeight - bWeight;
  });

  const primarySignals = prioritized.slice(0, 4);
  const remainingSignals = prioritized.slice(4);

  // Verdict accent class for progress bar
  const indicatorColor = {
    SEND: "[&_[data-slot=progress-indicator]]:bg-emerald-700 dark:[&_[data-slot=progress-indicator]]:bg-emerald-500",
    REWRITE: "[&_[data-slot=progress-indicator]]:bg-amber-600 dark:[&_[data-slot=progress-indicator]]:bg-amber-500",
    HOLD: "[&_[data-slot=progress-indicator]]:bg-orange-600 dark:[&_[data-slot=progress-indicator]]:bg-orange-500",
    BLOCK: "[&_[data-slot=progress-indicator]]:bg-rose-700 dark:[&_[data-slot=progress-indicator]]:bg-rose-600",
  }[verdict];

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key signals</span>
        <span className="text-[11px] text-muted-foreground">Calibrated System One scores</span>
      </div>

      <div className="flex flex-col gap-3">
        {primarySignals.map((signal) => {
          const isTriggered = reasonKeys.has(signal.id);
          const percentage = Math.round(signal.value * 100);

          return (
            <div key={signal.id} className="flex flex-col gap-1.5 group">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={isTriggered ? "font-semibold text-foreground" : "text-foreground/90 font-medium"}>
                    {signal.label}
                  </span>
                  {isTriggered && (
                    <span
                      className="inline-block size-1.5 rounded-full bg-amber-500"
                      title="Triggered policy threshold"
                    />
                  )}
                </div>
                <span className="font-semibold tabular-nums text-foreground">{signal.displayValue}</span>
              </div>
              {signal.direction === "categorical" ? (
                <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {SIGNAL_METADATA[signal.id].informational ? "Informational · " : ""}Categorical signal · confidence{" "}
                  {percentage}%
                </div>
              ) : (
                <>
                  <Progress
                    value={percentage}
                    className={`w-full ${indicatorColor}`}
                    aria-label={`${signal.label} ${signal.direction === "higher-is-risk" ? "risk" : "quality"}`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {signal.direction === "higher-is-risk" ? "Higher means more risk" : "Higher means stronger fit"}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {remainingSignals.length > 0 && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="pt-1">
          <CollapsibleTrigger className="w-full flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors cursor-pointer h-8">
            <span>{isOpen ? "Hide remaining signals" : `All signals (${signals.length})`}</span>
            <HugeiconsIcon icon={isOpen ? ChevronUpIcon : ChevronDownIcon} strokeWidth={2} className="size-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 pt-2">
            {remainingSignals.map((signal) => {
              const percentage = Math.round(signal.value * 100);

              return (
                <div key={signal.id} className="flex flex-col gap-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">{signal.label}</span>
                    <span className="font-medium tabular-nums text-muted-foreground">{signal.displayValue}</span>
                  </div>
                  {signal.direction === "categorical" ? (
                    <div className="text-[10px] text-muted-foreground">
                      {SIGNAL_METADATA[signal.id].informational ? "Informational · " : ""}Categorical · confidence{" "}
                      {percentage}%
                    </div>
                  ) : (
                    <>
                      <Progress
                        value={percentage}
                        className="w-full [&_[data-slot=progress-indicator]]:bg-muted-foreground/40"
                        aria-label={`${signal.label} ${signal.direction === "higher-is-risk" ? "risk" : "quality"}`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {signal.direction === "higher-is-risk" ? "Higher means more risk" : "Higher means stronger fit"}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
