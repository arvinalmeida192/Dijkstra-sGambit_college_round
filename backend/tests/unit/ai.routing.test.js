import { describe, expect, it } from 'vitest'
import {
  modelsForType,
  resolveDeliverableType,
} from '../../src/modules/ai/ai.routing.js'

describe('resolveDeliverableType', () => {
  it('honors explicit override', () => {
    expect(
      resolveDeliverableType({
        deliverableType: 'VISUAL',
        originalFilename: 'app.js',
      }),
    ).toBe('VISUAL')
  })

  it('routes code and visual by extension', () => {
    expect(
      resolveDeliverableType({ originalFilename: 'main.ts' }),
    ).toBe('CODE')
    expect(
      resolveDeliverableType({ originalFilename: 'shot.png' }),
    ).toBe('VISUAL')
  })

  it('routes github urls to CODE and defaults notes to TEXT', () => {
    expect(
      resolveDeliverableType({
        externalUrl: 'https://github.com/org/repo',
      }),
    ).toBe('CODE')
    expect(resolveDeliverableType({ notes: 'hello' })).toBe('TEXT')
  })
})

describe('modelsForType', () => {
  it('returns configured models without running all five', () => {
    const config = {
      models: {
        CODE: ['qwen2.5-coder:1.5b'],
        TEXT: ['qwen3:1.7b', 'gemma3:1b'],
        VISUAL: ['qwen2.5vl:3b', 'gemma3:4b'],
      },
    }
    expect(modelsForType(config, 'CODE')).toEqual(['qwen2.5-coder:1.5b'])
    expect(modelsForType(config, 'TEXT')).toHaveLength(2)
  })
})
