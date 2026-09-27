import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { SegmentSummary, MlCluster } from '../types';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { RfmPage } from './RfmPage';
import { Layers, Users, DollarSign, Calendar, Target, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface SegmentsPageProps {
  onSelectCustomer: (id: string) => void;
}

export const SegmentsPage: React.FC<SegmentsPageProps> = ({ onSelectCustomer }) => {
  const [selectedSegment, setSelectedSegment] = useState<string>('Champions');
  const [view, setView] = useState<'segments' | 'matrix'>('segments');

  const { data, isLoading, isError, error, refetch } = useQuery<{
    rfm_segments: SegmentSummary[];
    ml_clusters: MlCluster[];
    total_customers: number;
  }>({
    queryKey: ['segments'],
    queryFn: () => fetchApi('/segments'),
  });

  const { data: segmentDetail } = useQuery<{
    summary: any;
    sample_customers: any[];
  }>({
    queryKey: ['segment-detail', selectedSegment],
    queryFn: () => fetchApi(`/segments/${selectedSegment}`),
    enabled: !!selectedSegment,
  });

  if (isLoading) {
    return <LoadingState message="Loading customer segment marts..." />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load /api/segments.'}
        onRetry={() => refetch()}
      />
    );
  }

  const clusters = data?.ml_clusters || [];
  const rfmSegments = data?.rfm_segments || [];
  const totalCustomers = data?.total_customers ?? null;

  if (totalCustomers === null && rfmSegments.length === 0) {
    return (
      <EmptyState
        title="No segments published"
        message="Segment marts are empty. Run the pipeline to populate analytics marts."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Customer Segmentation Intelligence</h1>
          <p className="text-xs text-slate-400">
            Dual-view segmentation: Unsupervised K-Means clustering and Behavioral RFM matrix.
          </p>
        </div>
        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 self-start text-xs font-semibold">
          <button
            onClick={() => setView('segments')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              view === 'segments' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            Segments
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              view === 'matrix' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-100'
            }`}
          >
            RFM Matrix
          </button>
        </div>
      </div>

      {view === 'matrix' ? (
        <RfmPage />
      ) : (
      <>
      {/* Part 1: K-Means Clustering Archetypes */}
      {clusters.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs text-xs text-slate-400">
          No K-Means clusters published yet in ml.customer_segments. Run the pipeline to train segmentation.
        </div>
      ) : (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-[11px]">
            Unsupervised Machine Learning Archetypes (K-Means)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {clusters.map((c) => (
            <div
              key={c.cluster_id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded">
                    Cluster #{c.cluster_id}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">{c.share_of_customers}% base</span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 leading-snug">{c.cluster_name}</h3>
                <p className="text-xs text-slate-400 mt-1">{c.business_persona}</p>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500">Mean Spend</div>
                    <div className="font-bold text-slate-100 mt-0.5">R$ {c.mean_spend}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Frequency</div>
                    <div className="font-bold text-slate-100 mt-0.5">{c.mean_frequency}x</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Recency</div>
                    <div className="font-bold text-slate-100 mt-0.5">{c.mean_recency}d</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 bg-slate-900 -mx-4 -mb-4 p-3 rounded-b-lg">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-blue-400" />
                  Prescribed Strategy
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{c.recommended_strategy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Part 2: RFM Behavioral Segments Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100">RFM Customer Volume by Segment</h2>
              <p className="text-xs text-slate-400">Click any bar to drilldown into customer profiles</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">{rfmSegments.length} Segments</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rfmSegments}
                margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0]) {
                    setSelectedSegment(e.activePayload[0].payload.customer_segment);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis
                  dataKey="customer_segment"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(val: any) => [`${val.toLocaleString()} Customers`, 'Count']}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Bar dataKey="customer_count" fill="#3b82f6" radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Selected Segment Detail Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Drilldown</span>
              <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded">
                {selectedSegment}
              </span>
            </div>

            {segmentDetail?.summary && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-900 rounded-md border border-slate-800 text-xs">
                  <div className="text-slate-400">Segment Size:</div>
                  <div className="text-lg font-bold text-slate-100">
                    {segmentDetail.summary.customer_count.toLocaleString()} customers (
                    {totalCustomers ? ((segmentDetail.summary.customer_count / totalCustomers) * 100).toFixed(1) : '—'}%)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 border border-slate-800 rounded">
                    <div className="text-slate-500 text-[10px]">Average Spend</div>
                    <div className="font-bold text-slate-100 mt-0.5">R$ {segmentDetail.summary.mean_spend}</div>
                  </div>
                  <div className="p-2.5 border border-slate-800 rounded">
                    <div className="text-slate-500 text-[10px]">Mean Recency</div>
                    <div className="font-bold text-slate-100 mt-0.5">{segmentDetail.summary.mean_recency_days} days</div>
                  </div>
                </div>

                <div className="p-2.5 border border-slate-800 rounded text-xs flex justify-between">
                  <span className="text-slate-400">Segment Churn Risk:</span>
                  <span className="font-bold text-rose-400">
                    {(segmentDetail.summary.mean_churn_probability * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800 text-center">
            Derived directly from dimensional warehouse marts
          </div>
        </div>
      </div>

      {/* Part 3: Sample Customers in Selected Segment */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-100 mb-3">
          Top Spenders in "{selectedSegment}" Segment
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                <th className="py-2.5 px-3">Customer Unique ID</th>
                <th className="py-2.5 px-3 text-right">Orders</th>
                <th className="py-2.5 px-3 text-right">Total Spend</th>
                <th className="py-2.5 px-3 text-right">Recency (Days)</th>
                <th className="py-2.5 px-3">RFM Score</th>
                <th className="py-2.5 px-3">Churn Probability</th>
                <th className="py-2.5 px-3 text-center">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {segmentDetail?.sample_customers?.map((sc) => (
                <tr
                  key={sc.customer_unique_id}
                  onClick={() => onSelectCustomer(sc.customer_unique_id)}
                  className="hover:bg-slate-900 cursor-pointer"
                >
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-100" title={sc.customer_unique_id}>{sc.customer_unique_id.slice(0, 8)}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{sc.total_orders}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-100">R$ {sc.total_spend.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{sc.days_since_last_order}d</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{sc.rfm_score}</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px]">
                      {(sc.churn_probability * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(sc.customer_unique_id);
                      }}
                      className="text-blue-400 hover:text-blue-800 font-semibold text-xs flex items-center justify-center gap-1 mx-auto"
                    >
                      360 <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
