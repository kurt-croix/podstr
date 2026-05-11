import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { cn } from '@/lib/utils';

interface BudgetLayoutProps {
  children: ReactNode;
}

/** Page wrapper for budget pages — adds sub-navigation and consistent styling */
export function BudgetLayout({ children }: BudgetLayoutProps) {
  const location = useLocation();
  const path = location.pathname;

  const links = [
    { to: '/budget', label: 'Home', active: path === '/budget' },
    { to: '/budget/explorer', label: 'Budget Explorer', active: path === '/budget/explorer' },
    { to: '/budget/dashboard', label: 'Dashboard', active: path === '/budget/dashboard' },
  ];

  return (
    <Layout>
      {/* Sub-header matching static site glass morphism */}
      <div className="border-b bg-white/60 backdrop-blur-lg">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-[#22262a]">
              Ray County FY2025 Budget
            </h1>
            <nav className="flex gap-4 items-center">
              {links.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'text-sm no-underline',
                    link.active
                      ? 'text-[#22262a] font-semibold pointer-events-none'
                      : 'text-gray-500 hover:text-[#22262a] hover:underline',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            10,687 transactions across 797 accounts and 33 funds &nbsp;
            <a href="/podstr/data/transactions.tsv" download className="text-[#e60000] text-xs underline">
              Transactions
            </a>
            {' · '}
            <a href="/podstr/data/budgets.tsv" download className="text-[#e60000] text-xs underline">
              Budgets
            </a>
            {' · '}
            <a href="/podstr/data/accounts.tsv" download className="text-[#e60000] text-xs underline">
              Accounts
            </a>
          </div>
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>
    </Layout>
  );
}
