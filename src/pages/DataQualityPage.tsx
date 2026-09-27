import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { QualityResult } from '../types';
import { CheckCircle2, AlertOctagon, ShieldAlert, ShieldCheck } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

export const DataQualityPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<{
    system_quality_score: number;
    total_checks_executed: number;
    needs_attention: boolean;
    results: QualityResult[];
    quarantined_summary: Array<{ violation_code: string; count: number }>;
  }>({
    queryKey: ['quality'],
    queryFn: () => fetchApi('/quality'),
  });

  if (isLoading) {
    return <LoadingState message="Loading data quality validation gates..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/quality.'}
        onRetry={() => refetch()}
      />
    );
  }

  const score = data?.system_quality_score ?? null;
  const checks = data?.results || [];
  const quarantined = data?.quarantined_summary || [];

  if (checks.length === 0) {
    return (
      <EmptyState
        title="No quality checks recorded"
        message="monitoring.data_quality_results is empty. Run the pipeline to execute validation assertions."
      />
    );
  }

  const totalEvaluated = checks.reduce((acc, c) => acc + c.evaluated_rows, 0);
  const failedCount = checks.filter((c) => c.failed_rows > 0).length;
  const critFail = checks.filter((c) => c.failed_rows > 0 && c.severity === 'critical').length;

  const groups: Record<string, typeof checks> = {};
  for (const c of checks) {
    const g = c.check_type || 'Other';
    (groups[g] = groups[g] || []).push(c);
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Data Quality & Observability Gate</h1>
        <p className="text-xs text-slate-400">
          Mathematical assertions executed across raw, staging, and warehouse tables. Offending records are diverted to quarantine.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Derived Quality Score"
          value={score === null ? '—' : `${score}%`}
          subValue="Passed rows / Evaluated rows"
          icon={ShieldCheck}
          badge={critFail > 0 ? 'Critical Failures' : failedCount > 0 ? 'Warnings Open' : 'Gate Passed'}
          badgeColor={critFail > 0 ? 'red' : failedCount > 0 ? 'amber' : 'green'}
        />
        <StatCard
          label="Checks Executed"
          value={`${checks.length}`}
          subValue={`${checks.length - failedCount} passed · ${failedCount} failing`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Evaluated Records"
          value={totalEvaluated.toLocaleString()}
          subValue="Across all assertions"
          icon={CheckCircle2}
        />
        <StatCard
          label="Quarantined Records"
          value={quarantined.reduce((a, b) => a + b.count, 0).toLocaleString()}
          subValue="Stored in quarantine.invalid_records"
          icon={AlertOctagon}
          badgeColor="gray"
        />
      </div>

      {/* Quality Checks by Category */}
      {Object.entries(groups).map(([category, list]) => (
        <div key={category} className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">{category}</h2>
              <p className="text-xs text-slate-400">Recorded in monitoring.data_quality_results</p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {list.filter((c) => c.failed_rows === 0).length}/{list.length} passing
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase bg-slate-900/75">
                  <th className="py-2.5 px-3">Assertion Rule</th>
                  <th className="py-2.5 px-3">Target Table</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3 text-right">Evaluated</th>
                  <th className="py-2.5 px-3 text-right">Failed</th>
                  <th className="py-2.5 px-3 text-right">Pass Rate</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {list.map((c) => (
                  <tr key={c.check_name} className="hover:bg-slate-900">
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-semibold text-slate-100" title={c.description || c.check_name}>
                        {c.check_name}
                      </div>
                      {c.description && <div className="text-[11px] text-slate-500 mt-0.5">{c.description}</div>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {c.target_schema}.{c.target_table}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          c.severity === 'critical'
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {(c.severity || 'warning').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">{c.evaluated_rows.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">{c.failed_rows.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100">{c.pass_rate}%</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          c.status === 'PASSED'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : c.status === 'FAILED'
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Quarantined Records Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-100">Quarantine Gate Analysis (quarantine.invalid_records)</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Non-compliant source records diverted to quarantine to prevent corrupting staging or warehouse analytics.
        </p>

        {quarantined.length === 0 ? (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-md">
            No violating records quarantined in latest batch ingestion run.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quarantined.map((q) => (
              <div key={q.violation_code} className="border border-slate-800 rounded-lg p-3 bg-slate-900 text-xs">
                <div className="flex justify-between font-bold text-slate-100 mb-1">
                  <span>{q.violation_code}</span>
                  <span className="text-amber-300">{q.count} records</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Records failing validation assertions were isolated prior to dbt staging view materialization.
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
