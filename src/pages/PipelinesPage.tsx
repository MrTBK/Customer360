import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { PipelineRun, PipelineTask } from '../types';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { AuditPage } from './AuditPage';
import { DatasetsPage } from './DatasetsPage';
import { GitBranch, CheckCircle2, Clock, Play, Terminal, ArrowRight } from 'lucide-react';

export const PipelinesPage: React.FC = () => {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [section, setSection] = useState<'runs' | 'data'>('runs');
  const { data: meData } = useQuery<{ username: string; role: string }>({
    queryKey: ['me'],
    queryFn: () => fetchApi('/auth/me'),
  });
  const isAdmin = meData?.role === 'Admin';
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const triggerRun = async () => {
    setRunMsg(null);
    try {
      await fetchApi('/pipeline/run', { method: 'POST' });
      setRunMsg('Pipeline run started. Refresh telemetry in a few minutes.');
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : 'Trigger failed.');
    }
  };

  const { data: runsData, isLoading, isError, error, refetch } = useQuery<{
    runs: PipelineRun[];
    latest_tasks: PipelineTask[];
  }>({
    queryKey: ['pipeline-runs'],
    queryFn: () => fetchApi('/runs'),
  });

  const { data: pipelineMeta } = useQuery<{
    pipeline_name: string;
    description: string;
    schedule: string;
    tasks: Array<{ id: string; type: string; upstream: string[] }>;
  }>({
    queryKey: ['pipelines-meta'],
    queryFn: () => fetchApi('/pipelines'),
  });

  if (isLoading) {
    return <LoadingState message="Loading pipeline observability logs..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/runs.'}
        onRetry={() => refetch()}
      />
    );
  }

  const runs = runsData?.runs || [];
  const latestRun = runs[0] ?? null;
  const tasks = runsData?.latest_tasks || [];
  const dagTasks = pipelineMeta?.tasks || [];
  const taskMap = new Map(tasks.map((t) => [t.task_id, t]));

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No pipeline runs recorded"
        message="monitoring.pipeline_runs is empty. Run the pipeline or trigger the Airflow DAG."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Pipeline Observability</h1>
          <p className="text-xs text-slate-400">
            Real execution telemetry per run and task (monitoring.pipeline_runs & monitoring.pipeline_tasks).
          </p>
        </div>
        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 self-start text-xs font-semibold">
          <button
            onClick={() => setSection('runs')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              section === 'runs' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            Runs & Tasks
          </button>
          <button
            onClick={() => setSection('data')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              section === 'data' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            Datasets & Explorer
          </button>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 rounded-md text-slate-300 hover:bg-slate-800 self-start"
        >
          Refresh Telemetry
        </button>
        {isAdmin && (
          <button
            onClick={triggerRun}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 self-start"
          >
            <Play className="w-3.5 h-3.5" /> Run Pipeline
          </button>
        )}
      </div>
      {runMsg && <div className="text-xs text-slate-400">{runMsg}</div>}

      {section === 'data' ? (
        <DatasetsPage />
      ) : (
      <>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Pipeline"
          value={pipelineMeta?.pipeline_name || 'customer360_daily_pipeline'}
          subValue={pipelineMeta?.schedule || 'Schedule unpublished'}
          icon={GitBranch}
        />
        <StatCard
          label="Latest Run Status"
          value={latestRun?.status || 'No runs'}
          subValue={
            latestRun?.duration_seconds === null || latestRun?.duration_seconds === undefined
              ? 'No executions recorded'
              : `Duration: ${latestRun.duration_seconds}s`
          }
          icon={CheckCircle2}
        />
        <StatCard
          label="Rows Loaded (Latest)"
          value={latestRun?.rows_loaded?.toLocaleString() || '—'}
          subValue={`Rejected: ${latestRun?.rows_rejected ?? '—'}`}
          icon={Play}
        />
        <StatCard
          label="Task Executions"
          value={`${tasks.length} Tasks`}
          subValue={tasks.length === 0 ? 'No task telemetry' : 'Latest run tasks'}
          icon={Clock}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Task Dependency Flow</h2>
            <p className="text-xs text-slate-400">Sequential execution with recorded durations</p>
          </div>
          <span className="text-xs font-mono text-slate-500">{dagTasks.length} Steps</span>
        </div>

        <div className="overflow-x-auto py-2">
          <div className="flex items-center gap-1.5 min-w-[900px]">
            {dagTasks.map((t, idx) => {
              const runTask = taskMap.get(t.id);
              const isSelected = selectedTask === t.id;
              return (
                <React.Fragment key={t.id}>
                  <div
                    onClick={() => setSelectedTask(t.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex flex-col justify-between shrink-0 w-32 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Step {idx + 1}</span>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          !runTask
                            ? 'bg-slate-600'
                            : runTask.status === 'SUCCESS'
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                        }`}
                      />
                    </div>
                    <div className="font-mono font-bold text-slate-100 text-[11px] truncate" title={t.id}>
                      {t.id}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{t.type}</div>
                    <div className="mt-2 text-[10px] font-mono text-slate-300 font-medium">
                      {runTask ? `${runTask.duration_seconds}s · ${runTask.status}` : 'Not run'}
                    </div>
                  </div>
                  {idx < dagTasks.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              Task Execution Telemetry
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {selectedTask ? `Task: ${selectedTask}` : 'Select a task above to inspect'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-semibold text-[10px] uppercase bg-slate-900">
                  <th className="py-2.5 px-3">Task ID</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3">Log Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                {tasks.map((tk) => (
                  <tr
                    key={tk.task_id}
                    onClick={() => setSelectedTask(tk.task_id)}
                    className={`hover:bg-slate-800 cursor-pointer ${selectedTask === tk.task_id ? 'bg-blue-500/10' : ''}`}
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-100">{tk.task_id}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          tk.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {tk.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{tk.duration_seconds}s</td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">{tk.log_output || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-100 mb-3">Run History</h2>
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.run_id} className="p-3 border border-slate-800 rounded-lg bg-slate-900 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-slate-100 text-[11px]" title={r.run_id}>
                    {r.run_id.slice(0, 20)}...
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      r.status === 'SUCCESS'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Duration:</span>
                  <span className="font-mono font-medium text-slate-100">{r.duration_seconds ?? '—'}s</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Rows loaded:</span>
                  <span className="font-mono font-medium text-slate-100">{r.rows_loaded?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Rejected:</span>
                  <span className="font-mono font-medium text-slate-100">{r.rows_rejected ?? '—'}</span>
                </div>
                {r.error_message && <div className="text-[11px] text-rose-400">{r.error_message}</div>}
                <div className="text-[10px] text-slate-600">
                  {r.end_time?.slice(0, 19).replace('T', ' ') ?? r.start_time?.slice(0, 19).replace('T', ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {isAdmin && (
        <div className="border-t border-slate-800 pt-6">
          <AuditPage />
        </div>
      )}
    </div>
  );
};
