/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Topbar, NavItem } from './components/Topbar';
import { OverviewPage } from './pages/OverviewPage';
import { CustomersPage } from './pages/CustomersPage';
import { Customer360Page } from './pages/Customer360Page';
import { SegmentsPage } from './pages/SegmentsPage';
import { CohortsPage } from './pages/CohortsPage';
import { ChurnPage } from './pages/ChurnPage';
import { ProductsPage } from './pages/ProductsPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { PipelinesPage } from './pages/PipelinesPage';
import { LoginPage, SessionUser } from './pages/LoginPage';
import { fetchApi, getToken, setToken } from './api/client';
import { LoadingState } from './components/States';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
      retry: 1,
    },
  },
});

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavItem>('overview');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('861eff4711a542e4b93843c6dd7febb0');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetchApi<SessionUser>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setCurrentTab('customer360');
  };

  const handleLogout = () => {
    fetchApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken('');
    setUser(null);
    queryClient.clear();
  };

  if (!authChecked) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-slate-950">
          <LoadingState message="Checking session..." />
        </div>
      </QueryClientProvider>
    );
  }

  if (!user) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage onLogin={(u) => setUser(u)} />
      </QueryClientProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-950 font-sans text-slate-200 antialiased">
        <Topbar currentTab={currentTab} onSelectTab={(tab) => setCurrentTab(tab)} user={user} onLogout={handleLogout} />

        <main className="p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'overview' && (
              <OverviewPage
                onSelectCustomer={handleSelectCustomer}
                onNavigateTab={(tab) => setCurrentTab(tab)}
              />
            )}

            {currentTab === 'customers' && (
              <CustomersPage onSelectCustomer={handleSelectCustomer} />
            )}

            {currentTab === 'customer360' && (
              <Customer360Page
                customerId={selectedCustomerId}
                onBack={() => setCurrentTab('customers')}
                onSelectCustomer={handleSelectCustomer}
              />
            )}

            {currentTab === 'segments' && (
              <SegmentsPage onSelectCustomer={handleSelectCustomer} />
            )}

            {currentTab === 'cohorts' && <CohortsPage />}

            {currentTab === 'churn' && <ChurnPage />}

            {currentTab === 'products' && <ProductsPage />}

            {currentTab === 'quality' && <DataQualityPage />}

            {currentTab === 'pipelines' && <PipelinesPage />}
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}
