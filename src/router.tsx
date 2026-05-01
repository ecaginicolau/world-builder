import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from './routes/RootLayout';
import { IndexRoute } from './routes/IndexRoute';
import { WorldsScreen } from './features/worlds/WorldsScreen';
import { WorldDetailScreen } from './features/notes/WorldDetailScreen';
import { NoteScreen } from './features/notes/NoteScreen';
import { EntitiesScreen } from './features/entities/EntitiesScreen';
import { Login } from './features/auth/Login';
import { supabase } from './lib/supabase';

const rootRoute = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoute,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
});

async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: '/login' });
  }
}

const worldsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds',
  beforeLoad: requireAuth,
  component: WorldsScreen,
});

const worldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId',
  beforeLoad: requireAuth,
  component: WorldDetailScreen,
});

const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/notes/$noteId',
  beforeLoad: requireAuth,
  component: NoteScreen,
});

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/entities',
  beforeLoad: requireAuth,
  component: EntitiesScreen,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  worldsRoute,
  worldDetailRoute,
  noteRoute,
  entitiesRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
