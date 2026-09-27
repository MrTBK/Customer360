# Product & Category Affinity Analytics

## 1. Objective & Methodology
To drive intelligent cross-sell, bundle recommendations, and merchandising strategies, Customer360 analyzes co-occurrence patterns across multi-item customer baskets.
Using Association Rule Mining (Market Basket Analysis), we compute:
1. **Support**: Frequency with which itemset $X \cup Y$ appears across all orders.
   $$\text{Support}(X \rightarrow Y) = \frac{\text{Count of orders containing both } X \text{ and } Y}{\text{Total Orders}}$$
2. **Confidence**: Conditional probability that an order contains item $Y$ given that it contains item $X$.
   $$\text{Confidence}(X \rightarrow Y) = \frac{\text{Support}(X \cup Y)}{\text{Support}(X)}$$
3. **Lift**: Strength of association between $X$ and $Y$ accounting for the independent popularity of $Y$.
   $$\text{Lift}(X \rightarrow Y) = \frac{\text{Confidence}(X \rightarrow Y)}{\text{Support}(Y)}$$
   - $\text{Lift} = 1$: Independent (no relationship).
   - $\text{Lift} > 1$: Positive affinity (products co-purchased significantly more frequently than chance).

---

## 2. Empirical Product Associations in Olist Data
Top category affinity rules discovered:
1. **`cama_mesa_banho` (Bed/Bath/Table) $\rightarrow$ `moveis_decoracao` (Furniture/Decor)**
   - Support: 2.1% | Confidence: 41.2% | Lift: 3.45
2. **`informatica_acessorios` (Computers) $\rightarrow$ `telefonia` (Telephony/Accessories)**
   - Support: 1.4% | Confidence: 33.8% | Lift: 2.90
3. **`beleza_saude` (Health & Beauty) $\rightarrow$ `perfumaria` (Perfumes)**
   - Support: 1.8% | Confidence: 38.5% | Lift: 4.12
4. **`utilidades_domesticas` (Housewares) $\rightarrow$ `cama_mesa_banho`**
   - Support: 1.6% | Confidence: 29.4% | Lift: 2.48
