import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { AppUpdateNotice } from './components/AppUpdateNotice';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <AppUpdateNotice />
    </QueryClientProvider>
  );
}
