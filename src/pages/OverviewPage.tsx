import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { METRIC_DEFS } from '../utils/metrics';
import { Users, DollarSign, ShoppingCart, AlertOctagon, CheckCircle2, TrendingUp, Layers } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface OverviewPageProps {
  onSelectCustomer: (customerId: string) => void;
  onNavigateTab: (tab: any) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onSelectCustomer, onNavigateTab }) => {
  const {
    data: segmentsData,
    isLoading: loadingSegs,
    isError: errorSegs,
    error: segsError,
    refetch: refetchSegs,
  } = useQuery({
    queryKey: ['segments'],
    queryFn: () => fetchApi<{ rfm_segments: any[]; ml_clusters: any[]; total_customers: number }>('/segments'),
  });

  const { data: retentionData, isLoading: loadingRetention } = useQuery({
    queryKey: ['retention'],
    queryFn: () => fetchApi<{ decay_curve: any[]; total_unique_customers: number; repeat_rate_percentage: number }>('/retention'),
  });

  const { data: qualityData, isLoading: loadingQuality } = useQuery({
    queryKey: ['quality'],
    queryFn: () => fetchApi<{ system_quality_score: number; total_checks_executed: number }>('/quality'),
  });

  const { data: topCustomers, isLoading: loadingTop } = useQuery({
    queryKey: ['top-customers'],
    queryFn: () => fetchApi<{ items: any[] }>('/customers?page=1&limit=6&sort_by=total_spend&sort_dir=desc'),
  });

  if (loadingSegs || loadingRetention || loadingQuality || loadingTop) {
    return <LoadingState message="Loading executive analytics..." />;
  }

  if (errorSegs) {
    return (
      <ErrorState
        message={(segsError as Error)?.message || 'Could not load /api/segments.'}
        onRetry={() => refetchSegs()}
      />
    );
  }

  const totalCustomers = segmentsData?.total_customers ?? null;
  const segments = segmentsData?.rfm_segments || [];
  const decayCurve = retentionData?.decay_curve || [];

  if (totalCustomers === null && segments.length === 0) {
    return (
      <EmptyState
        title="No warehouse data published"
        message="The segments mart is empty. Run the pipeline to populate analytics marts."
      />
    );
  }

  const totalRevenue = segments.reduce((acc, s) => acc + (s.mean_spend * s.customer_count), 0);
  const avgOrderValue = segments.length > 0 ? segments.reduce((acc, s) => acc + s.mean_aov, 0) / segments.length : null;
  const repeatRate = retentionData?.repeat_rate_percentage ?? null;

  // Segment colors
  const COLORS = ['#2563eb', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b', '#ef4444', '#94a3b8', '#cbd5e1'];

  return (
    <div className="space-y-6">
      {/* Page Title & Context */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Executive Analytics Cockpit</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Batch-refreshed BI intelligence across Brazilian Olist E-commerce warehouse (99,441 transactional orders).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('quality')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-md hover:bg-slate-900 shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Quality Gate: {qualityData?.system_quality_score ?? '—'}%
          </button>
          <button
            onClick={() => onNavigateTab('quality')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-2xs"
          >
            Data Quality
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Unique Customers"
          value={totalCustomers === null ? '—' : totalCustomers.toLocaleString()}
          subValue="Grain: customer_unique_id"
          help={METRIC_DEFS.customers}
          icon={Users}
          badgeColor="blue"
        />
        <StatCard
          label="Gross Merchandise Value"
          value={`R$ ${(totalRevenue / 1e6).toFixed(2)}M`}
          subValue="Sum of fact_order_items.price"
          help={METRIC_DEFS.gmv}
          icon={DollarSign}
          trend={{ value: 'Realized GMV', isPositive: true }}
          badgeColor="green"
        />
        <StatCard
          label="Average Order Value"
          value={avgOrderValue === null ? '—' : `R$ ${avgOrderValue.toFixed(2)}`}
          subValue="Completed orders baseline"
          help={METRIC_DEFS.aov}
          icon={ShoppingCart}
          badgeColor="gray"
        />
        <StatCard
          label="Repeat Purchase Rate"
          value={repeatRate === null ? '—' : `${repeatRate}%`}
          subValue="Multi-order buyers (F >= 2)"
          help={METRIC_DEFS.repeat}
          icon={AlertOctagon}
          badge="Non-contractual"
          badgeColor="amber"
        />
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Volume by RFM Segment */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Customer Count by RFM Segment</h2>
              <p className="text-xs text-slate-400">Distribution across {segments.length} behavioral RFM archetypes</p>
            </div>
            <button
              onClick={() => onNavigateTab('segments')}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              View RFM Matrix →
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segments} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
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
                  formatter={(val: any) => [`${val.toLocaleString()} Customers`, 'Volume']}
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#1e293b', backgroundColor: '#0f172a', color: '#e2e8f0' }}
                />
                <Bar dataKey="customer_count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Segment Share Donut */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Customer Segment Composition</h2>
            <p className="text-xs text-slate-400 mb-2">Proportion of total customer base</p>
            <div className="h-52 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segments.slice(0, 6)}
                    dataKey="customer_count"
                    nameKey="customer_segment"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {segments.slice(0, 6).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val.toLocaleString()} buyers`, 'Count']}
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400 mt-2">
            {segments.slice(0, 4).map((s, i) => (
              <div key={s.customer_segment} className="flex items-center gap-1.5 truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                <span className="truncate">{s.customer_segment}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cohort Retention Trend & High-Value Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Retention Decay Curve */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Empirical Cohort Retention Decay Curve</h2>
              <p className="text-xs text-slate-400">Average retention rate (%) across elapsed monthly periods</p>
            </div>
            <button
              onClick={() => onNavigateTab('cohorts')}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              Full Retention Matrix →
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={decayCurve} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="period_number" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="m" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, 'Retention Rate']}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="mean_retention_rate"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#2563eb' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* High-Value Customer Spotlights */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-100">Top Spenders (GMV)</h2>
              <button
                onClick={() => onNavigateTab('customers')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                All Directory →
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">High-value customer records from dimensional warehouse</p>

            <div className="divide-y divide-slate-800">
              {topCustomers?.items?.map((c) => (
                <div
                  key={c.customer_unique_id}
                  onClick={() => onSelectCustomer(c.customer_unique_id)}
                  className="py-2.5 flex items-center justify-between hover:bg-slate-900 cursor-pointer rounded px-1 transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-100 font-mono truncate w-36" title={c.customer_unique_id}>
                      {c.customer_unique_id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>{c.total_orders} orders</span>
                      <span>•</span>
                      <span className="text-emerald-300 font-medium">{c.customer_segment}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-100">
                      R$ {(c.total_spend ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">Score {c.rfm_score ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-500">
              Click any customer row to inspect their full Customer 360 profile
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
