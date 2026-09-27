export interface CustomerListItem {
  customer_key: number;
  customer_unique_id: string;
  first_order_date: string;
  last_order_date: string;
  total_orders: number;
  completed_orders: number;
  total_spend: number;
  average_order_value: number;
  days_since_last_order: number;
  rfm_score: string;
  customer_segment: string;
  cluster_id: number;
  estimated_clv: number;
  churn_probability: number;
  preferred_category: string;
  preferred_region: string;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_status: string;
  risk_tier: string;
}

export interface CustomerDetail extends CustomerListItem {
  total_items: number;
  total_freight: number;
  average_freight: number;
  review_count: number;
  average_review_score: number;
  purchase_frequency: number;
  customer_lifetime_days: number;
  rfm_recency: number;
  rfm_frequency: number;
  rfm_monetary: number;
  preferred_payment_method: string;
  delivery_delay_rate: number;
  cancellation_rate: number;
  cluster_name: string;
  cluster_persona: string;
  recommended_strategy: string;
}

export interface OrderItem {
  order_id: string;
  order_status: string;
  purchase_timestamp: string;
  delivered_customer_date?: string;
  estimated_delivery_date: string;
  item_count: number;
  total_merchandise_amount: number;
  total_freight_amount: number;
  total_order_amount: number;
  is_delayed: number;
}

export interface ProductItem {
  order_id: string;
  order_item_id: number;
  product_id: string;
  category: string;
  price: number;
  freight_value: number;
  total_amount: number;
}

export interface ReviewItem {
  review_id: string;
  order_id: string;
  review_score: number;
  review_comment_message?: string;
  review_creation_date: string;
}

export interface SegmentSummary {
  customer_segment: string;
  customer_count: number;
  mean_spend: number;
  mean_aov: number;
  mean_recency_days: number;
  mean_churn_probability: number;
  share_of_customers: number;
}

export interface MlCluster {
  cluster_id: number;
  cluster_name: string;
  customer_count: number;
  share_of_customers: number;
  mean_spend: number;
  mean_frequency: number;
  mean_recency: number;
  mean_review_score: number;
  mean_delay_rate: number;
  business_persona: string;
  recommended_strategy: string;
}

export interface CohortCell {
  cohort_month: string;
  period_number: number;
  cohort_size: number;
  active_customers: number;
  retention_rate: number;
  total_period_revenue: number;
}

export interface ChurnOverview {
  champion_model: {
    model_name: string;
    roc_auc: number;
    pr_auc: number;
    precision_score: number;
    recall_score: number;
    f1_score: number;
    brier_score: number;
    is_champion: number;
    trained_at: string;
  };
  risk_distribution: Array<{
    risk_tier: string;
    customer_count: number;
    mean_probability: number;
  }>;
}

export interface QualityResult {
  check_id: string;
  check_name: string;
  target_schema: string;
  target_table: string;
  check_type: string;
  evaluated_rows: number;
  passed_rows: number;
  failed_rows: number;
  pass_rate: number;
  status: string;
  executed_at: string;
  severity?: string;
  description?: string;
  run_id?: string;
}

export interface PipelineRun {
  run_id: string;
  pipeline_name: string;
  start_time: string;
  end_time?: string;
  duration_seconds: number;
  status: string;
  rows_read: number;
  rows_loaded: number;
  rows_rejected: number;
  error_message?: string;
}

export interface PipelineTask {
  task_execution_id: string;
  run_id: string;
  task_id: string;
  status: string;
  start_time: string;
  end_time?: string;
  duration_seconds: number;
  log_output?: string;
}

export interface AffinityRule {
  rule_id: number;
  antecedent: string;
  consequent: string;
  antecedent_support: number;
  consequent_support: number;
  support: number;
  confidence: number;
  lift: number;
}
