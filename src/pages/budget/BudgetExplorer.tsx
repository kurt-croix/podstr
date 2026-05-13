import { Layout } from '@/components/Layout';
import { useSeoMeta } from '@unhead/react';
import { useLocation } from 'react-router-dom';

/** Loads the static budget_explorer.html in an iframe, passing hash params for deep linking */
export default function BudgetExplorer() {
  useSeoMeta({
    title: 'Budget Explorer - Ray County FY2025',
    description: 'Drill down into Ray County FY2025 budget by fund and account',
  });

  const { hash } = useLocation();
  const src = `/podstr/budget/budget_explorer.html${hash}`;

  return (
    <Layout>
      <iframe
        src={src}
        title="Budget Explorer"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 70px)', minHeight: '800px' }}
      />
    </Layout>
  );
}
