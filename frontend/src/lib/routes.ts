export const routes = {
  home: '/',
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  projects: '/projects',
  projectNew: '/projects/new',
  project: (projectId: string) => `/projects/${projectId}`,
  agreement: (projectId: string) => `/projects/${projectId}/agreement`,
  progress: (projectId: string) => `/projects/${projectId}/progress`,
  disputes: (projectId: string) => `/projects/${projectId}/disputes`,
  payments: (projectId: string) => `/projects/${projectId}/payments`,
  uiDemo: '/dev/ui',
} as const
