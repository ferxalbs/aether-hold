import { describe, expect, it } from "vitest";
import fixture from "@/calibration/hold-calibration-v2.json";

describe("versioned calibration fixture", () => {
  it("contains 60 independently labeled representative drafts", () => {
    expect(fixture.version).toBe("hold-calibration-v2");
    expect(fixture.cases).toHaveLength(60);

    expect(fixture.cases.filter((entry) => entry.context === "email")).toHaveLength(20);
    expect(fixture.cases.filter((entry) => entry.context === "social-post")).toHaveLength(20);
    expect(fixture.cases.filter((entry) => entry.context === "support-reply")).toHaveLength(20);

    expect(
      Object.fromEntries(
        (["SEND", "REWRITE", "HOLD", "BLOCK"] as const).map((verdict) => [
          verdict,
          fixture.cases.filter((entry) => entry.expectedVerdict === verdict).length,
        ]),
      ),
    ).toEqual({ SEND: 19, REWRITE: 17, HOLD: 12, BLOCK: 12 });
  });

  it("keeps human labels in the fixture instead of embedding model output", () => {
    expect(fixture.cases.every((entry) => "expectedVerdict" in entry)).toBe(true);
    expect(fixture.cases.every((entry) => !("modelVerdict" in entry))).toBe(true);
    expect(fixture.cases.every((entry) => !("signals" in entry))).toBe(true);
  });
});
