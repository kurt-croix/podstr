import { useState, useMemo, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Sort comparator. If omitted, column is not sortable */
  sort?: (a: T, b: T) => number;
  /** Width class, e.g. "w-16" */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'right';
}

interface SortableTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Max visible height before scrolling (px) */
  maxHeight?: number;
  className?: string;
}

/** Generic sortable table with sticky headers */
export function SortableTable<T>({
  data,
  columns,
  maxHeight = 340,
  className = '',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.sort) return data;
    const sorted = [...data].sort(col.sort);
    return sortDir === 'desc' ? sorted : sorted.reverse();
  }, [data, sortKey, sortDir, columns]);

  const handleSort = (key: string) => {
    const col = columns.find(c => c.key === key);
    if (!col?.sort) return;
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div style={{ maxHeight }} className="overflow-y-auto">
      <table className={`w-full border-collapse text-xs ${className}`}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`
                  sticky top-0 bg-[#e60000] text-white text-left px-2 py-1.5
                  text-[0.8em] cursor-pointer select-none whitespace-nowrap
                  ${col.align === 'right' ? 'text-right' : ''}
                  ${col.sort ? 'hover:bg-[#cc0000]' : ''}
                  ${col.width ?? ''}
                `}
              >
                {col.header}
                {col.sort && (
                  <span className="ml-1 opacity-50 text-[0.7em]">
                    {sortKey === col.key
                      ? sortDir === 'asc' ? ' ↑' : ' ↓'
                      : ' ↕'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`
                    px-2 py-1 border-b border-gray-100 whitespace-nowrap
                    ${col.align === 'right' ? 'text-right' : ''}
                    ${col.width ?? ''}
                  `}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Format a number as currency, wrapping negatives in red */
export function fmtMoney(n: number): ReactNode {
  const s = n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return n < 0 ? <span className="text-red-600">{s}</span> : s;
}

/** Format a percentage, wrapping negatives in red */
export function fmtPctCell(n: number): ReactNode {
  const s = (n * 100).toFixed(1) + '%';
  return n < 0 ? <span className="text-red-600">{s}</span> : s;
}

/** Right-aligned money cell with monospace font */
export function moneyCell(n: number): ReactNode {
  const s = n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <span className={`font-mono text-[0.82em] whitespace-nowrap ${n < 0 ? 'text-red-600' : ''}`}>
      {s}
    </span>
  );
}
