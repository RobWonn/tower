/**
 * Mock 数据，后续替换为 API 调用
 */
import type { Project, Task } from './types'
import { TaskStatus } from './types'

export const MOCK_PROJECTS: Project[] = [
  { id: 'p1', name: 'Tower', color: 'text-indigo-600' },
  { id: 'p2', name: 'Web', color: 'text-emerald-600' },
  { id: 'p3', name: 'SDK', color: 'text-rose-600' },
]

export const MOCK_TASKS: Task[] = [
  // Review
  {
    id: 't1',
    projectId: 'p1',
    title: 'API Refactor and comprehensive system overhaul including middleware optimization and database schema realignment',
    status: TaskStatus.Review,
    agent: 'Claude Code',
    branch: 'feat/api-overhaul-v2',
    description: 'Refactor API routes to separate user related endpoints into independent modules.',
  },
  {
    id: 't2',
    projectId: 'p2',
    title: 'Form Validation',
    status: TaskStatus.Review,
    agent: 'GPT-4o',
    branch: 'fix/forms',
    description: 'Add Zod validation to the registration flow.',
  },
  {
    id: 't12',
    projectId: 'p3',
    title: 'Memory Leak Analysis',
    status: TaskStatus.Review,
    agent: 'Gemini 1.5 Pro',
    branch: 'fix/mem-leak',
    description: 'Investigate the heap snapshots from the last production deployment.',
  },
  {
    id: 't13',
    projectId: 'p1',
    title: 'Accessibility Audit (WCAG 2.1)',
    status: TaskStatus.Review,
    agent: 'Claude 3.5 Sonnet',
    branch: 'chore/a11y',
    description: 'Ensure all interactive elements have proper aria-labels and keyboard navigation support.',
  },

  // Running
  {
    id: 't3',
    projectId: 'p1',
    title: 'Login Feature',
    status: TaskStatus.Running,
    agent: 'Claude Code',
    branch: 'feat/auth',
    description: 'Implement OAuth2 login flow with Google and GitHub providers.',
  },
  {
    id: 't4',
    projectId: 'p3',
    title: 'Type Fixes',
    status: TaskStatus.Running,
    agent: 'Gemini 2.0',
    branch: 'fix/types',
    description: 'Resolve TypeScript errors in the build pipeline.',
  },
  {
    id: 't5',
    projectId: 'p2',
    title: 'Home Optimization',
    status: TaskStatus.Running,
    agent: 'Claude Code',
    branch: 'chore/perf',
    description: 'Reduce bundle size by 20%.',
  },
  {
    id: 't14',
    projectId: 'p2',
    title: 'Tailwind Config Update',
    status: TaskStatus.Running,
    agent: 'GPT-4o',
    branch: 'chore/design-system',
    description: 'Update the color palette to match the new brand guidelines.',
  },

  // Pending
  { id: 't6', projectId: 'p3', title: 'Unit Tests', status: TaskStatus.Pending, agent: 'AutoGPT', branch: 'test/core', description: 'Increase coverage to 80%.' },
  { id: 't7', projectId: 'p1', title: 'DB Migration', status: TaskStatus.Pending, agent: 'Claude', branch: 'feat/db', description: 'Add new columns.' },
  { id: 't8', projectId: 'p2', title: 'Dark Mode', status: TaskStatus.Pending, agent: 'GPT-4', branch: 'feat/ui', description: 'Implement dark mode context.' },
  { id: 't9', projectId: 'p3', title: 'Documentation', status: TaskStatus.Pending, agent: 'Claude', branch: 'docs/api', description: 'Generate Swagger docs.' },
  { id: 't10', projectId: 'p1', title: 'CI Pipeline', status: TaskStatus.Pending, agent: 'Gemini', branch: 'chore/ci', description: 'Fix GitHub Actions.' },
  { id: 't15', projectId: 'p2', title: 'Sitemap Generation', status: TaskStatus.Pending, agent: 'Claude', branch: 'feat/seo', description: 'Add dynamic sitemap generation for SEO.' },
  { id: 't16', projectId: 'p1', title: 'Redis Cache', status: TaskStatus.Pending, agent: 'GPT-4', branch: 'feat/caching', description: 'Implement caching layer for expensive queries.' },
  { id: 't17', projectId: 'p3', title: 'Webhooks', status: TaskStatus.Pending, agent: 'Gemini', branch: 'feat/webhooks', description: 'Allow external services to subscribe to events.' },
  { id: 't18', projectId: 'p2', title: 'Image Optimization', status: TaskStatus.Pending, agent: 'Claude', branch: 'perf/images', description: 'Implement automatic WebP conversion on upload.' },
  { id: 't19', projectId: 'p1', title: 'Security Headers', status: TaskStatus.Pending, agent: 'GPT-4', branch: 'chore/security', description: 'Add helmet.js and configure CSP.' },
  { id: 't20', projectId: 'p3', title: 'Dependency Audit', status: TaskStatus.Pending, agent: 'Renovate', branch: 'chore/deps', description: 'Update all packages to latest stable versions.' },
  { id: 't21', projectId: 'p2', title: 'Mobile Menu', status: TaskStatus.Pending, agent: 'Claude', branch: 'fix/mobile-nav', description: 'Fix burger menu animation on iOS Safari.' },
  { id: 't22', projectId: 'p1', title: 'Rate Limiting', status: TaskStatus.Pending, agent: 'GPT-4', branch: 'feat/security', description: 'Implement IP-based rate limiting for public endpoints.' },

  // Done
  { id: 't11', projectId: 'p1', title: 'Init Repo', status: TaskStatus.Done, agent: 'Human', branch: 'main', description: 'Initial commit.' },
  { id: 't23', projectId: 'p2', title: 'Setup Linter', status: TaskStatus.Done, agent: 'Claude', branch: 'chore/lint', description: 'Configure ESLint and Prettier.' },
  { id: 't24', projectId: 'p3', title: 'Release v1.0.0', status: TaskStatus.Done, agent: 'Human', branch: 'release/v1', description: 'Production deployment.' },
]
