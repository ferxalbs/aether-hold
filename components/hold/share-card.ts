import type { EvaluationResponse, NormalizedSignal, Verdict } from "@/packages/core";
import { formatCost } from "./decision-receipt";

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

export function getTopSignals(result: EvaluationResponse): NormalizedSignal[] {
  const reasonKeys = new Set(result.reasons.map((r) => r.toLowerCase()));
  const sorted = [...result.signals].sort((a, b) => {
    const aTrig = reasonKeys.has(a.id.toLowerCase());
    const bTrig = reasonKeys.has(b.id.toLowerCase());
    if (aTrig && !bTrig) return -1;
    if (!aTrig && bTrig) return 1;
    return b.value - a.value;
  });
  return sorted.slice(0, 4);
}

export function buildShareCardSvg(result: EvaluationResponse): string {
  const { accent, bg } = verdictColors[result.verdict];
  const outcome = outcomeMessages[result.verdict];
  const topSignals = getTopSignals(result);

  const signalBars = topSignals
    .map((signal, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 80 + col * 530;
      const y = 350 + row * 85;
      const width = Math.max(8, Math.round(signal.value * 490));

      return `
        <g>
          <text x="${x}" y="${y}" fill="#525252" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="500">${escapeXml(signal.label)}</text>
          <text x="${x + 490}" y="${y}" fill="#171717" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700">${escapeXml(signal.displayValue)}</text>
          <rect x="${x}" y="${y + 12}" width="490" height="8" rx="4" fill="#ebe8e2"/>
          <rect x="${x}" y="${y + 12}" width="${width}" height="8" rx="4" fill="${accent}"/>
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&amp;display=swap');
          text { font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        </style>
      </defs>
      <!-- Background canvas -->
      <rect width="1200" height="680" fill="#f7f6f2"/>
      <!-- Inner card -->
      <rect x="40" y="40" width="1120" height="600" rx="24" fill="#ffffff" stroke="#e4e1da" stroke-width="1.5"/>

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

      <!-- Bottom divider -->
      <line x1="80" y1="540" x2="1120" y2="540" stroke="#f0ede6" stroke-width="1"/>

      <!-- Footer metadata -->
      <text x="80" y="582" fill="#737373" font-size="14" font-weight="500">
        ${result.latencyMs} ms latency  ·  ${escapeXml(formatCost(result.estimatedCostUsd))}  ·  ${escapeXml(result.policyVersion)}
      </text>
      <text x="1120" y="582" fill="#171717" text-anchor="end" font-size="14" font-weight="600">
        Powered by TypeSafe Jev
      </text>
    </svg>
  `.trim();
}

export async function downloadShareCard(result: EvaluationResponse): Promise<void> {
  const svg = buildShareCardSvg(result);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 680;
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
