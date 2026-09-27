import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { ChurnOverview } from '../types';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { METRIC_DEFS } from '../utils/metrics';
import { AlertTriangle, ShieldCheck, Cpu, Sliders, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface FeatureStats {
  avg_recency: number | null;
  avg_frequency: number | null;
  avg_spend: number | null;
  avg_review_score: number | null;
  avg_delay_rate: number | null;
  churn_rate: number | null;
}

const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits);

export const ChurnPage: React.FC = () => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ChurnOverview>({
    queryKey: ['churn-overview'],
    queryFn: () => fetchApi('/churn'),
  });

  const {
    data: featureData,
    isLoading: featuresLoading,
    isError: featuresError,
  } = useQuery<{ feature_stats: FeatureStats }>({
    queryKey: ['churn-features'],
    queryFn: () => fetchApi('/churn/features'),
  });

  const { data: expData } = useQuery<{
    experiments: Array<{
      experiment_id: string;
      model_type: string;
      training_period: string;
      validation_period: string;
      test_period: string;
      threshold: number;
      roc_auc: number;
      pr_auc: number;
      precision_score: number;
      recall_score: number;
      f1_score: number;
      brier_score: number;
      deciles: Array<{ decile: number; customer_count: number; churned_count: number; churn_rate: number; lift: number }>;
    }>;
  }>({
    queryKey: ['churn-experiments'],
    queryFn: () => fetchApi('/churn/experiments'),
  });

  if (isLoading || featuresLoading) {
    return <LoadingState message="Loading churn prediction model metrics..." />;
  }

  if (isError || featuresError) {
    return (
      <ErrorState
        message={(error as Error)?.message || 'Could not load churn data from /api/churn.'}
        onRetry={() => refetch()}
      />
    );
  }

  const model = data?.champion_model ?? null;
  const riskDist = data?.risk_distribution || [];
  const stats = featureData?.feature_stats ?? null;

  if (!model && riskDist.length === 0) {
    return (
      <EmptyState
        title="No churn model recorded"
        message="ml.churn_models and ml.churn_predictions are empty. Run the pipeline to train and publish the churn model."
      />
    );
  }

  // Observed population averages from ml.customer_features (live API, no coefficients stored).
  const statRows = stats
    ? [
        { feature: 'avg_recency_days', value: stats.avg_recency, type: 'Behavioral' },
        { feature: 'avg_order_frequency', value: stats.avg_frequency, type: 'Behavioral' },
        { feature: 'avg_total_spend', value: stats.avg_spend, type: 'Monetary' },
        { feature: 'avg_review_score', value: stats.avg_review_score, type: 'Satisfaction' },
        { feature: 'avg_delivery_delay_rate', value: stats.avg_delay_rate, type: 'Logistics' },
        { feature: 'observed_churn_rate', value: stats.churn_rate, type: 'Target' },
      ]
    : [];

  const maxStat = Math.max(0, ...statRows.map((s) => Math.abs(s.value ?? 0)));

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Predictive Churn Intelligence</h1>
        <p className="text-xs text-slate-400">
          Supervised machine learning model trained on empirical 180-day interpurchase windows without data leakage.
        </p>
      </div>

      {/* Champion Model Performance Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="ROC-AUC Score"
          value={model ? fmt(model.roc_auc, 3) : '—'}
          subValue="Ranking discrimination power"
          help="Area under the ROC curve on the held-out test split. 0.5 means random ranking."
          icon={Cpu}
          badge="Champion Model"
          badgeColor="blue"
        />
        <StatCard
          label="Precision (Macro)"
          value={model ? `${(model.precision_score * 100).toFixed(1)}%` : '—'}
          subValue="Positive predictive value"
          help="Share of predicted churners who actually churned in the test window."
          icon={CheckCircle2}
        />
        <StatCard
          label="Recall (Sensitivity)"
          value={model ? `${(model.recall_score * 100).toFixed(1)}%` : '—'}
          subValue="Coverage of true churners"
          help="Share of actual churners the model flagged at the tuned threshold."
          icon={AlertTriangle}
          badgeColor="amber"
        />
        <StatCard
          label="Brier Calibration Score"
          value={model ? fmt(model.brier_score, 3) : '—'}
          subValue="Probability calibration fidelity"
          help="Mean squared error of predicted probabilities. Lower means better calibrated."
          icon={ShieldCheck}
          badge="Well-Calibrated"
          badgeColor="green"
        />
      </div>

      {/* Risk Distribution and Feature Impact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Tier Volume */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-100 mb-1">Customer Population by Risk Tier</h2>
          <p className="text-xs text-slate-400 mb-4">Probability thresholds calibrated via sigmoid loss</p>

          {riskDist.length === 0 ? (
            <div className="text-xs text-slate-400">No risk tiers published yet.</div>
          ) : (
            <div className="space-y-3">
              {riskDist.map((r) => {
                const colors: Record<string, string> = {
                  'Critical Risk': 'bg-rose-500',
                  'High Risk': 'bg-amber-500',
                  'Medium Risk': 'bg-blue-500',
                  'Low Risk': 'bg-emerald-500',
                };
                return (
                  <div key={r.risk_tier} className="p-3 border border-slate-800 rounded-lg bg-slate-900/50">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${colors[r.risk_tier] || 'bg-slate-400'}`} />
                        {r.risk_tier}
                      </span>
                      <span className="font-bold text-slate-100">{r.customer_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Mean predicted churn prob:</span>
                      <span className="font-mono">
                        {r.mean_probability === null || r.mean_probability === undefined
                          ? '—'
                          : `${(r.mean_probability * 100).toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Observed Feature Averages */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Observed Feature Averages</h2>
              <p className="text-xs text-slate-400">Population means from ml.customer_features via /api/churn/features</p>
            </div>
            <Sliders className="w-4 h-4 text-slate-500" />
          </div>

          {statRows.length === 0 || statRows.every((s) => s.value === null) ? (
            <div className="text-xs text-slate-400">
              No feature statistics published yet. Run the pipeline to build ml.customer_features.
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {statRows.map((f) => (
                <div key={f.feature} className="border border-slate-800 p-2.5 rounded-md bg-slate-900">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono font-semibold text-slate-100">{f.feature}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-slate-900 text-slate-400 border-slate-800">
                      {f.type} · {fmt(f.value)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: maxStat > 0 && f.value !== null ? `${(Math.abs(f.value) / maxStat) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Model: Logistic Regression (L2 regularized, class-weighted) stored in ml.churn_models</span>
            <span className="text-emerald-300 font-semibold">Zero Data Leakage Enforced</span>
          </div>
        </div>
      </div>

      {/* Experiment Registry */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-100 mb-1">Experiment Registry & Decile Analysis</h2>
        <p className="text-xs text-slate-400 mb-4">
          Same features and target; different validation designs. Deciles rank test customers
          by predicted risk — lift shows whether top deciles concentrate real churners.
        </p>
        {(expData?.experiments || []).length === 0 ? (
          <div className="text-xs text-slate-500">
            No experiments registered yet. They are recorded by the pipeline in ml.experiments.
          </div>
        ) : (
          <div className="space-y-4">
            {(expData?.experiments || []).map((e) => (
              <div key={e.experiment_id} className="border border-slate-800 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-bold text-slate-100 font-mono">{e.experiment_id}</div>
                  <div className="text-[11px] text-slate-500">
                    {e.model_type} · threshold {e.threshold} · train: {e.training_period} · test: {e.test_period}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs mb-3">
                  {[
                    ['ROC-AUC', e.roc_auc],
                    ['PR-AUC', e.pr_auc],
                    ['Precision', e.precision_score],
                    ['Recall', e.recall_score],
                    ['F1', e.f1_score],
                    ['Brier', e.brier_score],
                  ].map(([label, v]) => (
                    <div key={label as string} className="bg-slate-950 border border-slate-800 rounded p-2">
                      <div className="text-[10px] text-slate-500">{label}</div>
                      <div className="font-bold text-slate-100 font-mono">
                        {v === null || v === undefined ? '—' : Number(v).toFixed(3)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="text-slate-500 font-semibold uppercase text-[10px]">
                        <th className="py-1.5 pr-3">Decile</th>
                        <th className="py-1.5 pr-3 text-right">Customers</th>
                        <th className="py-1.5 pr-3 text-right">Churned</th>
                        <th className="py-1.5 pr-3 text-right">Rate</th>
                        <th className="py-1.5 text-right">Lift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {e.deciles.map((d) => (
                        <tr key={d.decile}>
                          <td className="py-1.5 pr-3 text-slate-300">D{d.decile} (riskiest first)</td>
                          <td className="py-1.5 pr-3 text-right">{d.customer_count.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right">{d.churned_count.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right">{(d.churn_rate * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-right font-bold text-slate-100">{d.lift.toFixed(2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
