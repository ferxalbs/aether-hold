import {
  type EvaluationResponse,
  type EvidenceResponse,
  type NormalizedSignal,
  REASON_SIGNAL_MAP,
  SIGNAL_METADATA,
  type Verdict,
} from "@/packages/core";
import { formatCost } from "./decision-receipt";

export type ShareCardOptions = {
  evidence?: EvidenceResponse | null;
  includeClaim?: boolean;
};

const outcomeMessages: Record<Verdict, string> = {
  SEND: "The draft clears all safety and quality thresholds. Ready to send.",
  REWRITE: "Writing or tone problems detected. Consider revising before sending.",
  HOLD: "Uncertain claims or low confidence detected. Needs human check.",
  BLOCK: "Severe violation detected (credentials, hostility, or safety). Do not send.",
};

const verdictColors: Record<Verdict, { accent: string; bg: string }> = {
  SEND: { accent: "#2d6a4f", bg: "#eef6f1" },
  REWRITE: { accent: "#b45309", bg: "#fef8ee" },
  HOLD: { accent: "#c2410c", bg: "#fff3eb" },
  BLOCK: { accent: "#b91c1c", bg: "#fef2f2" },
};

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char] ?? char,
  );
}

function wrapCardText(value: string, maxChars = 96): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length && lines.length < 2; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      if (lines.length === 2) break;
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && line) lines.push(line);
  return lines.slice(0, 2);
}

export function getTopSignals(result: EvaluationResponse): NormalizedSignal[] {
  const reasonKeys = new Set(
    result.reasons.map((reason) => REASON_SIGNAL_MAP[reason]).filter((signalId) => signalId !== null),
  );
  const sorted = [...result.signals].sort((a, b) => {
    const aTrig = reasonKeys.has(a.id);
    const bTrig = reasonKeys.has(b.id);
    if (aTrig && !bTrig) return -1;
    if (!aTrig && bTrig) return 1;
    if (a.direction !== b.direction) return a.direction === "higher-is-risk" ? -1 : 1;
    return b.value - a.value;
  });
  return sorted.slice(0, 4);
}

export function buildShareCardSvg(result: EvaluationResponse, options: ShareCardOptions = {}): string {
  const { accent, bg } = verdictColors[result.verdict];
  const outcome = outcomeMessages[result.verdict];
  const attribution = result.providerMode === "fake" ? "Development simulation" : "Powered by TypeSafe Jev";
  const topSignals = getTopSignals(result);
  const evidence = options.evidence;
  const evidenceStatus = evidence?.status ?? result.evidenceStatus;
  const sourceCount = evidence?.candidates.length ?? 0;
  const supportCount = evidence?.supportCount ?? 0;
  const disputeCount = evidence?.disputeCount ?? 0;
  const claimText = options.includeClaim && evidence?.claim ? evidence.claim.text.trim().slice(0, 220) : null;
  const claimLines = claimText ? wrapCardText(claimText) : [];

  const signalBars = topSignals
    .map((signal, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 80 + col * 530;
      const y = 350 + row * 85;
      const width = Math.max(8, Math.round(signal.value * 490));
      const directionLabel = SIGNAL_METADATA[signal.id].informational
        ? "informational"
        : signal.direction === "higher-is-risk"
          ? "risk"
          : signal.direction === "categorical"
            ? "category"
            : "quality";
      const visualization =
        signal.direction === "categorical"
          ? `<rect x="${x}" y="${y + 12}" width="490" height="8" rx="4" fill="#ebe8e2"/><text x="${x}" y="${y + 42}" fill="#737373" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="13">${SIGNAL_METADATA[signal.id].informational ? "Informational categorical" : "Categorical"} · confidence ${Math.round(signal.value * 100)}%</text>`
          : `<rect x="${x}" y="${y + 12}" width="490" height="8" rx="4" fill="#ebe8e2"/><rect x="${x}" y="${y + 12}" width="${width}" height="8" rx="4" fill="${accent}"/>`;

      return `
        <g>
          <text x="${x}" y="${y}" fill="#525252" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="500">${escapeXml(signal.label)} · ${directionLabel}</text>
          <text x="${x + 490}" y="${y}" fill="#171717" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="700">${escapeXml(signal.displayValue)}</text>
          ${visualization}
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
      <!-- Background canvas -->
      <rect width="1200" height="720" fill="#f7f6f2"/>
      <!-- Inner card -->
      <rect x="40" y="40" width="1120" height="640" rx="24" fill="#ffffff" stroke="#e4e1da" stroke-width="1.5"/>

      <!-- Header: brand -->
      <text x="80" y="98" fill="#171717" font-size="22" font-weight="800" letter-spacing="3">HOLD</text>
      <text x="175" y="98" fill="#a3a3a3" font-size="13" font-weight="600" letter-spacing="2">BY AETHER</text>

      <!-- Verdict lockup -->
      <rect x="80" y="130" width="220" height="52" rx="14" fill="${bg}"/>
      <text x="190" y="167" fill="${accent}" text-anchor="middle" font-size="34" font-weight="800" letter-spacing="2">${escapeXml(result.verdict)}</text>

      <!-- Outcome summary -->
      <text x="80" y="235" fill="#171717" font-size="32" font-weight="600" letter-spacing="-0.5">${escapeXml(outcome)}</text>
      <text x="80" y="275" fill="#737373" font-size="17">Pre-send judgment powered by TypeSafe Jev System One calibrated signals.</text>

      <!-- Signals divider -->
      <line x1="80" y1="310" x2="1120" y2="310" stroke="#f0ede6" stroke-width="1"/>

      <!-- Signals Grid -->
      ${signalBars}

      <!-- Evidence metadata -->
      <line x1="80" y1="540" x2="1120" y2="540" stroke="#f0ede6" stroke-width="1"/>
      <text x="80" y="575" fill="#525252" font-size="15" font-weight="600">Evidence: ${escapeXml(evidenceStatus)}</text>
      <text x="1120" y="575" fill="#737373" text-anchor="end" font-size="15">
        ${sourceCount} sources · ${supportCount} support · ${disputeCount} dispute
      </text>
      ${claimLines
        .map(
          (line, index) =>
            `<text x="80" y="${612 + index * 18}" fill="#171717" font-size="15" font-weight="500">${index === 0 ? "Claim included by explicit user choice: " : ""}${escapeXml(line)}</text>`,
        )
        .join("")}

      <!-- Footer metadata -->
      <text x="80" y="650" fill="#737373" font-size="14" font-weight="500">
        ${result.latencyMs} ms latency  ·  ${escapeXml(formatCost(result.estimatedCostUsd))}  ·  ${escapeXml(result.policyVersion)}
      </text>
      <text x="1120" y="650" fill="#171717" text-anchor="end" font-size="14" font-weight="600">
        ${escapeXml(attribution)}
      </text>
    </svg>
  `.trim();
}

export async function downloadShareCard(result: EvaluationResponse, options: ShareCardOptions = {}): Promise<void> {
  const svg = buildShareCardSvg(result, options);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context is unavailable");

    context.drawImage(image, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((val) => (val ? resolve(val) : reject(new Error("Could not create PNG"))), "image/png"),
    );

    const downloadUrl = URL.createObjectURL(pngBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `hold-${result.verdict.toLowerCase()}-card.png`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch {
    // Fallback to direct SVG download
    const link = document.createElement("a");
    link.href = url;
    link.download = `hold-${result.verdict.toLowerCase()}-card.svg`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
