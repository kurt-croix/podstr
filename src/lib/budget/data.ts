import { useQuery } from '@tanstack/react-query';
import type { Transaction, BudgetRow, AccountRow } from './types';

const BASE = '/podstr/data';

/** Parse a TSV string into an array of objects */
function parseTSV<T>(text: string): T[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Handle BOM in first header column
  const headers = lines[0].replace(/^\uFEFF/, '').split('\t').map(h => h.trim());

  return lines.slice(1).map(line => {
    const vals = line.split('\t');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj as unknown as T;
  });
}

function parseTransactions(text: string): Transaction[] {
  return parseTSV<Record<string, string>>(text).map(r => ({
    txn_id: parseInt(r.txn_id) || 0,
    post_date: r.post_date,
    packet_number: r.packet_number,
    source_transaction: r.source_transaction,
    description_vendor: r.description_vendor,
    amount: parseFloat(r.amount) || 0,
    account: r.account,
    fund: r.fund,
    sub_fund: r.sub_fund,
    acct_code: r.acct_code,
    acct_name: r.acct_name,
    section: r.section,
    acct_type: r.acct_type,
    category: r.category,
    consolidated_name: r.consolidated_name,
  }));
}

function parseBudgets(text: string): BudgetRow[] {
  return parseTSV<Record<string, string>>(text).map(r => ({
    acct_code: r.acct_code,
    canonical_name: r.canonical_name,
    acct_type: r.acct_type,
    num_funds: parseInt(r.num_funds) || 0,
    num_accounts: parseInt(r.num_accounts) || 0,
    num_transactions: parseInt(r.num_transactions) || 0,
    fund_sources: r.fund_sources,
    sections: r.sections,
    fiscal_budget: parseFloat(r.fiscal_budget) || 0,
    total_activity: parseFloat(r.total_activity) || 0,
    ending_balance: parseFloat(r.ending_balance) || 0,
    budget_remaining: parseFloat(r.budget_remaining) || 0,
    pct_remaining: parseFloat(r.pct_remaining) || 0,
  }));
}

function parseAccounts(text: string): AccountRow[] {
  return parseTSV<Record<string, string>>(text).map(r => ({
    account: r.Account,
    fiscal_budget: parseFloat(r['Fiscal Budget (PDF)']) || 0,
  }));
}

/** Fetch and parse transactions TSV */
async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch(`${BASE}/transactions.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return parseTransactions(await res.text());
}

/** Fetch and parse budgets TSV */
async function fetchBudgets(): Promise<BudgetRow[]> {
  const res = await fetch(`${BASE}/budgets.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch budgets: ${res.status}`);
  return parseBudgets(await res.text());
}

/** Fetch and parse accounts TSV */
async function fetchAccounts(): Promise<AccountRow[]> {
  const res = await fetch(`${BASE}/accounts.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
  return parseAccounts(await res.text());
}

/** TanStack Query hook for transactions */
export function useTransactions() {
  return useQuery({
    queryKey: ['budget-transactions'],
    queryFn: fetchTransactions,
    staleTime: Infinity, // Static data, never refetch
  });
}

/** TanStack Query hook for budgets */
export function useBudgets() {
  return useQuery({
    queryKey: ['budget-budgets'],
    queryFn: fetchBudgets,
    staleTime: Infinity,
  });
}

/** TanStack Query hook for accounts */
export function useAccounts() {
  return useQuery({
    queryKey: ['budget-accounts'],
    queryFn: fetchAccounts,
    staleTime: Infinity,
  });
}

/** Get budget map: full account code → budget amount (from bud_data.js) */
export function useBudgetMap() {
  return useQuery({
    queryKey: ['budget-map'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/budget_lookup.json`);
      if (!res.ok) throw new Error(`Failed to fetch budget lookup: ${res.status}`);
      const obj: Record<string, number> = await res.json();
      return new Map(Object.entries(obj));
    },
    staleTime: Infinity,
  });
}
