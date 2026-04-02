/**
 * Claude model pricing (USD per million tokens).
 * Update these as Anthropic adjusts pricing.
 * Source: https://www.anthropic.com/pricing
 */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Claude 4.x / Sonnet 4.6
  "claude-sonnet-4-6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-sonnet-4-5": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  // Claude Opus 4.x
  "claude-opus-4-6": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "claude-opus-4-5": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  // Claude Haiku
  "claude-haiku-4-5-20251001": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "claude-haiku-4-5": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  // Legacy
  "claude-3-5-sonnet-20241022": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-5-haiku-20241022": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "claude-3-opus-20240229": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
};

const FALLBACK: ModelPricing = { inputPerMillion: 3.0, outputPerMillion: 15.0 };

export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model] ?? FALLBACK;
  return (
    (tokensIn / 1_000_000) * pricing.inputPerMillion +
    (tokensOut / 1_000_000) * pricing.outputPerMillion
  );
}
