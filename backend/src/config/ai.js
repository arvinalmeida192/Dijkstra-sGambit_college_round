import { env } from './env.js'

/**
 * Phase 19 AI / Ollama configuration.
 * Model names are routing defaults — not ranked preferences.
 * Do not download weights from application code.
 */

const DEFAULT_MODELS = {
  CODE: ['qwen2.5-coder:1.5b'],
  TEXT: ['qwen3:1.7b', 'gemma3:1b'],
  VISUAL: ['qwen2.5vl:3b', 'gemma3:4b'],
}

function splitList(value, fallback) {
  if (!value || !String(value).trim()) return [...fallback]
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function getAiConfig() {
  return {
    enabled: env.aiEnabled,
    provider: 'ollama',
    baseUrl: env.ollamaBaseUrl.replace(/\/$/, ''),
    timeoutMs: env.ollamaTimeoutMs,
    compareOnLowConfidence: env.aiCompareOnLowConfidence,
    lowConfidenceThreshold: env.aiLowConfidenceThreshold,
    models: {
      CODE: splitList(env.aiModelCode, DEFAULT_MODELS.CODE),
      TEXT: splitList(env.aiModelText, DEFAULT_MODELS.TEXT),
      VISUAL: splitList(env.aiModelVisual, DEFAULT_MODELS.VISUAL),
    },
    advisoryNotice:
      'Advisory only. AI does not approve milestones, decide disputes, or authorize payments.',
  }
}

export { DEFAULT_MODELS }
