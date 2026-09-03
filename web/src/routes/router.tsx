/**
 * TanStack Router configuration with code-based route tree.
 * Auth guard on the root layout redirects unauthenticated users to /login.
 */
/* eslint-disable react-refresh/only-export-components -- route config owns lazy route wrappers and router exports */
import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { getApiToken } from '@/auth-token';
import { ChatView } from './chat-view';
import { BASE_PATH } from '@/base-path';

const LoginRoute = lazy(() =>
  import('./login-route').then((module) => ({ default: module.LoginRoute })),
);
const AuthenticatedLayout = lazy(() =>
  import('./authenticated-layout').then((module) => ({
    default: module.AuthenticatedLayout,
  })),
);
const ThreadView = lazy(() =>
  import('./thread-view').then((module) => ({ default: module.ThreadView })),
);
const DiagnosticsRoute = lazy(() =>
  import('./diagnostics-route').then((module) => ({
    default: module.DiagnosticsRoute,
  })),
);

function LoginRouteComponent() {
  return (
    <Suspense fallback={null}>
      <LoginRoute />
    </Suspense>
  );
}

function AuthenticatedRouteComponent() {
  return (
    <Suspense fallback={null}>
      <AuthenticatedLayout />
    </Suspense>
  );
}

function ThreadRouteComponent() {
  return (
    <Suspense fallback={null}>
      <ThreadView />
    </Suspense>
  );
}

function DiagnosticsRouteComponent() {
  return (
    <Suspense fallback={null}>
      <DiagnosticsRoute />
    </Suspense>
  );
}

export type LoginSearch = { redirect: string };
export type IntegrationsSearch = { tab: 'plugins' | 'apps' | 'mcps' };

const INTEGRATION_TABS = ['plugins', 'apps', 'mcps'] as const;

function sanitizeIntegrationsSearch(
  search: Record<string, unknown>,
): IntegrationsSearch {
  const tab = search.tab;
  return {
    tab: INTEGRATION_TABS.includes(tab as IntegrationsSearch['tab'])
      ? (tab as IntegrationsSearch['tab'])
      : 'plugins',
  };
}

/** Sanitizes redirect target to prevent open-redirect attacks. */
function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/api/')) return '/';
  return value;
}

/** Bare root — just renders child routes. */
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

/** Login route — redirects to / if already authenticated. */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: ({ search }) => {
    if (getApiToken()) {
      throw redirect({ to: search.redirect });
    }
  },
  component: LoginRouteComponent,
});

/** Authenticated layout — sidebar + header + outlet. */
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: ({ location }) => {
    if (!getApiToken()) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedRouteComponent,
});

/** Index route — empty chat state (no thread selected). */
const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: ChatView,
});

/** Thread route — specific thread by id. */
export const threadRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/t/$threadId',
  component: ThreadRouteComponent,
});

/** Global files view. */
const filesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/files',
});

/** Global terminal view. */
const terminalRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/terminal',
});

/** Diagnostics panel. */
const diagnosticsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/diagnostics',
  component: DiagnosticsRouteComponent,
});

/** Settings page. */
const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/settings',
});

/** Integrations page (plugins, apps, MCPs). */
const integrationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/integrations',
  validateSearch: sanitizeIntegrationsSearch,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    indexRoute,
    threadRoute,
    filesRoute,
    terminalRoute,
    diagnosticsRoute,
    settingsRoute,
    integrationsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  basepath: BASE_PATH || '/',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
