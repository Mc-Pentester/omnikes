import type { ReactNode } from 'react';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

export function AdminPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
