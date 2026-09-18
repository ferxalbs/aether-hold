import { describe, expect, it } from "vitest";
import { holdInputSchema } from "@/packages/core";

describe("HoldInput validation", () => {
  it("accepts the three supported contexts", () => {
    for (const context of ["social-post", "email", "support-reply"] as const) {
      expect(holdInputSchema.safeParse({ draft: "Hello", context }).success).toBe(true);
    }
  });

  it("rejects oversized drafts and optional fields", () => {
    expect(holdInputSchema.safeParse({ draft: "x".repeat(8001), context: "email" }).success).toBe(false);
    expect(holdInputSchema.safeParse({ draft: "Hello", context: "email", audience: "x".repeat(2001) }).success).toBe(
      false,
    );
    expect(holdInputSchema.safeParse({ draft: "Hello", context: "email", extra: "nope" }).success).toBe(false);
  });
});
