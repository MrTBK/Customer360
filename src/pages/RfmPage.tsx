import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { Grid3X3, HelpCircle, CheckCircle2 } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

export const RfmPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<{
    rfm_matrix: Array<{ r_score: number; f_score: number; m_score: number; customer_count: number; avg_spend: number }>;
    recency_quintiles: Array<{ r_score: number; count: number; min_days: number; max_days: number }>;
    frequency_quintiles: Array<{ f_score: number; count: number; min_orders: number; max_orders: number }>;
    monetary_quintiles: Array<{ m_score: number; count: number; min_spend: number; max_spend: number }>;
  }>({
    queryKey: ['rfm-summary'],
    queryFn: () => fetchApi('/rfm'),
  });

  if (isLoading) {
    return <LoadingState message="Loading RFM model matrices..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/rfm.'}
        onRetry={() => refetch()}
      />
    );
  }

  const matrix = data?.rfm_matrix || [];
  const rQuintiles = data?.recency_quintiles || [];
  const fQuintiles = data?.frequency_quintiles || [];
  const mQuintiles = data?.monetary_quintiles || [];

  if (matrix.length === 0) {
    return (
      <EmptyState
        title="No RFM matrix published"
        message="analytics.customer_rfm is empty. Run the pipeline to compute RFM scores."
      />
    );
  }

  // 5x5 R vs F cell map
  const cellMap: Record<string, { count: number; spend: number }> = {};
  for (let r = 1; r <= 5; r++) {
    for (let f = 1; f <= 5; f++) {
      cellMap[`${r}_${f}`] = { count: 0, spend: 0 };
    }
  }

  matrix.forEach((cell) => {
    const key = `${cell.r_score}_${cell.f_score}`;
    if (cellMap[key]) {
      cellMap[key].count += cell.customer_count;
      cellMap[key].spend += cell.avg_spend * cell.customer_count;
    }
  });

  const getCellColor = (count: number) => {
    if (count > 15000) return 'bg-blue-700 text-white';
    if (count > 7000) return 'bg-blue-600 text-white';
    if (count > 3000) return 'bg-blue-500 text-white';
    if (count > 1000) return 'bg-blue-400 text-white';
    if (count > 200) return 'bg-blue-200 text-blue-950';
    if (count > 0) return 'bg-blue-100 text-blue-100';
    return 'bg-slate-900 text-slate-500';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">RFM Behavioral Analytics</h1>
        <p className="text-xs text-slate-400">
          Standardized 1–5 scoring across Recency, Frequency, and Monetary dimensions.
        </p>
      </div>

      {/* RFM 5x5 Matrix Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100">5x5 Recency vs Frequency Grid</h2>
            <p className="text-xs text-slate-400">
              Vertical axis: Recency Score (5 = Recent, 1 = Lapsed). Horizontal axis: Frequency Score (5 = Loyal Multi-Buyer, 1 = Single Purchase).
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-3 h-3 bg-blue-100 rounded-xs inline-block" />
            <span>Low</span>
            <span className="w-3 h-3 bg-blue-700 rounded-xs inline-block ml-2" />
            <span>High Density</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            <div className="grid grid-cols-6 gap-2 text-center text-xs">
              {/* Header Row */}
              <div className="font-bold text-slate-500 text-[10px] uppercase py-2">R \ F Score</div>
              <div className="font-bold text-slate-300 py-2">F = 1 (1x)</div>
              <div className="font-bold text-slate-300 py-2">F = 2</div>
              <div className="font-bold text-slate-300 py-2">F = 3 (2x)</div>
              <div className="font-bold text-slate-300 py-2">F = 4 (3x)</div>
              <div className="font-bold text-slate-300 py-2">F = 5 (4x+)</div>

              {/* Matrix Rows: R = 5 down to 1 */}
              {[5, 4, 3, 2, 1].map((r) => (
                <React.Fragment key={r}>
                  <div className="font-bold text-slate-300 flex items-center justify-center bg-slate-900 rounded border border-slate-800">
                    R = {r}
                  </div>
                  {[1, 2, 3, 4, 5].map((f) => {
                    const cell = cellMap[`${r}_${f}`] || { count: 0, spend: 0 };
                    return (
                      <div
                        key={`${r}_${f}`}
                        className={`p-3 rounded-md border border-slate-800 transition-all ${getCellColor(
                          cell.count
                        )} flex flex-col justify-center items-center`}
                      >
                        <div className="font-bold text-xs">{cell.count.toLocaleString()}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">
                          {cell.count > 0 ? `R$ ${(cell.spend / (cell.count || 1)).toFixed(0)} avg` : '-'}
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quintile Score Boundaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recency Quintiles */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            Recency (R) Quintiles
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                <th className="py-1.5">Score</th>
                <th className="py-1.5">Day Range</th>
                <th className="py-1.5 text-right">Customers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rQuintiles.map((q) => (
                <tr key={q.r_score}>
                  <td className="py-2 font-bold text-slate-100">R = {q.r_score}</td>
                  <td className="py-2 text-slate-400">
                    {q.min_days} to {q.max_days} days
                  </td>
                  <td className="py-2 text-right font-medium">{q.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Frequency Quintiles */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            Frequency (F) Tiers
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                <th className="py-1.5">Score</th>
                <th className="py-1.5">Order Range</th>
                <th className="py-1.5 text-right">Customers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {fQuintiles.map((q) => (
                <tr key={q.f_score}>
                  <td className="py-2 font-bold text-slate-100">F = {q.f_score}</td>
                  <td className="py-2 text-slate-400">
                    {q.min_orders === q.max_orders ? `${q.min_orders} order` : `${q.min_orders}+ orders`}
                  </td>
                  <td className="py-2 text-right font-medium">{q.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Monetary Quintiles */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            Monetary (M) Quintiles
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                <th className="py-1.5">Score</th>
                <th className="py-1.5">Spend Range</th>
                <th className="py-1.5 text-right">Customers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {mQuintiles.map((q) => (
                <tr key={q.m_score}>
                  <td className="py-2 font-bold text-slate-100">M = {q.m_score}</td>
                  <td className="py-2 text-slate-400">
                    R$ {q.min_spend} – {q.max_spend}
                  </td>
                  <td className="py-2 text-right font-medium">{q.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
