import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

interface Filter {
  column: string;
  op: string;
  value: string;
}

const NUM_OPS = ['gt', 'gte', 'lt', 'lte', 'eq'];
const TEXT_OPS = ['eq', 'like'];

export const ExplorerPage: React.FC = () => {
  const [dataset, setDataset] = useState('customer_360');
  const [filters, setFilters] = useState<Filter[]>([
    { column: 'total_spend', op: 'gt', value: '500' },
  ]);
  const [page, setPage] = useState(1);

  const { data: meta } = useQuery<{
    datasets: Record<string, { numeric: string[]; text: string[]; default_columns: string[] }>;
  }>({
    queryKey: ['explore-meta'],
    queryFn: () => fetchApi('/explore/datasets'),
  });

  const spec = meta?.datasets[dataset];
  const cols = spec ? [...spec.numeric, ...spec.text] : [];

  const [result, setResult] = useState<{
    columns: string[];
    items: Array<Record<string, unknown>>;
    total: number;
    total_pages: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const run = async (p: number) => {
    setRunning(true);
    setRunError('');
    try {
      const res = await fetchApi<{
        columns: string[];
        items: Array<Record<string, unknown>>;
        total: number;
        total_pages: number;
      }>('/explore', {
        method: 'POST',
        body: JSON.stringify({
          dataset,
          filters: filters.filter((f) => f.column && f.value !== ''),
          page: p,
          limit: 25,
        }),
      });
      setResult(res);
      setPage(p);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Query failed.');
    } finally {
      setRunning(false);
    }
  };

  const setFilter = (i: number, patch: Partial<Filter>) => {
    setFilters((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Data Explorer</h1>
        <p className="text-xs text-slate-400">
          Inspect analytical datasets with server-side filters. No raw SQL; columns and
          operators are whitelisted per dataset.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-slate-300">
            Dataset{' '}
            <select
              value={dataset}
              onChange={(e) => {
                setDataset(e.target.value);
                setResult(null);
                setPage(1);
              }}
              className="ml-1 py-1.5 px-3 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            >
              {Object.keys(meta?.datasets || { customer_360: null }).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => run(1)}
            disabled={running}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
          >
            {running ? 'Running...' : 'Run Query'}
          </button>
          <button
            onClick={() => setFilters([...filters, { column: cols[0] || '', op: 'gt', value: '' }])}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-md hover:bg-slate-800"
          >
            + Filter
          </button>
        </div>

        {filters.map((f, i) => {
          const isNum = spec?.numeric.includes(f.column);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={f.column}
                onChange={(e) => setFilter(i, { column: e.target.value, op: 'gt', value: f.value })}
                className="py-1.5 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              >
                {cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={f.op}
                onChange={(e) => setFilter(i, { op: e.target.value })}
                className="py-1.5 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              >
                {(isNum === false ? TEXT_OPS : NUM_OPS).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                value={f.value}
                onChange={(e) => setFilter(i, { value: e.target.value })}
                placeholder="value"
                className="py-1.5 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100 w-32"
              />
              <button
                onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-rose-400 px-1"
                title="Remove filter"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {runError && <ErrorState message={runError} onRetry={() => run(page)} />}
      {running && <LoadingState message="Running explorer query..." />}
      {!running && !runError && !result && (
        <EmptyState title="No query yet" message="Set filters and press Run Query." />
      )}

      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
          <div className="p-3 border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>
              <span className="font-semibold text-slate-100">{result.total.toLocaleString()}</span> rows match
            </span>
            <span className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => run(page - 1)}
                className="px-2 py-1 border border-slate-800 rounded bg-slate-950 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page} of {result.total_pages}
              </span>
              <button
                disabled={page >= result.total_pages}
                onClick={() => run(page + 1)}
                className="px-2 py-1 border border-slate-800 rounded bg-slate-950 disabled:opacity-40"
              >
                Next
              </button>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-semibold text-[10px] uppercase">
                  {result.columns.map((c) => (
                    <th key={c} className="py-2.5 px-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                {result.items.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800">
                    {result.columns.map((c) => (
                      <td key={c} className="py-2 px-3 text-slate-300">
                        {r[c] === null || r[c] === undefined ? '—' : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
