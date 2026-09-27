# Unsupervised Customer Segmentation (K-Means)

## 1. Objective & Methodology
While RFM assigns rule-based quintile groupings, unsupervised clustering reveals multi-dimensional behavioural archetypes directly from latent patterns in customer features without human preconceptions.

---

## 2. Feature Vector & Preprocessing
To eliminate dimensional scale distortion (e.g. monetary values in hundreds of BRL versus frequency counts under 10), all features are standardized using `StandardScaler` ($\mu = 0, \sigma = 1$):
- $\log(1 + \text{recency\_days})$
- $\log(1 + \text{order\_frequency})$
- $\log(1 + \text{total\_spend})$
- $\log(1 + \text{average\_order\_value})$
- $\text{category\_diversity}$ (count of unique product categories)
- $\text{delivery\_delay\_rate}$ ($[0, 1]$)
- $\text{average\_review\_score}$ ($[1, 5]$)

---

## 3. Hyperparameter Tuning & Silhouette Analysis
We evaluate candidate cluster counts $k \in [3, 4, 5]$ by computing the **Silhouette Score** on a 5,000-row sample (`RandomState(42)`) over log-scaled recency/frequency/spend/AOV standardized with `StandardScaler`, then refit the winner on the full mart (`KMeans(random_state=42, n_init=10)`). The winning $k$ and its score are logged per run; see `monitoring.pipeline_tasks` (`run_models` log output). Persona names are assigned from profiled cluster stats, never by cluster id (ADR 008).

---

## 4. Discovered Cluster Profiles (latest verified run)
1. **Repeat Loyalists** — highest mean frequency (2.11 orders); smallest, most valuable repeat core.
2. **Recent First-Time Buyers** — lowest mean recency (~46d); single-purchase, recently active.
3. **Friction-Impaired At-Risk Buyers** — highest mean delivery-delay rate (~0.089).
4. **Lapsed Occasional Shoppers** — highest mean recency (~286d).
Per-cluster review score and delay rate are computed from warehouse facts. Exact counts/means per run: `ml.customer_segments`.
2. **Cluster 1: "Satisfied Recent Buyers"**
   - Single purchase, low recency (< 120 days), excellent review scores (4.7/5), zero delivery delays.
   - Primary target for second-order conversion campaigns.
   - Share of Customer Base: ~38.2%.
3. **Cluster 2: "Friction-Impaired At-Risk Buyers"**
   - Moderate-to-high spend, high delivery delay rate (mean = 68%), suppressed review score (mean = 1.8/5).
   - Root cause: Logistics failures. Immediate recovery intervention required.
   - Share of Customer Base: ~11.8%.
4. **Cluster 3: "Dormant / One-Time Occasional Buyers"**
   - Low recency (> 350 days elapsed), single small-basket purchase, average satisfaction (3.9/5).
   - Share of Customer Base: ~45.5%.
