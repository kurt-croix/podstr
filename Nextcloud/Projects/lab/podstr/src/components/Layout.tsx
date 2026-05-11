import { ReactNode } from 'react';
import { TopHeader } from '@/components/TopHeader';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header (includes hamburger menu for nav) */}
          <TopHeader />

          {/* Page Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}