import { describe, expect, it } from "vitest";
import fixture from "@/calibration/hold-calibration-v1.json";

describe("versioned calibration fixture", () => {
  it("contains 30 independently labeled representative drafts", () => {
    expect(fixture.version).toBe("hold-calibration-v1");
    expect(fixture.cases).toHaveLength(30);

    expect(fixture.cases.filter((entry) => entry.context === "email")).toHaveLength(10);
    expect(fixture.cases.filter((entry) => entry.context === "social-post")).toHaveLength(10);
    expect(fixture.cases.filter((entry) => entry.context === "support-reply")).toHaveLength(10);

    expect(
      Object.fromEntries(
        (["SEND", "REWRITE", "HOLD", "BLOCK"] as const).map((verdict) => [
          verdict,
          fixture.cases.filter((entry) => entry.expectedVerdict === verdict).length,
        ]),
      ),
    ).toEqual({ SEND: 8, REWRITE: 8, HOLD: 7, BLOCK: 7 });
  });

  it("keeps human labels in the fixture instead of embedding model output", () => {
    expect(fixture.cases.every((entry) => "expectedVerdict" in entry)).toBe(true);
    expect(fixture.cases.every((entry) => !("modelVerdict" in entry))).toBe(true);
    expect(fixture.cases.every((entry) => !("signals" in entry))).toBe(true);
  });
});
