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
import { EntityDetailScreen } from './features/entities/EntityDetailScreen';
import { EntityTypeDetailScreen } from './features/entities/EntityTypeDetailScreen';
import { BooksScreen } from './features/chapters/BooksScreen';
import { BookDetailScreen } from './features/chapters/BookDetailScreen';
import { ChapterScreen } from './features/chapters/ChapterScreen';
import { TimelineScreen } from './features/timeline/TimelineScreen';
import { EventScreen } from './features/events/EventScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ReaderScreen } from './features/reader/ReaderScreen';
import { ReaderChapterScreen } from './features/reader/ReaderChapterScreen';
import { RunsScreen } from './features/runs/RunsScreen';
import { AgentActivityScreen } from './features/agentActivity/AgentActivityScreen';
import { Login } from './features/auth/Login';
import { supabase } from './lib/supabase';

const rootRoute = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-fg-muted">
        This URL doesn't match any route. If you just navigated from a tab and the
        dev server is running, try a hard refresh (Ctrl+Shift+R) — Vite HMR
        sometimes misses new routes.
      </p>
      <a
        href="/worlds"
        className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg"
      >
        Back to your worlds
      </a>
    </main>
  );
}

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

const entityDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/entities/$entityId',
  beforeLoad: requireAuth,
  component: EntityDetailScreen,
});

const entityTypeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/entity-types/$typeId',
  beforeLoad: requireAuth,
  component: EntityTypeDetailScreen,
});

const booksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/books',
  beforeLoad: requireAuth,
  component: BooksScreen,
});

const bookDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/books/$bookId',
  beforeLoad: requireAuth,
  component: BookDetailScreen,
});

const chapterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/chapters/$chapterId',
  beforeLoad: requireAuth,
  component: ChapterScreen,
});

const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/timeline',
  beforeLoad: requireAuth,
  component: TimelineScreen,
});

const eventRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/events/$eventId',
  beforeLoad: requireAuth,
  component: EventScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/settings',
  beforeLoad: requireAuth,
  component: SettingsScreen,
});

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/read',
  beforeLoad: requireAuth,
  component: ReaderScreen,
});

const readerChapterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/read/$chapterId',
  beforeLoad: requireAuth,
  component: ReaderChapterScreen,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/runs',
  beforeLoad: requireAuth,
  component: RunsScreen,
});

const agentActivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/agent-activity',
  beforeLoad: requireAuth,
  component: AgentActivityScreen,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  worldsRoute,
  worldDetailRoute,
  noteRoute,
  entitiesRoute,
  entityDetailRoute,
  entityTypeDetailRoute,
  booksRoute,
  bookDetailRoute,
  chapterRoute,
  timelineRoute,
  eventRoute,
  settingsRoute,
  readerRoute,
  readerChapterRoute,
  runsRoute,
  agentActivityRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
