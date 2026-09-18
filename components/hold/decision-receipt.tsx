import { Badge } from "@/components/ui/badge";
import type { ProviderUsage } from "@/packages/core";

interface DecisionReceiptProps {
  latencyMs: number;
  estimatedCostUsd: number | null;
  model: string;
  usage: ProviderUsage | null;
  policyVersion: string;
  questionPackVersion: string;
}

export function formatCost(value: number | null): string {
  if (value === null) return "Not available";
  if (value === 0) return "$0.00 est.";
  return `$${value.toFixed(4)} est.`;
}

export function DecisionReceipt({
  latencyMs,
  estimatedCostUsd,
  model,
  usage,
  policyVersion,
  questionPackVersion,
}: DecisionReceiptProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/50">
        <span className="font-semibold text-foreground tracking-tight">Decision receipt</span>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-background/60">
          1 Jev request
        </Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-muted-foreground">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Latency</span>
          <span className="font-medium text-foreground tabular-nums">{latencyMs} ms</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Estimated cost</span>
          <span className="font-medium text-foreground tabular-nums">{formatCost(estimatedCostUsd)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Model</span>
          <span className="font-medium text-foreground truncate block" title={model}>
            {model}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Usage</span>
          <span className="font-medium text-foreground tabular-nums" title="Input and output tokens">
            {usage
              ? `${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out`
              : "Not available"}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Policy / Pack</span>
          <span
            className="font-medium text-foreground truncate block"
            title={`${policyVersion} · ${questionPackVersion}`}
          >
            {policyVersion.replace("hold-policy-", "v")}
          </span>
        </div>
      </div>
    </div>
  );
}
