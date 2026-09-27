import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { CustomerDetail, OrderItem, ProductItem, ReviewItem } from '../types';
import {
  User,
  ShoppingBag,
  Clock,
  DollarSign,
  TrendingDown,
  Truck,
  Star,
  Layers,
  CreditCard,
  MapPin,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Package,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { shortId, locationLabel, rfmParts } from '../utils/customer';

interface Customer360PageProps {
  customerId: string;
  onBack: () => void;
  onSelectCustomer: (id: string) => void;
}

export const Customer360Page: React.FC<Customer360PageProps> = ({
  customerId,
  onBack,
  onSelectCustomer,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'products' | 'reviews' | 'activity'>('timeline');

  // Fetch full Customer 360 unified profile
  const { data: profile, isLoading, isError } = useQuery<CustomerDetail>({
    queryKey: ['customer-profile', customerId],
    queryFn: () => fetchApi(`/customers/${customerId}`),
  });

  // Fetch orders
  const { data: ordersData } = useQuery<{ orders: OrderItem[] }>({
    queryKey: ['customer-orders', customerId],
    queryFn: () => fetchApi(`/customers/${customerId}/orders`),
    enabled: !!profile,
  });

  // Fetch products
  const { data: productsData } = useQuery<{ products: ProductItem[] }>({
    queryKey: ['customer-products', customerId],
    queryFn: () => fetchApi(`/customers/${customerId}/products`),
    enabled: !!profile,
  });

  // Fetch reviews
  const { data: reviewsData } = useQuery<{ reviews: ReviewItem[] }>({
    queryKey: ['customer-reviews', customerId],
    queryFn: () => fetchApi(`/customers/${customerId}/reviews`),
    enabled: !!profile,
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading unified Customer 360 profile from data warehouse...
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-100">Customer Profile Not Found</h2>
        <p className="text-xs text-slate-400">Could not retrieve customer key: {customerId}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-200 text-xs font-semibold rounded-md text-slate-300"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Directory
        </button>
      </div>
    );
  }

  const orders = ordersData?.orders || [];
  const products = productsData?.products || [];
  const reviews = reviewsData?.reviews || [];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md hover:bg-slate-900 transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Directory
        </button>
        <div className="text-xs text-slate-500 font-mono">
          Surrogate Key: #{profile.customer_key}
        </div>
      </div>

      {/* Signature Profile Hero Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 font-bold text-lg shadow-sm">
              <User className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className="text-lg font-bold text-slate-100 font-mono"
                  title={`Full anonymized ID: ${profile.customer_unique_id} (Olist publishes no real names)`}
                >
                  Buyer {shortId(profile.customer_unique_id)}
                </h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium border ${
                    profile.customer_status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-800'
                  }`}
                >
                  {profile.customer_status} Lifecycle
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  {profile.customer_segment}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {locationLabel(profile.customer_city, profile.customer_state)} · {profile.preferred_region} (Brazil)
                  </span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Acquired: {profile.first_order_date?.slice(0, 10)}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Last Order: {profile.last_order_date?.slice(0, 10)} ({profile.days_since_last_order}d ago)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Persona & ML Clustering Pill */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs max-w-sm shrink-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-blue-400" />
              K-Means Cluster Archetype
            </div>
            <div className="font-semibold text-slate-100">{profile.cluster_name}</div>
            <div className="text-slate-400 text-[11px] mt-0.5">{profile.cluster_persona}</div>
            <div className="mt-2 text-[10px] bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300">
              <span className="font-semibold text-blue-400">Strategy: </span>
              {profile.recommended_strategy}
            </div>
          </div>
        </div>
      </div>

      {/* Core Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total Spend (GMV)"
          value={`R$ ${profile.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          subValue={`${profile.total_orders} lifetime orders`}
          icon={DollarSign}
          badge="Realized"
          badgeColor="green"
        />
        <StatCard
          label="Average Order Value"
          value={`R$ ${profile.average_order_value.toFixed(2)}`}
          subValue={`Freight: R$ ${profile.average_freight.toFixed(2)} / order`}
          icon={ShoppingBag}
        />
        <StatCard
          label="RFM Score (Recency · Frequency · Monetary, each 1–5)"
          value={`R${rfmParts(profile.rfm_score)[0]} · F${rfmParts(profile.rfm_score)[1]} · M${rfmParts(profile.rfm_score)[2]}`}
          subValue="5 = best, 1 = weakest per dimension"
          icon={Layers}
          badge={profile.customer_segment}
          badgeColor="blue"
        />
        <StatCard
          label="Projected Customer Value"
          value={`R$ ${profile.estimated_clv.toFixed(2)}`}
          subValue="Past spend + expected next-12-month spend"
          icon={TrendingDown}
          badgeColor="gray"
        />
        <StatCard
          label="Churn Risk Model"
          value={`${(profile.churn_probability * 100).toFixed(1)}%`}
          subValue={profile.risk_tier}
          icon={AlertTriangle}
          badge={profile.risk_tier}
          badgeColor={profile.risk_tier === 'Critical Risk' ? 'red' : profile.risk_tier === 'High Risk' ? 'amber' : 'green'}
        />
      </div>

      {/* Behavioral & Logistics Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Purchasing Preferences */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
            Purchasing Behavior
          </h3>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Preferred Category:</dt>
              <dd className="font-semibold text-slate-100">{profile.preferred_category}</dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Primary Payment:</dt>
              <dd className="font-semibold text-slate-100 capitalize flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-slate-500" />
                {profile.preferred_payment_method.replace('_', ' ')}
              </dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Order Units Purchased:</dt>
              <dd className="font-semibold text-slate-100">{profile.total_items} items</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-400">Customer Lifetime Span:</dt>
              <dd className="font-semibold text-slate-100">{profile.customer_lifetime_days} days</dd>
            </div>
          </dl>
        </div>

        {/* Logistics & Delivery Experience */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-blue-400" />
            Logistics & Delivery Performance
          </h3>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Delivery Delay Rate:</dt>
              <dd className={`font-semibold ${profile.delivery_delay_rate > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {(profile.delivery_delay_rate * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Order Cancellation Rate:</dt>
              <dd className="font-semibold text-slate-100">
                {(profile.cancellation_rate * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Total Freight Paid:</dt>
              <dd className="font-semibold text-slate-100">R$ {profile.total_freight.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-400">Completed Orders:</dt>
              <dd className="font-semibold text-emerald-300">{profile.completed_orders} orders</dd>
            </div>
          </dl>
        </div>

        {/* Customer Satisfaction & Feedback */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400" />
            Satisfaction & Feedback
          </h3>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Average Review Rating:</dt>
              <dd className="font-bold text-amber-400 flex items-center gap-1">
                {profile.average_review_score === null || profile.average_review_score === undefined
                  ? 'No reviews yet'
                  : `${profile.average_review_score.toFixed(1)} / 5.0`}
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              </dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Reviews Submitted:</dt>
              <dd className="font-semibold text-slate-100">{profile.review_count} surveys</dd>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <dt className="text-slate-400">Review Sentiment:</dt>
              <dd className="font-semibold text-emerald-300">
                {profile.average_review_score === null || profile.average_review_score === undefined
                  ? 'No rating'
                  : profile.average_review_score >= 4.0
                    ? 'Highly Positive'
                    : profile.average_review_score >= 3.0
                      ? 'Neutral'
                      : 'Negative'}
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-400">Survey Response Rate:</dt>
              <dd className="font-semibold text-slate-100">100%</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Tabs: Timeline, Products, Reviews */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xs overflow-hidden">
        <div className="border-b border-slate-800 px-4 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 border-b-2 flex items-center gap-2 ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Order Transaction History ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`py-3 border-b-2 flex items-center gap-2 ${
              activeTab === 'products'
                ? 'border-blue-600 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Purchased SKUs ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 border-b-2 flex items-center gap-2 ${
              activeTab === 'reviews'
                ? 'border-blue-600 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            Customer Reviews ({reviews.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-3 border-b-2 flex items-center gap-2 ${
              activeTab === 'activity'
                ? 'border-blue-600 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Activity Timeline
          </button>
        </div>

        <div className="p-4">
          {/* Tab 1: Orders Timeline */}
          {activeTab === 'timeline' && (
            <div className="overflow-x-auto">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No order history recorded.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                      <th className="py-2.5 px-3">Order ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Items</th>
                      <th className="py-2.5 px-3 text-right">Merchandise</th>
                      <th className="py-2.5 px-3 text-right">Freight</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3">Delivery Delay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {orders.map((o) => (
                      <tr key={o.order_id} className="hover:bg-slate-900">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-100">{o.order_id}</td>
                        <td className="py-2.5 px-3 text-slate-400">{o.purchase_timestamp.slice(0, 16)}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              o.order_status === 'delivered'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-800'
                            }`}
                          >
                            {o.order_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">{o.item_count}</td>
                        <td className="py-2.5 px-3 text-right">R$ {o.total_merchandise_amount.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">R$ {o.total_freight_amount.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                          R$ {o.total_order_amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3">
                          {o.is_delayed ? (
                            <span className="text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              Delayed
                            </span>
                          ) : (
                            <span className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              On Time
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 2: Products */}
          {activeTab === 'products' && (
            <div className="overflow-x-auto">
              {products.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No items found for this customer.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                      <th className="py-2.5 px-3">Order ID</th>
                      <th className="py-2.5 px-3">Product SKU</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Freight</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {products.map((p, idx) => (
                      <tr key={`${p.order_id}_${p.order_item_id}_${idx}`} className="hover:bg-slate-900">
                        <td className="py-2.5 px-3 font-mono text-slate-400">{p.order_id.slice(0, 12)}...</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-100">{p.product_id}</td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">R$ {p.price.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">R$ {p.freight_value.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                          R$ {p.total_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 3: Reviews */}
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No survey feedback submitted.</div>
              ) : (
                reviews.map((r) => (
                  <div key={r.review_id} className="p-3 border border-slate-800 rounded-lg bg-slate-900/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < r.review_score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-slate-100">{r.review_score} / 5 Rating</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{r.review_creation_date.slice(0, 10)}</span>
                    </div>
                    {r.review_comment_message ? (
                      <p className="text-xs text-slate-300 italic bg-slate-900 p-2.5 rounded border border-slate-800">
                        "{r.review_comment_message}"
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">No verbal review text left by customer.</p>
                    )}
                    <div className="text-[10px] text-slate-500 font-mono">
                      Associated Order ID: {r.order_id}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {/* Tab 4: Activity Timeline (placed / delivered / reviewed, chronological) */}
          {activeTab === 'activity' && (
            <ActivityTimeline orders={orders} reviews={reviews} />
          )}
        </div>
      </div>
    </div>
  );
};

interface TimelineEvent {
  date: string;
  label: string;
  detail: string;
  kind: 'placed' | 'delivered' | 'review';
}

const ActivityTimeline: React.FC<{ orders: OrderItem[]; reviews: ReviewItem[] }> = ({
  orders,
  reviews,
}) => {
  const events: TimelineEvent[] = [];
  for (const o of orders) {
    events.push({
      date: o.purchase_timestamp.slice(0, 10),
      label: 'Order placed',
      detail: `${o.order_id.slice(0, 8)} · ${o.item_count} items · R$ ${o.total_order_amount.toFixed(2)} · ${o.order_status}`,
      kind: 'placed',
    });
    if (o.delivered_customer_date) {
      events.push({
        date: o.delivered_customer_date.slice(0, 10),
        label: o.is_delayed ? 'Delivered late' : 'Delivered',
        detail: `${o.order_id.slice(0, 8)} · estimated ${o.estimated_delivery_date.slice(0, 10)}`,
        kind: 'delivered',
      });
    }
  }
  for (const r of reviews) {
    events.push({
      date: r.review_creation_date.slice(0, 10),
      label: `Review submitted · ${r.review_score}/5`,
      detail: r.review_comment_message ? `"${r.review_comment_message}"` : 'No comment text',
      kind: 'review',
    });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (events.length === 0) {
    return <div className="text-center py-8 text-xs text-slate-500">No recorded activity.</div>;
  }

  const dot: Record<TimelineEvent['kind'], string> = {
    placed: 'bg-blue-500',
    delivered: 'bg-emerald-500',
    review: 'bg-amber-500',
  };

  return (
    <div className="space-y-0">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dot[e.kind]}`} />
            {i < events.length - 1 && <span className="w-px flex-1 bg-slate-800" />}
          </div>
          <div className="pb-5">
            <div className="text-[11px] text-slate-500 font-mono">{e.date}</div>
            <div className="text-xs font-semibold text-slate-100">{e.label}</div>
            <div className="text-xs text-slate-400">{e.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
