import { DeterministicDecisionRecommendationProvider } from "./provider.js";
import { DecisionAiError, type DecisionRecommendationProvider } from "./types.js";

export function resolveDecisionRecommendationProvider(options: { env?: Record<string, string | undefined> } = {}): DecisionRecommendationProvider {
  const env = options.env ?? process.env;
  const configured = env.DECISION_AI_PROVIDER?.trim();
  if (!configured) throw new DecisionAiError("DECISION_PROVIDER_REQUIRED", 503);
  if (configured === "deterministic") {
    if (env.DEMO_MODE !== "true" || env.NODE_ENV === "production") throw new DecisionAiError("DECISION_PROVIDER_REQUIRED", 503);
    return new DeterministicDecisionRecommendationProvider();
  }
  throw new DecisionAiError("DECISION_PROVIDER_NOT_CONFIGURED", 503);
}
