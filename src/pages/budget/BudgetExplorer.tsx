import { Layout } from '@/components/Layout';
import { useSeoMeta } from '@unhead/react';

/** Loads the static budget_explorer.html in an iframe */
export default function BudgetExplorer() {
  useSeoMeta({
    title: 'Budget Explorer - Ray County FY2025',
    description: 'Drill down into Ray County FY2025 budget by fund and account',
  });

  return (
    <Layout>
      <iframe
        src="/podstr/budget/budget_explorer.html"
        title="Budget Explorer"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 70px)', minHeight: '800px' }}
      />
    </Layout>
  );
}
