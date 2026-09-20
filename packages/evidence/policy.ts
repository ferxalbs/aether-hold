import type { EvidenceCandidate, EvidenceStatus, Verdict } from "@/packages/core";

export const EVIDENCE_POLICY_VERSION = "hold-evidence-policy-1.0.0";

export const EVIDENCE_THRESHOLDS = {
  relevance: 0.6,
  authority: 0.6,
  support: 0.6,
  contradiction: 0.6,
  highAuthority: 0.85,
  minimumIndependentDomains: 2,
} as const;

function domainOf(candidate: EvidenceCandidate): string {
  try {
    return new URL(candidate.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return candidate.source.toLowerCase();
  }
}

function isRelevant(candidate: EvidenceCandidate): boolean {
  return (candidate.relevance ?? 0) >= EVIDENCE_THRESHOLDS.relevance;
}

function isSupport(candidate: EvidenceCandidate): boolean {
  return (
    isRelevant(candidate) &&
    (candidate.supportsClaim ?? 0) >= EVIDENCE_THRESHOLDS.support &&
    (candidate.authoritativeSource ?? 0) >= EVIDENCE_THRESHOLDS.authority
  );
}

function isContradiction(candidate: EvidenceCandidate): boolean {
  return (
    isRelevant(candidate) &&
    (candidate.contradictsClaim ?? 0) >= EVIDENCE_THRESHOLDS.contradiction &&
    (candidate.authoritativeSource ?? 0) >= EVIDENCE_THRESHOLDS.authority
  );
}

function directionOf(candidate: EvidenceCandidate): "support" | "dispute" | "neutral" {
  if ((candidate.supportsClaim ?? 0) > (candidate.contradictsClaim ?? 0)) return "support";
  if ((candidate.contradictsClaim ?? 0) > (candidate.supportsClaim ?? 0)) return "dispute";
  return "neutral";
}

export function rankEvidenceCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
  const directionDomains = new Map<"support" | "dispute", Set<string>>([
    ["support", new Set()],
    ["dispute", new Set()],
  ]);
  for (const candidate of candidates) {
    const direction = directionOf(candidate);
    if (direction !== "neutral" && isRelevant(candidate)) directionDomains.get(direction)?.add(domainOf(candidate));
  }

  return [...candidates].sort((a, b) => {
    const metrics = (candidate: EvidenceCandidate) => {
      const direction = directionOf(candidate);
      return [
        candidate.relevance ?? 0,
        candidate.authoritativeSource ?? 0,
        Math.max(candidate.supportsClaim ?? 0, candidate.contradictsClaim ?? 0),
        direction === "neutral" ? 0 : (directionDomains.get(direction)?.size ?? 0),
        -candidate.originalRank,
      ];
    };
    const left = metrics(a);
    const right = metrics(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return (right[index] ?? 0) - (left[index] ?? 0);
    }
    return 0;
  });
}

export function evaluateEvidenceStatus(candidates: EvidenceCandidate[]): {
  status: EvidenceStatus;
  supportCount: number;
  disputeCount: number;
  independentDomainCount: number;
  rankedCandidates: EvidenceCandidate[];
} {
  const rankedCandidates = rankEvidenceCandidates(candidates);
  const support = rankedCandidates.filter(isSupport);
  const dispute = rankedCandidates.filter(isContradiction);
  const supportDomains = new Set(support.map(domainOf));
  const disputeDomains = new Set(dispute.map(domainOf));
  const independentDomainCount = new Set(rankedCandidates.filter(isRelevant).map(domainOf)).size;
  const hasSufficientSupport =
    supportDomains.size >= EVIDENCE_THRESHOLDS.minimumIndependentDomains ||
    support.some((candidate) => (candidate.authoritativeSource ?? 0) >= EVIDENCE_THRESHOLDS.highAuthority);
  const hasSufficientDispute =
    disputeDomains.size >= EVIDENCE_THRESHOLDS.minimumIndependentDomains ||
    dispute.some((candidate) => (candidate.authoritativeSource ?? 0) >= EVIDENCE_THRESHOLDS.highAuthority);

  let status: EvidenceStatus = "INSUFFICIENT";
  if (hasSufficientSupport && hasSufficientDispute) status = "MIXED";
  else if (hasSufficientDispute) status = "DISPUTED";
  else if (hasSufficientSupport) status = "SUPPORTED";

  return {
    status,
    supportCount: support.length,
    disputeCount: dispute.length,
    independentDomainCount,
    rankedCandidates,
  };
}

export function integrateEvidenceVerdict(verdict: Verdict, status: EvidenceStatus): Verdict {
  if (verdict === "BLOCK") return verdict;
  if (status === "DISPUTED" || status === "MIXED") return "HOLD";
  if (status === "INSUFFICIENT" || status === "UNAVAILABLE") return verdict === "SEND" ? "HOLD" : verdict;
  return verdict;
}
