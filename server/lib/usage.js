export function estimateUsage({ promptText, outputText, usageFromApi, priceIn, priceOut, elapsedMs }) {
  const estInputTokens = usageFromApi?.inputTokens ?? Math.ceil(promptText.length / 3)
  const estOutputTokens = usageFromApi?.outputTokens ?? Math.ceil(outputText.length / 3)
  const tokensMeasured = Boolean(usageFromApi)
  const estCostUsd = (estInputTokens * (priceIn || 0) + estOutputTokens * (priceOut || 0)) / 1_000_000

  return {
    elapsedMs,
    tokensMeasured,
    estInputTokens,
    estOutputTokens,
    estCostUsd: Number(estCostUsd.toFixed(4))
  }
}
