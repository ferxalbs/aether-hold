export const POLICY_VERSION = "hold-policy-2.0.0-atomic";

export const POLICY_THRESHOLDS = {
  secretExposureBlock: 0.75,
  hostilityBlock: 0.85,
  needsVerificationHold: 0.7,
  containsCheckableClaim: 0.65,
  uncertainClaimFloor: 0.45,
  highConsequenceClaim: 0.67,
  toneRewrite: 0.66,
  spamRiskRewrite: 0.65,
  clarityRewrite: 0.45,
  recipientValueRewrite: 0.45,
  intentAlignmentRewrite: 0.55,
  addressesRequestRewrite: 0.55,
} as const;

export type PolicyThresholds = typeof POLICY_THRESHOLDS;
