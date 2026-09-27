import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { CohortCell } from '../types';
import { Calendar, HelpCircle } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

export const CohortsPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<{
    cohorts: CohortCell[];
    cohort_months: string[];
  }>({
    queryKey: ['cohorts'],
    queryFn: () => fetchApi('/cohorts'),
  });

  if (isLoading) {
    return <LoadingState message="Loading cohort matrix from analytics mart..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/cohorts.'}
        onRetry={() => refetch()}
      />
    );
  }

  const cohorts = data?.cohorts || [];
  const cohortMonths = (data?.cohort_months || []).slice(0, 15);

  if (cohorts.length === 0) {
    return (
      <EmptyState
        title="No cohorts published"
        message="analytics.customer_cohorts is empty. Run the pipeline to compute cohort retention."
      />
    );
  }

  // Group cells by cohort_month
  const matrix: Record<string, Record<number, CohortCell>> = {};
  cohorts.forEach((c) => {
    if (!matrix[c.cohort_month]) {
      matrix[c.cohort_month] = {};
    }
    matrix[c.cohort_month][c.period_number] = c;
  });

  const getHeatmapColor = (p: number, rate: number) => {
    if (p === 0) return 'bg-blue-600 text-white font-bold';
    if (rate >= 1.0) return 'bg-emerald-600 text-white font-bold';
    if (rate >= 0.7) return 'bg-emerald-500 text-white';
    if (rate >= 0.5) return 'bg-emerald-200 text-emerald-950 font-medium';
    if (rate >= 0.3) return 'bg-emerald-100 text-emerald-100';
    if (rate > 0) return 'bg-slate-800 text-slate-300';
    return 'bg-slate-900 text-slate-300';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Cohort Retention Analysis</h1>
        <p className="text-xs text-slate-400">
          Monthly acquisition cohorts tracking subsequent repeat transactions across periods 0 to 12.
        </p>
      </div>

      {/* Cohort Matrix Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-100">Acquisition Cohort Matrix (Retention %)</h2>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" /> P0 (100%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> High Repeat
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase bg-slate-900/75">
                <th className="py-2.5 px-3 sticky left-0 bg-slate-900 z-10">Cohort</th>
                <th className="py-2.5 px-3 text-right">Size</th>
                {Array.from({ length: 13 }).map((_, i) => (
                  <th key={i} className="py-2.5 px-2 text-center min-w-[54px]">
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
              {cohortMonths.map((m) => {
                const row = matrix[m] || {};
                const size = row[0]?.cohort_size || 0;
                return (
                  <tr key={m} className="hover:bg-slate-900/60">
                    <td className="py-2 px-3 font-semibold text-slate-100 sticky left-0 bg-slate-900 shadow-2xs">
                      {m}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-400">
                      {size.toLocaleString()}
                    </td>
                    {Array.from({ length: 13 }).map((_, p) => {
                      const cell = row[p];
                      if (!cell && p > 0 && !row[0]) return <td key={p} className="p-1" />;
                      const rate = cell ? cell.retention_rate : 0;
                      return (
                        <td key={p} className="p-1 text-center">
                          {cell ? (
                            <div
                              className={`py-1 rounded text-[10px] ${getHeatmapColor(p, rate)}`}
                              title={`Period ${p}: ${cell.active_customers} active / ${size} size (${rate}%) | Revenue: R$ ${cell.total_period_revenue}`}
                            >
                              {rate.toFixed(1)}%
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>Grain: Exactly one row per (acquisition_month, activity_month) in analytics.customer_cohorts</span>
          <span className="text-slate-500 text-[11px]">Hover over any cell to see exact customer counts</span>
        </div>
      </div>
    </div>
  );
};
