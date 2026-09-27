import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

interface AuditEntry {
  log_id: string;
  username: string;
  action: string;
  resource: string;
  rows_affected: number;
  status: string;
  created_at: string;
}

export const AuditPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<{ entries: AuditEntry[] }>({
    queryKey: ['audit'],
    queryFn: () => fetchApi('/audit?limit=100'),
  });

  if (isLoading) {
    return <LoadingState message="Loading audit log..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/audit (Admin only).'}
        onRetry={() => refetch()}
      />
    );
  }

  const entries = data?.entries || [];
  if (entries.length === 0) {
    return <EmptyState title="No audit entries" message="No recorded actions yet." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Audit Log</h1>
        <p className="text-xs text-slate-400">
          Logins, pipeline runs, user changes and exports. Admin only, newest first.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-slate-500 font-semibold text-[10px] uppercase">
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Resource</th>
                <th className="py-2.5 px-3 text-right">Rows</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
              {entries.map((e) => (
                <tr key={e.log_id} className="hover:bg-slate-800">
                  <td className="py-2.5 px-3 text-slate-400">{e.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-100 font-sans">{e.username}</td>
                  <td className="py-2.5 px-3 text-slate-100 font-sans">{e.action}</td>
                  <td className="py-2.5 px-3 text-slate-400">{e.resource}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{e.rows_affected}</td>
                  <td className="py-2.5 px-3 font-sans">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        e.status === 'SUCCESS' || e.status === 'STARTED'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
