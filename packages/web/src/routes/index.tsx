import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RootLayout } from '@/layouts/RootLayout'

// Lazy load pages for bundle optimization (bundle-dynamic-imports)
const ProjectKanbanPage = lazy(() => import('@/pages/ProjectKanbanPage').then(m => ({ default: m.ProjectKanbanPage })))
const DemoPage = lazy(() => import('@/pages/DemoPage').then(m => ({ default: m.DemoPage })))
const AgentDemoPage = lazy(() => import('@/pages/AgentDemoPage').then(m => ({ default: m.AgentDemoPage })))

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<div className="p-8">Loading...</div>}>
            <ProjectKanbanPage />
          </Suspense>
        ),
      },
      {
        path: 'demo',
        element: (
          <Suspense fallback={<div className="p-8">Loading...</div>}>
            <DemoPage />
          </Suspense>
        ),
      },
      {
        path: 'agent-demo',
        element: (
          <Suspense fallback={<div className="p-8">Loading...</div>}>
            <AgentDemoPage />
          </Suspense>
        ),
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
