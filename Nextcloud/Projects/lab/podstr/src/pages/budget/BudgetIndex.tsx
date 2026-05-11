import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { BudgetLayout } from '@/components/budget/BudgetLayout';

/** Landing page for the county budget section */
export default function BudgetIndex() {
  useSeoMeta({
    title: 'Ray County FY2025 Budget',
    description: 'Interactive budget analysis for Ray County FY2025',
  });

  const cards = [
    {
      to: '/budget/explorer',
      title: 'Budget Explorer',
      description: 'Drill down by fund, account, and vendor. Interactive charts with budget vs actual comparison, treemap breakdowns, and detailed transaction tables.',
      tag: 'Recharts · Interactive',
    },
    {
      to: '/budget/dashboard',
      title: 'Budget Dashboard',
      description: 'High-level analytics: monthly revenue vs expenses, anomalous transactions, vendor concentration risk (HHI), accounts over budget, and top vendors. Sortable and filterable tables.',
      tag: 'Recharts · Sortable Tables',
    },
  ];

  return (
    <BudgetLayout>
      <div className="max-w-[900px] mx-auto py-10 px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map(card => (
            <Link key={card.to} to={card.to} className="no-underline">
              <Card className="h-full bg-gradient-to-br from-[#e60000]/5 to-transparent shadow-sm border border-[#e60000]/20 hover:border-[#e60000]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
                <CardContent className="p-6">
                  <h2 className="text-[#e60000] text-base font-semibold mb-2">
                    {card.title}
                  </h2>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {card.description}
                  </p>
                  <span className="inline-block mt-3 px-2.5 py-1 bg-red-50 text-[#e60000] rounded-lg text-xs font-semibold">
                    {card.tag}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <footer className="text-center py-6 text-gray-500 text-xs mt-8">
          Ray County FY2025 Budget Data · Static data — no server required
        </footer>
      </div>
    </BudgetLayout>
  );
}
