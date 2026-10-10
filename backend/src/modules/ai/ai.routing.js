const CODE_EXT = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'sql',
  'sol',
  'vue',
  'svelte',
])

const VISUAL_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'heic',
  'avif',
])

const CODE_MIME = /^(text\/(javascript|typescript|x-python|x-java|x-c|plain)|application\/(javascript|typescript|json|xml))/i
const VISUAL_MIME = /^image\//i

function extensionOf(filename) {
  if (!filename || typeof filename !== 'string') return ''
  const base = filename.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Route submissions to a deliverable type. Explicit override wins when valid.
 */
export function resolveDeliverableType({
  deliverableType,
  contentType,
  originalFilename,
  externalUrl,
  notes,
} = {}) {
  const override = String(deliverableType ?? '')
    .trim()
    .toUpperCase()
  if (override === 'CODE' || override === 'TEXT' || override === 'VISUAL') {
    return override
  }

  const ext = extensionOf(originalFilename)
  if (CODE_EXT.has(ext)) return 'CODE'
  if (VISUAL_EXT.has(ext)) return 'VISUAL'

  if (contentType) {
    if (VISUAL_MIME.test(contentType)) return 'VISUAL'
    if (CODE_MIME.test(contentType)) return 'CODE'
  }

  const url = String(externalUrl ?? '').toLowerCase()
  if (
    url.includes('github.com') ||
    url.includes('gitlab.com') ||
    url.includes('bitbucket.org') ||
    url.endsWith('.git')
  ) {
    return 'CODE'
  }
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) return 'VISUAL'

  // Notes/links without stronger signals → general text/documents.
  if (notes || externalUrl) return 'TEXT'
  return 'TEXT'
}

export function modelsForType(aiConfig, deliverableType) {
  const list = aiConfig.models[deliverableType] ?? aiConfig.models.TEXT
  return Array.isArray(list) && list.length > 0 ? list : ['qwen3:1.7b']
}
