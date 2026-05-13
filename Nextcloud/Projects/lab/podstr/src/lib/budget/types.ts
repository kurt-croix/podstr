/** A single transaction from the FY2025 budget */
export interface Transaction {
  txn_id: number;
  post_date: string;       // MM/DD/YYYY
  packet_number: string;
  source_transaction: string;
  description_vendor: string;
  amount: number;          // negative = revenue, positive = expense
  account: string;         // full account code e.g. "01-01-47000"
  fund: string;            // fund code e.g. "01"
  sub_fund: string;
  acct_code: string;       // account code e.g. "47000"
  acct_name: string;
  section: string;
  acct_type: string;       // "Revenue" or "Expense"
  category: string;
  consolidated_name: string;
}

/** Budget summary row from budgets.tsv */
export interface BudgetRow {
  acct_code: string;
  canonical_name: string;
  acct_type: string;
  num_funds: number;
  num_accounts: number;
  num_transactions: number;
  fund_sources: string;
  sections: string;
  fiscal_budget: number;
  total_activity: number;
  ending_balance: number;
  budget_remaining: number;
  pct_remaining: number;
}

/** Simple account → budget mapping from accounts.tsv */
export interface AccountRow {
  account: string;
  fiscal_budget: number;
}

// --- Analytics result types ---

export interface MonthlyData {
  month: string;       // YYYY-MM
  label: string;       // Jan, Feb, etc.
  revenue: number;
  expenses: number;
  netPct: number;      // ((rev - exp) / rev) * 100
}

export interface VendorData {
  vendor: string;
  total: number;
  count: number;
}

export interface BucketData {
  bucket: string;
  count: number;
  pct: number;
}

export interface DayVolume {
  day: number;
  count: number;
  total: number;
}

export interface HHIData {
  fund: string;
  name: string;
  hhi: number;
  spend: number;
  vendorCount: number;
  topVendor: string;
  topAmount: number;
  topPct: number;
}

export interface OverBudgetItem {
  acctCode: string;
  name: string;
  budget: number;
  actual: number;
  over: number;
  pct: number;  // over / budget
  id: string;   // fund:acct_code identifier
}

export interface AnomalyItem {
  date: string;
  fund: string;
  account: string;
  description: string;
  vendor: string;
  amount: number;
  zAcct: number;
  zFund: number;
  zMin: number;
}

export interface KPIData {
  totalRevenue: number;
  totalExpenses: number;
  net: number;
  txnCount: number;
  fundCount: number;
  accountCount: number;
}
