import { getAiConfig } from '../../config/ai.js'

/**
 * Ollama HTTP adapter. Uses native fetch; injectable for tests.
 * Never downloads model weights — only generates if the model is already local.
 */

export class OllamaAdapter {
  constructor({ config = getAiConfig(), fetchImpl = globalThis.fetch } = {}) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  async isAvailable() {
    try {
      const res = await this.#request('/api/tags', { method: 'GET' })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels() {
    const res = await this.#request('/api/tags', { method: 'GET' })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama tags failed (${res.status}): ${text.slice(0, 200)}`)
    }
    const body = await res.json()
    const models = Array.isArray(body.models) ? body.models : []
    return models.map((m) => m.name).filter(Boolean)
  }

  async hasModel(modelName) {
    const names = await this.listModels()
    return names.some(
      (n) => n === modelName || n.startsWith(`${modelName}:`) || modelName.startsWith(`${n}:`),
    )
  }

  /**
   * @returns {{ ok: true, text: string, model: string, raw: object } | { ok: false, error: string, code: string }}
   */
  async generate({ model, system, prompt, images = [] }) {
    if (!this.config.enabled) {
      return {
        ok: false,
        error: 'AI is disabled (AI_ENABLED=false).',
        code: 'SKIPPED',
      }
    }

    let available
    try {
      available = await this.isAvailable()
    } catch {
      available = false
    }
    if (!available) {
      return {
        ok: false,
        error: `Ollama is unreachable at ${this.config.baseUrl}.`,
        code: 'MODEL_UNAVAILABLE',
      }
    }

    let installed
    try {
      installed = await this.hasModel(model)
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        code: 'MODEL_UNAVAILABLE',
      }
    }
    if (!installed) {
      return {
        ok: false,
        error: `Model "${model}" is not installed locally. Do not auto-download; pull it only with explicit human approval.`,
        code: 'MODEL_UNAVAILABLE',
      }
    }

    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    const userMessage = { role: 'user', content: prompt }
    if (images.length > 0) {
      userMessage.images = images
    }
    messages.push(userMessage)

    try {
      const res = await this.#request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
          options: { temperature: 0.1 },
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          ok: false,
          error: `Ollama chat failed (${res.status}): ${text.slice(0, 300)}`,
          code: 'MODEL_UNAVAILABLE',
        }
      }
      const raw = await res.json()
      const text = raw?.message?.content ?? raw?.response ?? ''
      if (!text || !String(text).trim()) {
        return {
          ok: false,
          error: 'Ollama returned an empty response.',
          code: 'INVALID_OUTPUT',
        }
      }
      return { ok: true, text: String(text), model, raw }
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Ollama request failed.',
        code: 'MODEL_UNAVAILABLE',
      }
    }
  }

  async #request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    )
    try {
      return await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

let defaultAdapter = null

export function getDefaultAdapter() {
  if (!defaultAdapter) defaultAdapter = new OllamaAdapter()
  return defaultAdapter
}

/** Test helper */
export function setDefaultAdapter(adapter) {
  defaultAdapter = adapter
}
