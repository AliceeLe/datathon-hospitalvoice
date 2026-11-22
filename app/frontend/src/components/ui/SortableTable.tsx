import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export type Column<R> = {
  key: string; label: string; numeric?: boolean;
  value: (r: R) => string | number | null; render?: (r: R) => ReactNode;
};
type Props<R> = { columns: Column<R>[]; rows: R[]; rowKey: (r: R) => string; caption: string; initialSort?: string; onRowClick?: (r: R) => void; maxRows?: number };

/** Sortable table with scope and aria-sort. Numbers use the mono font. */
export function SortableTable<R>({ columns, rows, rowKey, caption, initialSort, onRowClick, maxRows }: Props<R>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ? { key: initialSort, dir: 'asc' } : null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      if (x === null || x === '') return 1;
      if (y === null || y === '') return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort, columns]);
  const shown = maxRows ? sorted.slice(0, maxRows) : sorted;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cx('whitespace-nowrap px-4 py-2 font-medium text-ink-muted', c.numeric ? 'text-right' : 'text-left')}>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1 hover:text-ink"
                          onClick={() => setSort({ key: c.key, dir: active && sort!.dir === 'asc' ? 'desc' : 'asc' })}>
                    {c.label}
                    {active ? (sort!.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)
                      : <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-sunken')}>
              {columns.map((c, i) => {
                const content = c.render ? c.render(r) : (c.value(r) ?? '–');
                return i === 0
                  ? <th key={c.key} scope="row" className="min-w-32 px-4 py-2 text-left font-medium">{content}</th>
                  : <td key={c.key} className={cx('px-4 py-2', c.numeric ? 'whitespace-nowrap text-right font-mono' : 'min-w-40 text-left')}>{content}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
