import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { Table, GitFork, Database } from 'lucide-react';
import { ExplorerPage } from './ExplorerPage';

export const DatasetsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'lineage' | 'explorer'>('catalog');

  const { data: meData } = useQuery<{ username: string; role: string }>({
    queryKey: ['me'],
    queryFn: () => fetchApi('/auth/me'),
  });
  const canExplore = meData?.role !== 'Viewer';

  const {
    data: datasetsData,
    isLoading: loadingDatasets,
    isError: errorDatasets,
    error: datasetsError,
    refetch: refetchDatasets,
  } = useQuery<{
    datasets: Array<{ schema: string; table: string; grain: string; rows: number; type: string }>;
  }>({
    queryKey: ['datasets'],
    queryFn: () => fetchApi('/datasets'),
  });

  const { data: lineageData, isLoading: loadingLineage } = useQuery<{
    nodes: Array<{ id: string; label: string; type: string; schema: string }>;
    edges: Array<{ source: string; target: string }>;
  }>({
    queryKey: ['lineage'],
    queryFn: () => fetchApi('/lineage'),
  });

  if (loadingDatasets || loadingLineage) {
    return <LoadingState message="Loading warehouse catalog and lineage..." />;
  }

  if (errorDatasets) {
    return (
      <ErrorState
        message={(datasetsError as Error)?.message || 'Could not load /api/datasets.'}
        onRetry={() => refetchDatasets()}
      />
    );
  }

  const datasets = datasetsData?.datasets || [];
  const nodes = lineageData?.nodes || [];
  const edges = lineageData?.edges || [];

  if (datasets.length === 0) {
    return (
      <EmptyState
        title="No datasets published"
        message="The warehouse catalog is empty. Run the pipeline to publish dataset metadata."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Data Warehouse Schema & Lineage</h1>
          <p className="text-xs text-slate-400">
            Dimensional catalog with documented grains and live row counts, plus end-to-end lineage.
          </p>
        </div>

        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 self-start text-xs font-semibold">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'catalog' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            Warehouse Catalog
          </button>
          <button
            onClick={() => setActiveTab('lineage')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'lineage' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            Data Lineage DAG
          </button>
          {canExplore && (
            <button
              onClick={() => setActiveTab('explorer')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'explorer' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
              }`}
            >
              Data Explorer
            </button>
          )}
        </div>
      </div>

      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-xs text-blue-200 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              Fact Grain Discipline (Fan-Out Safeguard)
            </div>
            <p className="leading-relaxed text-[11px]">
              Every fact table enforces one grain. Orders and line items are never joined
              with payments or reviews without prior aggregation.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 text-slate-500 font-semibold text-[10px] uppercase">
                    <th className="py-2.5 px-3">Schema</th>
                    <th className="py-2.5 px-3">Table Name</th>
                    <th className="py-2.5 px-3">Model Type</th>
                    <th className="py-2.5 px-3">Documented Grain</th>
                    <th className="py-2.5 px-3 text-right">Live Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                  {datasets.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-800">
                      <td className="py-2.5 px-3 font-semibold text-blue-300">{d.schema}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-100">{d.table}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-800">
                          {d.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{d.grain}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                        {d.rows === null || d.rows === undefined ? '—' : d.rows.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lineage' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <GitFork className="w-4 h-4 text-blue-400" />
                End-to-End Data Lineage
              </h2>
              <p className="text-xs text-slate-400">
                Source CSVs through quarantine, staging, warehouse, marts, and serving.
              </p>
            </div>
            <span className="text-xs bg-slate-800 border border-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
              {nodes.length} Nodes / {edges.length} Links
            </span>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs rounded-lg overflow-x-auto leading-relaxed">
            <pre className="text-[11px]">
{`[Raw Olist CSVs] (customers, orders, items, payments, reviews, products, sellers)
      │
      ▼
[Ingestion + Metadata] (_ingestion_id, _source_hash, _ingested_at)
      │
      ├──> [quarantine.invalid_records] (rejected rows)
      │
      ▼
[staging.stg_*] (cleansed, translated categories)
      │
      ▼
[dbt Warehouse] dim_customer / dim_product / dim_seller / dim_date
                fact_orders (order_id) / fact_order_items (order_id+item_id)
                fact_payments / fact_reviews
      │
      ▼
[Analytics & ML] customer_360 · customer_rfm · customer_cohorts
                 product_affinity · churn_predictions · customer_segments
      │
      ▼
[FastAPI + React UI] live queries, no static extracts`}
            </pre>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Table className="w-3.5 h-3.5" />
            Node detail per artifact is served by GET /api/lineage and /api/datasets.
          </div>
        </div>
      )}
      {activeTab === 'explorer' && canExplore && <ExplorerPage />}
    </div>
  );
};
