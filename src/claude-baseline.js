// Recorded with scripts/record-claude-baseline.mjs. Re-run the script when the
// prompt, model, or scenario suite changes; do not edit individual results.
export const claudeBaseline = {
  schemaVersion: 1,
  model: "claude-haiku-4-5-20251001",
  recordedAt: "2026-11-13T06:08:12.267Z",
  temperature: 0,
  promptVersion: "fraud-review-baseline-v1",
  promptHash: "d066a69547c2",
  cases: [
    {
      id: "S01",
      expected: "fraud",
      classification: "investigate",
      confidence: 0.78,
      rationale:
        "Multiple risk signals align with potential card testing followed by a fraudulent purchase. Three small incremental charges at NOVA DIGITAL immediately preceded a large outlier transaction at an unfamiliar merchant in a new region. However, legitimate explanations exist for the pattern.",
      supportingSignals: [
        "Card testing pattern: 3 small verification-like charges ($1.24, $2.18, $3.07) within 20 minutes before larger purchase",
        "Amount outlier: $847.32 significantly exceeds typical General Merchandise spending ($48.17 average)",
        "New merchant: TECHHUB ONLINE absent from transaction history",
        "Unfamiliar region: Austin, TX is new; cardholder's known regions limited to San Francisco, CA",
      ],
      benignExplanations: [],
    },
    {
      id: "S02",
      expected: "investigate",
      classification: "investigate",
      confidence: 0.72,
      rationale:
        "Transaction matches user's known profile (San Francisco, Whole Foods in top merchants, amount slightly above typical $48.17). However, a duplicate charge rule triggered: identical merchant, amount, and location within 2 minutes suggests possible processing error or accidental double-submission rather than fraud.",
      supportingSignals: [
        "Duplicate charge detected within 2 minutes at same merchant and amount",
        "Transaction location aligns with known region",
        "Merchant is in user's top 5 transaction history",
        "Amount ($72.41) is within reasonable variance of typical grocery spend ($48.17)",
      ],
      benignExplanations: [
        "Accidental double-submission during checkout",
        "Payment processing retry after initial timeout",
        "User submitted payment twice due to unclear confirmation",
        "System glitch causing duplicate posting",
        "User intentionally made two separate purchases at same time",
      ],
    },
    {
      id: "S03",
      expected: "legitimate",
      classification: "investigate",
      confidence: 0.35,
      rationale:
        "Transaction is 14× the typical amount ($684.18 vs $48.17 avg) at a new merchant in a known region. Healthcare category and San Francisco location align with cardholder profile, but the significant amount deviation and merchant novelty warrant investigation.",
      supportingSignals: [
        "New merchant (Sutter Health) not in transaction history",
        "Amount significantly exceeds typical transaction ($684.18 vs $48.17 average)",
        "Transaction location (San Francisco, CA) is in known regions",
        "Healthcare category is plausible for cardholder profile",
      ],
      benignExplanations: [
        "Legitimate medical procedure or appointment at Sutter Health facility",
        "Annual or periodic healthcare expense not reflected in recent transaction history",
        "Insurance copay or out-of-pocket medical cost",
        "Cardholder visiting healthcare provider in familiar region",
      ],
    },
    {
      id: "S04",
      expected: "investigate",
      classification: "investigate",
      confidence: 0.65,
      rationale:
        "StreamBox is a new merchant with a 79% price increase from prior subscription ($13.99→$24.99). However, transaction aligns with known location and entertainment category. Warrants review but insufficient evidence for fraud classification.",
      supportingSignals: [
        "New merchant not in transaction history",
        "Subscription amount increased 79% month-over-month",
        "Transaction occurred at known location (San Francisco, CA)",
        "Prior StreamBox charge on 2026-10-12 suggests established subscription",
      ],
      benignExplanations: [
        "Cardholder upgraded subscription tier or plan",
        "Merchant applied promotional rate that expired",
        "Annual billing converted to monthly with higher rate",
        "Service added features or tier change initiated by cardholder",
      ],
    },
    {
      id: "S05",
      expected: "legitimate",
      classification: "investigate",
      confidence: 0.65,
      rationale:
        "Transaction is 5.3× typical spend at a new merchant in a known region. Recent similar purchase (B&H Photo) suggests legitimate interest in photography equipment, but the elevated amount and merchant novelty warrant review.",
      supportingSignals: [
        "New merchant (Leica Store) not in history",
        "Amount $1,290 significantly exceeds typical spend of $242.30",
        "Similar category purchase at B&H Photo 11 days prior",
        "Transaction in known region (Los Angeles, CA)",
      ],
      benignExplanations: [
        "Legitimate high-value photography equipment purchase following prior B&H Photo transaction",
        "Planned purchase of premium camera or lens at specialty retailer",
        "Cardholder traveling or shopping in Los Angeles with known spending pattern",
      ],
    },
    {
      id: "S06",
      expected: "fraud",
      classification: "investigate",
      confidence: 0.72,
      rationale:
        "Multiple risk signals suggest elevated fraud likelihood: new merchant (KICKS ONLINE) with amount 60% above typical spend; three substantial charges in 22 minutes from unfamiliar Miami location; cardholder's history limited to West Coast merchants. However, legitimate travel/shopping spree remains plausible.",
      supportingSignals: [
        "NEW_MERCHANT_BURST: Multiple first-time merchants in concentrated 22-minute window",
        "SPEND_VELOCITY: Three charges ($129.77, $245.10, $389.17) within 22 minutes",
        "UNFAMILIAR_REGION: Miami, FL is new; cardholder's known regions are San Francisco and Los Angeles",
        "AMOUNT_ANOMALY: $389.17 is 60% above typical transaction amount of $242.30",
        "NEW_MERCHANT: KICKS ONLINE has no prior history with this cardholder",
      ],
      benignExplanations: [],
    },
    {
      id: "S07",
      expected: "legitimate",
      classification: "legitimate",
      confidence: 0.78,
      rationale:
        "Transaction at Legal Sea Foods in Boston is consistent with established travel pattern. Recent Marriott Boston booking (Nov 5) provides strong contextual support for dining in the same city. New merchant and late-night timing are minor risk factors, but outweighed by travel context and known region alignment.",
      supportingSignals: [
        "Related travel transaction (Marriott Boston) on prior day in same location",
        "Boston, MA is in cardholder's known regions",
        "Food and Drink category aligns with typical travel behavior",
        "Amount ($96.41) is reasonable for restaurant meal",
      ],
      benignExplanations: [
        "Cardholder traveling to Boston; dining at local restaurant during hotel stay",
        "Late-night transaction (02:10 UTC) may reflect local evening dining time",
        "New merchant is expected when traveling to unfamiliar cities",
      ],
    },
    {
      id: "S08",
      expected: "fraud",
      classification: "investigate",
      confidence: 0.65,
      rationale:
        "ATM cash withdrawal of $600 in unfamiliar Las Vegas location at 3:20 AM shows multiple risk signals: new region, unusual hour, high amount relative to typical $340 baseline, and new merchant. However, preceding micro-transaction suggests possible legitimate travel activity warranting investigation rather than definitive fraud classification.",
      supportingSignals: [
        "Unfamiliar region (Las Vegas, NV) not in known transaction history",
        "High-value withdrawal ($600) significantly above typical amount ($340.22)",
        "Unusual transaction time (3:20 AM) outside normal activity window",
        "New merchant type (ATM) not previously used",
        "Preceding micro-transaction at NOVA DIGITAL suggests possible travel context",
      ],
      benignExplanations: [],
    },
  ],
};

const casesById = new Map(claudeBaseline.cases.map((item) => [item.id, item]));

export function recordedClaudeAssessment(scenarioId) {
  const assessment = casesById.get(scenarioId);
  if (!assessment)
    throw new Error(`No recorded Claude baseline exists for ${scenarioId}.`);
  return {
    ...assessment,
    mode: "recorded",
    model: claudeBaseline.model,
    recordedAt: claudeBaseline.recordedAt,
  };
}
