import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Layers,
  CalendarDays,
  AlertTriangle,
  ShoppingBag,
  CheckCircle,
  GitBranch,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';

export type NavItem =
  | 'overview'
  | 'customers'
  | 'customer360'
  | 'segments'
  | 'cohorts'
  | 'churn'
  | 'products'
  | 'quality'
  | 'pipelines';

interface TopbarProps {
  currentTab: NavItem;
  onSelectTab: (tab: NavItem) => void;
  user: { username: string; role: string };
  onLogout: () => void;
}

const items: Array<{ id: NavItem; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'customer360', label: 'Customer 360', icon: UserCheck },
  { id: 'segments', label: 'Segments', icon: Layers },
  { id: 'cohorts', label: 'Cohorts', icon: CalendarDays },
  { id: 'churn', label: 'Churn', icon: AlertTriangle },
  { id: 'products', label: 'Products', icon: ShoppingBag },
  { id: 'quality', label: 'Quality', icon: CheckCircle },
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
];

export const Topbar: React.FC<TopbarProps> = ({ currentTab, onSelectTab, user, onLogout }) => {
  const { data: health, isError: healthError } = useQuery<{
    status: string;
    database: string;
    version: string;
  }>({
    queryKey: ['health'],
    queryFn: () => fetchApi('/health'),
    refetchInterval: 30000,
  });

  const { data: segmentsData } = useQuery<{ total_customers: number }>({
    queryKey: ['segments-total'],
    queryFn: () => fetchApi('/segments'),
  });

  const apiLive = !healthError && health !== undefined;

  const tabButtons = items.map((item) => {
    const Icon = item.icon;
    const isActive = currentTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onSelectTab(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {item.label}
      </button>
    );
  });

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
      <div className="relative flex items-center gap-4 px-4 h-14">
        <div className="flex items-center gap-2.5 shrink-0 relative z-10">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-xs tracking-wider">
            360
          </div>
          <div className="leading-none">
            <div className="text-sm font-bold text-white tracking-tight">Customer360</div>
            <div className="text-[10px] text-slate-500 font-medium tracking-wider uppercase mt-0.5">
              {segmentsData?.total_customers !== undefined
                ? `${(segmentsData.total_customers / 1000).toFixed(1)}k customers`
                : 'Intelligence Platform'}
            </div>
          </div>
        </div>

        {/* Desktop: page-centered tabs */}
        <nav
          className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[62vw] overflow-x-auto"
          aria-label="Primary"
        >
          {tabButtons}
        </nav>

        <div className="hidden md:flex items-center gap-3 shrink-0 text-xs ml-auto relative z-10">
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-medium ${
              apiLive
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                : 'text-rose-300 bg-rose-500/10 border-rose-500/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {apiLive ? 'API Live' : 'API Down'}
          </span>
          <span className="text-slate-400 font-medium hidden lg:inline" title={`Signed in as ${user.username} (${user.role})`}>
            {user.username} · {user.role}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 font-medium"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Mobile: scrollable tabs */}
      <nav className="md:hidden flex items-center gap-1 px-3 pb-2.5 overflow-x-auto" aria-label="Primary">
        {tabButtons}
      </nav>
    </header>
  );
};
