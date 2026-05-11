/**
 * Pure analytics functions for the Ray County FY2025 budget data.
 * Ported from dashboard.html — no React dependencies.
 */
import type {
  Transaction, MonthlyData, VendorData, BucketData, DayVolume,
  HHIData, OverBudgetItem, AnomalyItem, KPIData,
} from './types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Get expenses (non-revenue transactions), optionally filtered by min amount */
export function getExpenses(txns: Transaction[], minAmt = 0): Transaction[] {
  return txns.filter(t => t.acct_type !== 'Revenue' && Math.abs(t.amount) >= minAmt);
}

/** Monthly revenue vs expenses aggregated from transactions */
export function computeMonthly(txns: Transaction[]): MonthlyData[] {
  const monthly: Record<string, { rev: number; exp: number }> = {};

  for (const t of txns) {
    const parts = t.post_date.split('/');
    const key = `${parts[2]}-${parts[0].padStart(2, '0')}`;
    if (!monthly[key]) monthly[key] = { rev: 0, exp: 0 };
    if (t.acct_type === 'Revenue') {
      monthly[key].rev += Math.abs(t.amount);
    } else {
      monthly[key].exp += Math.abs(t.amount);
    }
  }

  return Object.keys(monthly).sort().map(key => {
    const [y, m] = key.split('-');
    const rev = monthly[key].rev;
    const exp = monthly[key].exp;
    return {
      month: key,
      label: MONTH_NAMES[parseInt(m) - 1],
      revenue: rev,
      expenses: exp,
      netPct: rev > 0 ? ((rev - exp) / rev) * 100 : -100,
    };
  });
}

/** Top vendors by total spend */
export function computeTopVendors(txns: Transaction[], minTxns = 0): VendorData[] {
  const vendors: Record<string, { total: number; count: number }> = {};

  for (const t of getExpenses(txns)) {
    const v = t.description_vendor.trim();
    if (!v) continue;
    if (!vendors[v]) vendors[v] = { total: 0, count: 0 };
    vendors[v].total += Math.abs(t.amount);
    vendors[v].count++;
  }

  return Object.entries(vendors)
    .map(([vendor, d]) => ({ vendor, total: d.total, count: d.count }))
    .filter(v => v.count >= minTxns)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
}

/** Expense amount distribution by bucket */
export function computeAmountDistribution(txns: Transaction[]): BucketData[] {
  const buckets: Record<string, number> = {
    'micro (<$100)': 0,
    'small ($100-$1K)': 0,
    'medium ($1K-$10K)': 0,
    'large ($10K-$100K)': 0,
    'mega (>$100K)': 0,
  };

  for (const t of getExpenses(txns)) {
    const a = Math.abs(t.amount);
    if (a < 100) buckets['micro (<$100)']++;
    else if (a < 1000) buckets['small ($100-$1K)']++;
    else if (a < 10000) buckets['medium ($1K-$10K)']++;
    else if (a < 100000) buckets['large ($10K-$100K)']++;
    else buckets['mega (>$100K)']++;
  }

  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return Object.entries(buckets).map(([bucket, count]) => ({
    bucket,
    count,
    pct: total > 0 ? count / total : 0,
  }));
}

/** Spending volume by day of month */
export function computeDayVolume(txns: Transaction[]): DayVolume[] {
  const days: Record<number, { count: number; total: number }> = {};

  for (const t of getExpenses(txns)) {
    const d = parseInt(t.post_date.split('/')[1]);
    if (!days[d]) days[d] = { count: 0, total: 0 };
    days[d].count++;
    days[d].total += Math.abs(t.amount);
  }

  return Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    count: days[i + 1]?.count ?? 0,
    total: days[i + 1]?.total ?? 0,
  }));
}

/** Herfindahl-Hirschman Index (vendor concentration) per fund */
export function computeHHI(txns: Transaction[]): HHIData[] {
  const fundVendors: Record<string, { name: string; vendors: Record<string, number> }> = {};

  for (const t of getExpenses(txns).filter(t => t.description_vendor.trim())) {
    const f = t.fund;
    const v = t.description_vendor.trim();
    if (!fundVendors[f]) fundVendors[f] = { name: t.section, vendors: {} };
    if (!fundVendors[f].vendors[v]) fundVendors[f].vendors[v] = 0;
    fundVendors[f].vendors[v] += Math.abs(t.amount);
  }

  return Object.entries(fundVendors)
    .map(([fund, d]) => {
      const totals = Object.values(d.vendors);
      const fundTotal = totals.reduce((a, b) => a + b, 0);
      const hhi = fundTotal > 0
        ? totals.reduce((a, v) => a + Math.pow(v / fundTotal, 2), 0)
        : 0;
      const sorted = Object.entries(d.vendors).sort((a, b) => b[1] - a[1]);
      return {
        fund,
        name: d.name,
        vendorCount: totals.length,
        hhi,
        spend: fundTotal,
        topVendor: sorted[0]?.[0] ?? '',
        topAmount: sorted[0]?.[1] ?? 0,
        topPct: sorted[0] && fundTotal > 0 ? sorted[0][1] / fundTotal : 0,
      };
    })
    .filter(d => d.vendorCount > 1)
    .sort((a, b) => b.hhi - a.hhi);
}

/** Accounts where actual spending exceeded budget */
export function computeOverBudget(
  txns: Transaction[],
  budgetMap: Map<string, number>,
): OverBudgetItem[] {
  // Aggregate actual spending per acct_code
  const acctActual: Record<string, { name: string; type: string; total: number }> = {};

  for (const t of txns) {
    const ac = t.acct_code;
    if (!acctActual[ac]) acctActual[ac] = { name: t.acct_name, type: t.acct_type, total: 0 };
    acctActual[ac].total += t.amount;
  }

  return Object.entries(acctActual)
    .filter(([, d]) => {
      if (d.type === 'Revenue') return false;
      const budget = budgetMap.get(acctActual[Object.keys(acctActual).find(k => acctActual[k] === d)?.[0] ?? ''] ?? '') ?? budgetMap.get(d.name);
      // Match by acct_code in the full account format (e.g., "01-01-47000")
      return budget !== undefined && budget > 0 && Math.abs(d.total) > budget;
    })
    .map(([ac, d]) => {
      const budget = budgetMap.get(ac) ?? 0;
      const actual = Math.abs(d.total);
      const over = actual - budget;
      return {
        acctCode: ac,
        name: d.name,
        budget,
        actual,
        over,
        pct: budget > 0 ? over / budget : 0,
      };
    })
    .sort((a, b) => b.over - a.over);
}

/** Anomalous transactions using Z-score on account and fund distributions */
export function computeAnomalies(
  txns: Transaction[],
  minZ = 3,
  minAmt = 0,
): AnomalyItem[] {
  const expenses = getExpenses(txns, minAmt);

  // Compute mean/std per account code
  const acctStats: Record<string, { vals: number[]; avg: number; sd: number }> = {};
  const fundStats: Record<string, { vals: number[]; avg: number; sd: number }> = {};

  for (const t of expenses) {
    const a = Math.abs(t.amount);
    const ac = t.acct_code;
    const f = t.fund;

    if (!acctStats[ac]) acctStats[ac] = { vals: [], avg: 0, sd: 0 };
    acctStats[ac].vals.push(a);

    if (!fundStats[f]) fundStats[f] = { vals: [], avg: 0, sd: 0 };
    fundStats[f].vals.push(a);
  }

  // Compute mean and std deviation
  const computeStats = (obj: Record<string, { vals: number[]; avg: number; sd: number }>) => {
    for (const s of Object.values(obj)) {
      const n = s.vals.length;
      s.avg = s.vals.reduce((a, b) => a + b, 0) / n;
      s.sd = Math.sqrt(s.vals.reduce((a, v) => a + Math.pow(v - s.avg, 2), 0) / n);
    }
  };
  computeStats(acctStats);
  computeStats(fundStats);

  return expenses
    .filter(t => {
      const as = acctStats[t.acct_code];
      const fs = fundStats[t.fund];
      return as && as.sd > 0 && fs && fs.sd > 0;
    })
    .map(t => {
      const as = acctStats[t.acct_code];
      const fs = fundStats[t.fund];
      const zAcct = (Math.abs(t.amount) - as.avg) / as.sd;
      const zFund = (Math.abs(t.amount) - fs.avg) / fs.sd;
      return {
        date: t.post_date,
        fund: t.fund,
        account: t.acct_name,
        description: t.description_vendor,
        vendor: t.description_vendor.trim(),
        amount: Math.abs(t.amount),
        zAcct,
        zFund,
        zMin: Math.min(zAcct, zFund),
      };
    })
    .filter(t => t.zAcct >= minZ)
    .sort((a, b) => Math.max(b.zAcct, b.zFund) - Math.max(a.zAcct, a.zFund))
    .slice(0, 200);
}

/** Top-level KPIs for the budget header */
export function computeKPIs(txns: Transaction[]): KPIData {
  let totalRevenue = 0;
  let totalExpenses = 0;
  const funds = new Set<string>();
  const accounts = new Set<string>();

  for (const t of txns) {
    funds.add(t.fund);
    accounts.add(t.acct_code);
    if (t.acct_type === 'Revenue') {
      totalRevenue += Math.abs(t.amount);
    } else {
      totalExpenses += Math.abs(t.amount);
    }
  }

  return {
    totalRevenue,
    totalExpenses,
    net: totalRevenue - totalExpenses,
    txnCount: txns.length,
    fundCount: funds.size,
    accountCount: accounts.size,
  };
}

/** Format a number as currency string */
export function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Format a number as percentage */
export function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

/** Format for log-scale tick marks */
export function logTickFormatter(value: number): string {
  if ([1e3, 1e4, 1e5, 1e6, 1e7].includes(value)) {
    return value >= 1e6
      ? `$${(value / 1e6).toFixed(0)}M`
      : `$${(value / 1e3).toFixed(0)}K`;
  }
  return '';
}
