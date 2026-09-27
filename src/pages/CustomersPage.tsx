import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { CustomerListItem } from '../types';
import { shortId, locationLabel, rfmParts } from '../utils/customer';
import { exportCsv } from '../utils/csv';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Download } from 'lucide-react';

interface CustomersPageProps {
  onSelectCustomer: (customerId: string) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ onSelectCustomer }) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [riskTier, setRiskTier] = useState('');
  const [sortBy, setSortBy] = useState('total_spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '20',
    sort_by: sortBy,
    sort_dir: sortDir,
  });
  if (search) queryParams.set('search', search);
  if (segment) queryParams.set('segment', segment);
  if (riskTier) queryParams.set('risk_tier', riskTier);

  const { data, isLoading, isError } = useQuery<{
    items: CustomerListItem[];
    total: number;
    total_pages: number;
  }>({
    queryKey: ['customers', page, search, segment, riskTier, sortBy, sortDir],
    queryFn: () => fetchApi(`/customers?${queryParams.toString()}`),
  });

  const segmentsList = [
    'Champions',
    'Loyal Customers',
    'Potential Loyalists',
    'Recent Customers',
    'Promising',
    'Needs Attention',
    'About to Sleep',
    'At Risk',
    'Hibernating',
    'Lost',
  ];

  const riskTiers = ['Critical Risk', 'High Risk', 'Medium Risk', 'Low Risk'];

  const getRiskBadge = (tier: string) => {
    switch (tier) {
      case 'Critical Risk':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      case 'High Risk':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'Medium Risk':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Customer Directory</h1>
          <p className="text-xs text-slate-400">
            Granular customer intelligence records ({data?.total?.toLocaleString() ?? '...'} total unique buyers).
          </p>
        </div>
        <button
          onClick={() => {
            const rows = (data?.items || []).map((c) => ({
              customer: shortId(c.customer_unique_id),
              city: c.customer_city ?? '',
              state: c.customer_state ?? '',
              segment: c.customer_segment,
              rfm: c.rfm_score,
              orders: c.total_orders,
              spend: c.total_spend,
              churn_probability: c.churn_probability,
              risk: c.risk_tier,
            }));
            exportCsv('customers-page.csv', rows);
            fetchApi('/exports/log', {
              method: 'POST',
              body: JSON.stringify({ resource: 'customer_directory', rows: rows.length }),
            }).catch(() => undefined);
          }}
          disabled={!data?.items?.length}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-md hover:bg-slate-800 disabled:opacity-40"
          title="Download current page as CSV"
        >
          <Download className="w-3.5 h-3.5" /> Export page
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by ID, city, state or region..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-slate-900"
            />
          </div>

          {/* Segment Filter */}
          <div>
            <select
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-3 text-xs bg-slate-900 border border-slate-800 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All RFM Segments</option>
              {segmentsList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Churn Risk Filter */}
          <div>
            <select
              value={riskTier}
              onChange={(e) => {
                setRiskTier(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-3 text-xs bg-slate-900 border border-slate-800 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Churn Risk Tiers</option>
              {riskTiers.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full py-1.5 px-3 text-xs bg-slate-900 border border-slate-800 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="total_spend">Sort: Spend (GMV)</option>
              <option value="days_since_last_order">Sort: Recency (Days)</option>
              <option value="total_orders">Sort: Order Count</option>
              <option value="churn_probability">Sort: Churn Risk</option>
              <option value="estimated_clv">Sort: Projected CLV</option>
            </select>
            <button
              onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              className="p-2 border border-slate-800 bg-slate-900 rounded-md hover:bg-slate-800 text-slate-400"
              title="Toggle Sort Direction"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/75 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">RFM Segment</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Total Spend</th>
                <th className="py-3 px-4 text-right">AOV</th>
                <th className="py-3 px-4 text-right">Recency</th>
                <th className="py-3 px-4">Churn Risk</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading customer data warehouse records...
                  </td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-rose-500">
                    Failed to query customer records.
                  </td>
                </tr>
              )}
              {data?.items?.map((c) => (
                <tr
                  key={c.customer_unique_id}
                  onClick={() => onSelectCustomer(c.customer_unique_id)}
                  className="hover:bg-slate-900/80 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="font-mono font-medium text-slate-100" title={c.customer_unique_id}>
                      {shortId(c.customer_unique_id)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {locationLabel(c.customer_city, c.customer_state)}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-100">{c.customer_segment}</span>
                    <span
                      className="ml-1 text-[10px] text-slate-500 font-mono"
                      title={`Recency ${rfmParts(c.rfm_score)[0]}, Frequency ${rfmParts(c.rfm_score)[1]}, Monetary ${rfmParts(c.rfm_score)[2]} (each scored 1 to 5)`}
                    >
                      R{rfmParts(c.rfm_score)[0]}·F{rfmParts(c.rfm_score)[1]}·M{rfmParts(c.rfm_score)[2]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium">{c.total_orders}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-100">
                    R$ {c.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    R$ {c.average_order_value.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">{c.days_since_last_order}d</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getRiskBadge(c.risk_tier)}`}>
                      {(c.churn_probability * 100).toFixed(0)}% • {c.risk_tier}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{c.preferred_region}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(c.customer_unique_id);
                      }}
                      className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                      title="Inspect Customer 360"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3 px-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold">{data?.items?.length ?? 0}</span> of{' '}
            <span className="font-semibold">{data?.total?.toLocaleString() ?? 0}</span> customers
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-slate-800 rounded bg-slate-900 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs">
              Page <span className="font-semibold">{page}</span> of{' '}
              <span className="font-semibold">{data?.total_pages ?? 1}</span>
            </span>
            <button
              disabled={page >= (data?.total_pages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 border border-slate-800 rounded bg-slate-900 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
