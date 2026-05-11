import { useRef, useEffect, useState, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Chart, registerables } from 'chart.js';
import { BudgetLayout } from '@/components/budget/BudgetLayout';
import { useTransactions, useBudgetMap } from '@/lib/budget/data';
import { computeKPIs } from '@/lib/budget/analytics';

// Register all Chart.js components
Chart.register(...registerables);

// Color palette
const COLORS = {
  accent: '#e60000',
  text: '#22262a',
  muted: '#6b7280',
  danger: '#dc3545',
  success: '#28a745',
  warn: '#f0ad4e',
  navy: 'rgba(30,58,138,0.8)',
  orange: 'rgba(249,115,22,0.8)',
};

// Format helpers
function fmt(n: number): string {
  const s = n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return n < 0 ? s : s;
}
function fmtNeg(n: number): string {
  const s = n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return n < 0 ? `<span style="color:${COLORS.danger}">${s}</span>` : s;
}
function fmtP(n: number): string {
  const s = (n * 100).toFixed(1) + '%';
  return n < 0 ? `<span style="color:${COLORS.danger}">${s}</span>` : s;
}
function logTick(v: number): string {
  if ([1e3, 1e4, 1e5, 1e6, 1e7].includes(v))
    return v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${(v / 1e3).toFixed(0)}K`;
  return '';
}
function logPctTick(v: number): string {
  if ([1, 10, 100, 1000, 10000, 100000].includes(v))
    return v >= 1000 ? `${v / 1000}K%` : `${v}%`;
  return '';
}

// Chart.js defaults
Chart.defaults.color = '#333';
Chart.defaults.borderColor = 'rgba(0,0,0,0.08)';

export default function BudgetDashboard() {
  useSeoMeta({
    title: 'Budget Dashboard - Ray County FY2025',
    description: 'Analytics dashboard for Ray County FY2025 budget',
  });

  const { data: txns, isLoading: txnsLoading } = useTransactions();
  const { data: budgetMap, isLoading: budgetLoading } = useBudgetMap();

  // Refs for chart canvases
  const monthlyRef = useRef<HTMLCanvasElement>(null);
  const monthlyChartRef = useRef<Chart | null>(null);
  const overBudgetRef = useRef<HTMLCanvasElement>(null);
  const overBudgetChartRef = useRef<Chart | null>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);
  const donutChartRef = useRef<Chart | null>(null);
  const dayVolRef = useRef<HTMLCanvasElement>(null);
  const dayVolChartRef = useRef<Chart | null>(null);

  // Accounts Over Budget filter state
  const [overTop, setOverTop] = useState(15);
  const [overMin, setOverMin] = useState(1000);
  const [overPct, setOverPct] = useState(5);
  const [overSort, setOverSort] = useState<'$' | '%'>('$');

  // Global filter state
  const [minAmt, setMinAmt] = useState(0);
  const [minZ, setMinZ] = useState(3);
  const [minTxn, setMinTxn] = useState(0);

  // Anomaly/HHI table HTML
  const [anomalyHtml, setAnomalyHtml] = useState('');
  const [hhiHtml, setHhiHtml] = useState('');
  const [vendorHtml, setVendorHtml] = useState('');

  // Anomaly count
  const [anomalyCount, setAnomalyCount] = useState(0);

  const renderAll = useCallback(() => {
    if (!txns || !budgetMap) return;

    const tx = txns.filter(t => Math.abs(t.amount) >= minAmt);

    // KPIs
    const kpis = computeKPIs(tx);

    // 1. Monthly Revenue vs Expenses
    const monthly: Record<string, { rev: number; exp: number }> = {};
    tx.forEach(t => {
      const parts = t.post_date.split('/');
      const key = `${parts[2]}-${parts[0].padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { rev: 0, exp: 0 };
      if (t.acct_type === 'Revenue') monthly[key].rev += Math.abs(t.amount);
      else monthly[key].exp += Math.abs(t.amount);
    });
    const mKeys = Object.keys(monthly).sort();
    const mLabels = mKeys.map(k => {
      const m = k.split('-')[1];
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1];
    });
    const revData = mKeys.map(k => monthly[k].rev);
    const expData = mKeys.map(k => monthly[k].exp);
    const netPct = mKeys.map(k => {
      const rev = monthly[k].rev, exp = monthly[k].exp;
      return rev > 0 ? ((rev - exp) / rev * 100) : -100;
    });

    // Breakeven plugin
    const breakevenPlugin = {
      id: 'breakeven',
      afterDraw(chart: Chart) {
        const netDs = chart.data.datasets.find(d => d.label === 'Net %');
        if (netDs && !chart.getDatasetMeta(chart.data.datasets.indexOf(netDs)).hidden) {
          const y2 = chart.scales.y2;
          if (!y2) return;
          const y = y2.getPixelForValue(0);
          const { left, right } = chart.chartArea;
          const ctx = chart.ctx;
          ctx.save();
          ctx.setLineDash([4, 4]); ctx.strokeStyle = COLORS.text; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = 'bold 10px ui-sans-serif,system-ui,sans-serif';
          ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
          ctx.fillText('breakeven', (left + right) / 2, y - 6);
          ctx.restore();
        }
      }
    };

    // Month labels plugin (drawn inside chart area)
    const monthLabelsPlugin = {
      id: 'monthLabels',
      afterDraw(chart: Chart) {
        const { left, right, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        const labels = chart.data.labels as string[];
        const sectionWidth = (right - left) / labels.length;
        ctx.save();
        ctx.font = '10px ui-sans-serif,system-ui,sans-serif';
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        labels.forEach((lbl, i) => {
          ctx.fillText(lbl, left + sectionWidth * i + sectionWidth / 2, bottom + 4);
        });
        ctx.restore();
      }
    };

    if (monthlyRef.current) {
      if (monthlyChartRef.current) monthlyChartRef.current.destroy();
      monthlyChartRef.current = new Chart(monthlyRef.current, {
        plugins: [breakevenPlugin, monthLabelsPlugin],
        type: 'bar',
        data: {
          labels: mLabels,
          datasets: [
            { label: 'Revenue', data: revData, backgroundColor: 'rgba(40,167,69,0.7)', yAxisID: 'y', order: 2 },
            { label: 'Expenses', data: expData, backgroundColor: 'rgba(220,53,69,0.7)', yAxisID: 'y', order: 2 },
            { label: 'Net %', data: netPct, type: 'line', borderColor: COLORS.text, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 6, pointBorderWidth: 0, pointBackgroundColor: netPct.map(v => v >= 0 ? 'rgba(40,167,69,0.9)' : 'rgba(220,53,69,0.9)'), yAxisID: 'y2', order: 1, tension: 0.3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label(ctx: { datasetIndex: number; parsed: { y: number } }) { return ctx.datasetIndex === 2 ? 'Net: ' + (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(1) + '%' : (ctx as { dataset: { label: string } }).dataset.label + ': $' + (ctx.parsed.y / 1e6).toFixed(2) + 'M'; } } } },
          scales: { x: { ticks: { display: false } }, y: { type: 'logarithmic', position: 'left', ticks: { callback: (v: number) => logTick(v), maxTicksLimit: 5 }, title: { display: true, text: 'Amount ($) (log)' } }, y2: { position: 'right', min: -50, max: 50, ticks: { callback: (v: number) => v + '%' }, title: { display: true, text: 'Net % of Revenue' }, grid: { drawOnChartArea: false } } }
        }
      });
    }

    // 2. Accounts Over Budget
    const acctActual: Record<string, { name: string; type: string; total: number }> = {};
    tx.forEach(t => {
      if (!acctActual[t.account]) acctActual[t.account] = { name: t.acct_name, type: t.acct_type, total: 0 };
      acctActual[t.account].total += t.amount;
    });
    const allOverBudget = Object.entries(acctActual)
      .filter(([ac, d]) => {
        if (d.type === 'Revenue') return false;
        const budget = budgetMap.get(ac);
        return budget !== undefined && budget > 0 && Math.abs(d.total) > budget;
      })
      .map(([ac, d]) => {
        const budget = budgetMap.get(ac) ?? 0;
        const actual = Math.abs(d.total);
        const over = actual - budget;
        return { name: d.name, budget, actual, over, pct: over / budget };
      })
      .sort((a, b) => b.over - a.over);

    function renderOverBudget() {
      const top = overTop;
      const minOver2 = overMin;
      const minPct2 = overPct / 100;
      const sortBy = overSort;
      const filtered = allOverBudget.filter(d => d.over >= minOver2 && d.pct >= minPct2)
        .sort((a, b) => sortBy === '%' ? b.pct - a.pct : b.over - a.over)
        .slice(0, top);
      if (overBudgetChartRef.current) {
        const chart = overBudgetChartRef.current;
        chart.data.labels = filtered.map(d => d.name);
        chart.data.datasets[0].data = filtered.map(d => d.over);
        chart.data.datasets[1].data = filtered.map(d => d.pct * 100);
        chart.update();
      }
    }

    if (overBudgetRef.current) {
      if (overBudgetChartRef.current) overBudgetChartRef.current.destroy();
      overBudgetChartRef.current = new Chart(overBudgetRef.current, {
        type: 'bar',
        data: {
          labels: allOverBudget.slice(0, overTop).map(d => d.name),
          datasets: [
            { label: '$ Over', data: allOverBudget.slice(0, overTop).map(d => d.over), backgroundColor: COLORS.navy, yAxisID: 'y' },
            { label: '% Over', data: allOverBudget.slice(0, overTop).map(d => d.pct * 100), backgroundColor: COLORS.orange, yAxisID: 'y2' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { left: 0, right: 0 } },
          plugins: { tooltip: { mode: 'index', callbacks: { label(ctx: { datasetIndex: number; dataIndex: number }) { const d = allOverBudget.slice(0, overTop)[ctx.dataIndex]; return ctx.datasetIndex === 0 ? fmt(d.over) + ' over budget' : (d.pct * 100).toFixed(1) + '% over budget'; } } } },
          scales: {
            x: { ticks: { display: false } },
            y: { type: 'logarithmic', position: 'left', ticks: { callback: (v: number) => logTick(v), maxTicksLimit: 5 }, title: { display: true, text: '$ Over (log)' }, grid: { color: 'rgba(30,58,138,0.12)' } },
            y2: { type: 'logarithmic', position: 'right', min: 1, ticks: { callback: (v: number) => logPctTick(v), maxTicksLimit: 6 }, title: { display: true, text: '% Over' }, grid: { drawOnChartArea: true, color: 'rgba(249,115,22,0.2)' } }
          }
        }
      });
      renderOverBudget();
    }

    // 3. Anomalous Transactions
    const acctStats: Record<string, { vals: number[]; avg: number; sd: number }> = {};
    const fundStats: Record<string, { vals: number[]; avg: number; sd: number }> = {};
    tx.filter(t => t.acct_type !== 'Revenue').forEach(t => {
      const a = Math.abs(t.amount);
      if (!acctStats[t.acct_code]) acctStats[t.acct_code] = { vals: [], avg: 0, sd: 0 };
      acctStats[t.acct_code].vals.push(a);
      if (!fundStats[t.fund]) fundStats[t.fund] = { vals: [], avg: 0, sd: 0 };
      fundStats[t.fund].vals.push(a);
    });
    [acctStats, fundStats].forEach(obj => Object.values(obj).forEach(s => {
      const n = s.vals.length;
      s.avg = s.vals.reduce((a, b) => a + b, 0) / n;
      s.sd = Math.sqrt(s.vals.reduce((a, v) => a + Math.pow(v - s.avg, 2), 0) / n);
    }));
    const anomalies = tx.filter(t => t.acct_type !== 'Revenue' && acctStats[t.acct_code] && acctStats[t.acct_code].sd > 0 && fundStats[t.fund] && fundStats[t.fund].sd > 0)
      .map(t => {
        const as = acctStats[t.acct_code], fs = fundStats[t.fund];
        const az = (Math.abs(t.amount) - as.avg) / as.sd;
        const fz = (Math.abs(t.amount) - fs.avg) / fs.sd;
        return { date: t.post_date, fund: t.fund, account: t.acct_name, vendor: t.description_vendor, amount: Math.abs(t.amount), az, fz };
      })
      .filter(t => t.az >= minZ)
      .sort((a, b) => Math.max(b.az, b.fz) - Math.max(a.az, a.fz))
      .slice(0, 200);
    setAnomalyCount(anomalies.length);

    // Anomaly table HTML
    const anomalyHeader = `<thead><tr><th class="znarrow" onclick="this.closest('table').dataset.sort='az'">Z (acct)</th><th class="znarrow">Z (fund)</th><th class="znarrow">Z (min)</th><th>Amount</th><th>Account</th><th>Description</th><th>Date</th></tr></thead>`;
    let anomalyRows = '';
    anomalies.forEach(d => {
      const mz = Math.min(d.az, d.fz);
      const cls = d.az > 5 ? 'high' : d.az > 4 ? 'med' : 'low';
      const fcls = d.fz > 5 ? 'high' : d.fz > 4 ? 'med' : 'low';
      const mcls = mz > 5 ? 'high' : mz > 4 ? 'med' : 'low';
      anomalyRows += `<tr><td><span class="badge badge-${cls}">${d.az.toFixed(1)}</span></td><td><span class="badge badge-${fcls}">${d.fz.toFixed(1)}</span></td><td><span class="badge badge-${mcls}">${mz.toFixed(1)}</span></td><td class="money">${fmt(d.amount)}</td><td>${d.account}</td><td title="${d.vendor.replace(/"/g, '&quot;')}">${d.vendor.slice(0, 50)}${d.vendor.length > 50 ? '...' : ''}</td><td>${d.date}</td></tr>`;
    });
    setAnomalyHtml(`<div class="table-wrap"><table>${anomalyHeader}<tbody>${anomalyRows}</tbody></table></div>`);

    // 4. HHI
    const fundVendors: Record<string, { name: string; vendors: Record<string, number> }> = {};
    tx.filter(t => t.acct_type !== 'Revenue' && t.description_vendor.trim()).forEach(t => {
      const f = t.fund, v = t.description_vendor.trim();
      if (!fundVendors[f]) fundVendors[f] = { name: t.section, vendors: {} };
      if (!fundVendors[f].vendors[v]) fundVendors[f].vendors[v] = 0;
      fundVendors[f].vendors[v] += Math.abs(t.amount);
    });
    const hhiData = Object.entries(fundVendors).map(([f, d]) => {
      const totals = Object.values(d.vendors);
      const fundTotal = totals.reduce((a, b) => a + b, 0);
      const hhi = totals.reduce((a, v) => a + Math.pow(v / fundTotal, 2), 0);
      const sorted = Object.entries(d.vendors).sort((a, b) => b[1] - a[1]);
      return { fund: f, name: d.name, count: totals.length, hhi, spend: fundTotal, topVendor: sorted[0]?.[0] ?? '', topAmount: sorted[0]?.[1] ?? 0, topPct: sorted[0] ? sorted[0][1] / fundTotal : 0 };
    }).filter(d => d.count > 1).sort((a, b) => b.topPct - a.topPct);

    let hhiRows = '';
    hhiData.forEach(d => {
      const cls = d.hhi > 0.25 ? 'high' : d.hhi > 0.15 ? 'med' : 'low';
      hhiRows += `<tr><td><span class="badge badge-${cls}">${d.hhi.toFixed(4)}</span></td><td class="money">${fmt(d.spend)}</td><td>${fmtP(d.topPct)}</td><td class="money">${fmt(d.topAmount)}</td><td>${d.count}</td><td>${d.name}</td><td>${d.topVendor.slice(0, 30)}</td></tr>`;
    });
    const hhiHeader = `<thead><tr><th>HHI</th><th>Fund Spend</th><th>Top %</th><th>Top $</th><th>Vendors</th><th>Fund</th><th>Top Vendor</th></tr></thead>`;
    setHhiHtml(`<div class="table-wrap"><table>${hhiHeader}<tbody>${hhiRows}</tbody></table></div>`);

    // 5. Top Vendors
    const vendors: Record<string, { total: number; count: number }> = {};
    tx.filter(t => t.acct_type !== 'Revenue').forEach(t => {
      const v = t.description_vendor.trim();
      if (!v) return;
      if (!vendors[v]) vendors[v] = { total: 0, count: 0 };
      vendors[v].total += Math.abs(t.amount);
      vendors[v].count++;
    });
    const topVendors = Object.entries(vendors)
      .map(([v, d]) => ({ vendor: v, total: d.total, count: d.count }))
      .filter(v => v.count >= minTxn)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    let vendorRows = '';
    topVendors.forEach(d => {
      vendorRows += `<tr><td data-v="${d.total}" class="money">${fmt(d.total)}</td><td data-v="${d.vendor}">${d.vendor}</td></tr>`;
    });
    const vendorHeader = `<thead><tr><th>Total Spend</th><th>Vendor</th></tr></thead>`;
    setVendorHtml(`<div class="table-wrap"><table>${vendorHeader}<tbody>${vendorRows}</tbody></table></div>`);

    // 6. Amount Distribution
    const buckets: Record<string, number> = { 'micro (<$100)': 0, 'small ($100-$1K)': 0, 'medium ($1K-$10K)': 0, 'large ($10K-$100K)': 0, 'mega (>$100K)': 0 };
    tx.filter(t => t.acct_type !== 'Revenue').forEach(t => {
      const a = Math.abs(t.amount);
      if (a < 100) buckets['micro (<$100)']++;
      else if (a < 1000) buckets['small ($100-$1K)']++;
      else if (a < 10000) buckets['medium ($1K-$10K)']++;
      else if (a < 100000) buckets['large ($10K-$100K)']++;
      else buckets['mega (>$100K)']++;
    });
    const bVals = Object.values(buckets);
    const bTotal = bVals.reduce((a, b) => a + b, 0);

    if (donutRef.current) {
      donutChartRef.current?.destroy();
      donutChartRef.current = new Chart(donutRef.current, {
        type: 'doughnut',
        plugins: [{
          id: 'centerText', afterDraw(chart) {
            const { ctx } = chart; const { top, bottom, left, right } = chart.chartArea;
            const cx = (left + right) / 2, cy = (top + bottom) / 2;
            ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = 'bold 18px ui-sans-serif,system-ui,sans-serif'; ctx.fillStyle = COLORS.text;
            ctx.fillText(bTotal.toLocaleString(), cx, cy - 8);
            ctx.font = '11px ui-sans-serif,system-ui,sans-serif'; ctx.fillStyle = COLORS.muted;
            ctx.fillText('expense txns', cx, cy + 10);
            ctx.restore();
          }
        }, {
          id: 'pctLabels', afterDraw(chart) {
            const { ctx } = chart; const meta = chart.getDatasetMeta(0);
            meta.data.forEach((arc, i) => {
              const pct = (bVals[i] / bTotal * 100).toFixed(1) + '%';
              const { x, y } = arc.tooltipPosition();
              ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
              ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
              ctx.fillText(pct, x, y);
              ctx.restore();
            });
          }
        }],
        data: {
          labels: Object.keys(buckets),
          datasets: [{ data: bVals, backgroundColor: ['#4472C4', '#7c6df0', '#f0ad4e', '#dc3545', '#e040fb'] }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '55%',
          plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } }, tooltip: { callbacks: { label(ctx) { const v = ctx.parsed; const pct = (v / bTotal * 100).toFixed(1); return ctx.label + ': ' + v.toLocaleString() + ' (' + pct + '%)'; } } } }
        }
      });
    }

    // 7. Day Volume
    const dayVol: Record<number, { count: number; total: number }> = {};
    tx.filter(t => t.acct_type !== 'Revenue').forEach(t => {
      const d = parseInt(t.post_date.split('/')[1]);
      if (!dayVol[d]) dayVol[d] = { count: 0, total: 0 };
      dayVol[d].count++; dayVol[d].total += Math.abs(t.amount);
    });
    const dKeys = Object.keys(dayVol).sort((a, b) => parseInt(a) - parseInt(b));

    if (dayVolRef.current) {
      dayVolChartRef.current?.destroy();
      dayVolChartRef.current = new Chart(dayVolRef.current, {
        type: 'bar',
        data: {
          labels: dKeys,
          datasets: [{ label: 'Volume ($)', data: dKeys.map(d => dayVol[parseInt(d)].total), backgroundColor: 'rgba(68,114,196,0.6)' }]
        },
        options: {
          responsive: true,
          scales: {
            y: { type: 'logarithmic', ticks: { callback(v: number) { if (v >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M'; if (v >= 1e3) return '$' + (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'K'; if (v >= 1) return '$' + v; return ''; }, maxTicksLimit: 8 } }
          }
        }
      });
    }

    // Update KPI display
    const kpiEl = document.getElementById('budget-kpis');
    if (kpiEl) {
      kpiEl.innerHTML = [
        { label: 'Total Revenue', value: fmt(kpis.totalRevenue), cls: 'surplus' },
        { label: 'Total Expenses', value: fmt(kpis.totalExpenses), cls: 'deficit' },
        { label: 'Net', value: fmt(kpis.net), cls: kpis.net >= 0 ? 'surplus' : 'deficit' },
        { label: 'Transactions', value: kpis.txnCount.toLocaleString(), cls: '' },
      ].map(k => `<div class="kpi ${k.cls}"><div class="val">${k.value}</div><div class="lbl">${k.label}</div></div>`).join('');
    }
  }, [txns, budgetMap, minAmt, minZ, minTxn, overTop, overMin, overPct, overSort]);

  useEffect(() => {
    if (txns && budgetMap) renderAll();
    return () => {
      monthlyChartRef.current?.destroy();
      overBudgetChartRef.current?.destroy();
      donutChartRef.current?.destroy();
      dayVolChartRef.current?.destroy();
    };
  }, [txns, budgetMap, renderAll]);

  if (txnsLoading || budgetLoading || !txns || !budgetMap) {
    return (
      <BudgetLayout>
        <div className="flex items-center justify-center py-20 text-gray-500">
          Loading budget data...
        </div>
      </BudgetLayout>
    );
  }

  return (
    <BudgetLayout>
      {/* Inline styles matching static site */}
      <style>{`
        .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; max-width:1600px; margin:16px auto; padding:0 24px; }
        .kpi { background:linear-gradient(to bottom right,rgba(230,0,0,0.05),transparent); border-radius:12px; padding:14px 16px; text-align:center; border-top:3px solid #e60000; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:1px solid rgba(230,0,0,0.2); }
        .kpi .val { font-size:1.3em; font-weight:700; color:#22262a; font-family:'SF Mono',Consolas,monospace; }
        .kpi .lbl { color:#6b7280; font-size:0.8em; margin-top:2px; }
        .kpi.surplus .val { color:#28a745; }
        .kpi.deficit .val { color:#dc3545; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; max-width:1600px; margin:16px auto; padding:0 24px; }
        .card { background:linear-gradient(to bottom right,rgba(230,0,0,0.05),transparent); border-radius:12px; padding:14px; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:1px solid rgba(230,0,0,0.2); transition:all 0.3s; }
        .card:hover { border-color:rgba(230,0,0,0.4); transform:translateY(-4px); box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); }
        .card.full { grid-column:1/-1; }
        .card h2 { font-size:0.95em; color:#e60000; margin-bottom:10px; font-weight:600; cursor:pointer; user-select:none; }
        .card canvas { max-height:300px; }
        .table-wrap { max-height:340px; overflow-y:auto; }
        table { width:100%; border-collapse:collapse; font-size:0.82em; }
        th { position:sticky; top:0; background:#e60000; color:white; text-align:left; padding:7px 8px; font-size:0.85em; cursor:pointer; user-select:none; }
        th:hover { background:#cc0000; }
        td { padding:6px 8px; border-bottom:1px solid #e5e7eb; }
        tr:hover { background:#f9fafb; }
        .badge { display:inline-block; padding:2px 7px; border-radius:4px; font-size:0.78em; font-weight:600; }
        .badge-high { background:#f8d7da; color:#22262a; }
        .badge-med { background:#fff3cd; color:#22262a; }
        .badge-low { background:#d4edda; color:#22262a; }
        .money { text-align:right; font-family:'SF Mono',Consolas,monospace; font-size:0.82em; white-space:nowrap; }
        .neg { color:#dc3545; }
        .znarrow { width:60px; min-width:50px; }
        .info { background:#f9fafb; border-left:3px solid #22262a; padding:10px 14px; border-radius:0 8px 8px 0; font-size:0.85em; line-height:1.5; color:#22262a; margin:0 24px; max-width:1552px; }
        .info strong { color:#22262a; }
        .info ul { margin:6px 0 0 16px; }
        .filters { display:flex; gap:12px; justify-content:center; padding:14px 24px; flex-wrap:wrap; background:white; border-bottom:1px solid #e5e7eb; }
        .filters label { display:flex; flex-direction:column; gap:4px; font-size:0.75em; color:#6b7280; }
        .filters input { padding:7px 10px; border:1px solid #e5e7eb; border-radius:6px; font-size:0.88em; width:160px; }
        .filters button { align-self:flex-end; background:#e60000; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-weight:600; }
        .filters button:hover { background:#cc0000; }
        @media (max-width:900px) { .grid { grid-template-columns:1fr; } .kpi-grid { grid-template-columns:1fr 1fr; } }
      `}</style>

      {/* Global Filters */}
      <div className="filters">
        <label>Min Amount ($)<input type="number" value={minAmt} min={0} step={1000} onChange={e => setMinAmt(parseFloat(e.target.value) || 0)} /></label>
        <label>Min Z-Score<input type="number" value={minZ} min={0} step={0.5} onChange={e => setMinZ(parseFloat(e.target.value) || 3)} /></label>
        <label>Min Transactions<input type="number" value={minTxn} min={0} step={1} onChange={e => setMinTxn(parseInt(e.target.value) || 0)} /></label>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" id="budget-kpis" />

      {/* Card Grid */}
      <div className="grid">
        {/* Row 1: Monthly Revenue + Accounts Over Budget */}
        <div className="card">
          <h2>Monthly Revenue vs Expenses</h2>
          <div style={{ height: 28 }} /> {/* Spacer to match accounts card filter row */}
          <canvas ref={monthlyRef} style={{ maxHeight: 300 }} />
        </div>

        <div className="card">
          <h2>Accounts Over Budget</h2>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8, fontSize:'0.82em' }}>
            <label>Top <input type="number" value={overTop} min={1} max={100} style={{ width:60 }} onChange={e => setOverTop(parseInt(e.target.value) || 15)} /></label>
            <label>Min $ Over <input type="number" value={overMin} min={0} style={{ width:80 }} onChange={e => setOverMin(parseFloat(e.target.value) || 0)} /></label>
            <label>Min % Over <input type="number" value={overPct} min={0} style={{ width:60 }} onChange={e => setOverPct(parseFloat(e.target.value) || 0)} /></label>
            <label>Sort by <select value={overSort} onChange={e => setOverSort(e.target.value as '$' | '%')}>
              <option value="$">$ Over</option>
              <option value="%">% Over</option>
            </select></label>
          </div>
          <canvas ref={overBudgetRef} style={{ maxHeight: 300 }} />
        </div>

        {/* Row 2: Anomalous Transactions */}
        <div className="card full">
          <h2>Anomalous Transactions</h2>
          <p style={{ fontSize:'0.7em', color:'#888', marginBottom:6 }}>{anomalyCount} flagged transactions</p>
          <div dangerouslySetInnerHTML={{ __html: anomalyHtml }} />
        </div>

        {/* Anomaly info */}
        <div className="card full info">
          <strong>About Anomalous Transactions</strong><br />
          TLDR: Higher Z-score = More anomalous.<br />
          Flagged using <strong>Z-scores</strong>: each transaction is compared to the average amount for its account. A Z-score &gt; 3 means the amount is more than 3 standard deviations above the account average.
        </div>

        {/* Row 3: HHI */}
        <div className="card full">
          <h2>Vendor Concentration Risk (HHI by Fund)</h2>
          <div dangerouslySetInnerHTML={{ __html: hhiHtml }} />
        </div>

        {/* HHI info */}
        <div className="card full info">
          <strong>What is the Herfindahl-Hirschman Index (HHI)?</strong><br />
          HHI measures vendor concentration within a fund. It sums the squared market share of each vendor.
          <ul>
            <li><strong>HHI &lt; 0.15</strong> — Competitive (many vendors)</li>
            <li><strong>HHI 0.15-0.25</strong> — Moderate concentration</li>
            <li><strong>HHI &gt; 0.25</strong> — High concentration (few vendors dominate)</li>
          </ul>
        </div>

        {/* Row 4: Top Vendors */}
        <div className="card full">
          <h2>Top Vendors by Total Spend</h2>
          <div dangerouslySetInnerHTML={{ __html: vendorHtml }} />
        </div>

        {/* Row 5: Distribution + Day Volume */}
        <div className="card">
          <h2>Expense Amount Distribution</h2>
          <canvas ref={donutRef} style={{ width:'100%', height:340 }} />
        </div>

        <div className="card">
          <h2>Spending Volume by Day of Month</h2>
          <canvas ref={dayVolRef} style={{ maxHeight: 300 }} />
        </div>
      </div>
    </BudgetLayout>
  );
}
