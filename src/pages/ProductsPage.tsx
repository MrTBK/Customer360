import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { AffinityRule } from '../types';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { ShoppingBag, Share2, Layers, ArrowRight, Download } from 'lucide-react';
import { exportCsv } from '../utils/csv';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const ProductsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'categories' | 'affinity'>('categories');

  const {
    data: catData,
    isLoading: loadingCats,
    isError: errorCats,
    error: catsError,
    refetch: refetchCats,
  } = useQuery<{ categories: any[] }>({
    queryKey: ['categories'],
    queryFn: () => fetchApi('/categories'),
  });

  const {
    data: affinityData,
    isLoading: loadingAffinity,
    isError: errorAffinity,
  } = useQuery<{ rules: AffinityRule[] }>({
    queryKey: ['affinity-rules'],
    queryFn: () => fetchApi('/affinity'),
  });

  if (loadingCats || loadingAffinity) {
    return <LoadingState message="Loading merchandising and affinity data..." />;
  }

  if (errorCats || errorAffinity) {
    return (
      <ErrorState
        message={(catsError as Error)?.message || 'Could not load /api/categories or /api/affinity.'}
        onRetry={() => refetchCats()}
      />
    );
  }

  const categories = catData?.categories || [];
  const rules = affinityData?.rules || [];

  if (categories.length === 0 && rules.length === 0) {
    return (
      <EmptyState
        title="No merchandising data published"
        message="Category and affinity marts are empty. Run the pipeline to populate warehouse and analytics marts."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Merchandising & Product Affinity</h1>
          <p className="text-xs text-slate-400">
            Category revenue performance and Market Basket Association Rules (Support, Confidence, Lift).
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-800 self-start text-xs font-semibold">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'categories' ? 'bg-slate-900 text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Category Performance
          </button>
          <button
            onClick={() => setActiveTab('affinity')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'affinity' ? 'bg-slate-900 text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Market Basket Affinity ({rules.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          {/* Top 10 Categories Bar Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-100">Top Categories by Gross Merchandise Value (BRL)</h2>
              <button
                onClick={() => exportCsv('categories.csv', categories)}
                disabled={categories.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-md hover:bg-slate-800 disabled:opacity-40"
                title="Download categories as CSV"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Realized spend across fact_order_items</p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories.slice(0, 10)} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    formatter={(val: any) => [`R$ ${Number(val).toLocaleString()}`, 'Total Revenue']}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Bar dataKey="total_revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/75 text-slate-400 font-semibold text-[10px] uppercase">
                    <th className="py-2.5 px-3">Product Category</th>
                    <th className="py-2.5 px-3 text-right">Orders</th>
                    <th className="py-2.5 px-3 text-right">Units Sold</th>
                    <th className="py-2.5 px-3 text-right">Total Revenue</th>
                    <th className="py-2.5 px-3 text-right">Avg Unit Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {categories.map((c) => (
                    <tr key={c.category} className="hover:bg-slate-900">
                      <td className="py-2.5 px-3 font-medium text-slate-100">{c.category}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">{c.total_orders?.toLocaleString() ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">{c.units_sold?.toLocaleString() ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                        R$ {c.total_revenue?.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {c.avg_unit_price === null || c.avg_unit_price === undefined ? '—' : `R$ ${c.avg_unit_price.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Association Rules (Market Basket Analysis) */}
      {activeTab === 'affinity' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Discovered Product Association Rules</h2>
              <p className="text-xs text-slate-400">
                Lift &gt; 1.0 indicates strong positive affinity above random chance.
              </p>
            </div>
            <span className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-mono">
              Apriori / Basket Mining
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase bg-slate-900/75">
                  <th className="py-2.5 px-3">Rule Antecedent (X)</th>
                  <th className="py-2.5 px-3 text-center">Association</th>
                  <th className="py-2.5 px-3">Consequent (Y)</th>
                  <th className="py-2.5 px-3 text-right">Support</th>
                  <th className="py-2.5 px-3 text-right">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Lift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rules.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-900">
                    <td className="py-2.5 px-3 font-semibold text-slate-100">{r.antecedent}</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">
                      <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-blue-300">{r.consequent}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      {r.support === null || r.support === undefined ? '—' : `${(r.support * 100).toFixed(2)}%`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      {r.confidence === null || r.confidence === undefined ? '—' : `${(r.confidence * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          (r.lift ?? 0) >= 3.0 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/10 text-blue-300'
                        }`}
                      >
                        {r.lift === null || r.lift === undefined ? '—' : `${r.lift.toFixed(2)}x`}
                      </span>
                    </td>
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
