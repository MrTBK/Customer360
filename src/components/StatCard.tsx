import React from 'react';
import { LucideIcon, Info } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  help?: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  badge?: string;
  badgeColor?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  help,
  icon: Icon,
  trend,
  badge,
  badgeColor = 'gray',
}) => {
  const badgeStyles = {
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    red: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    gray: 'bg-slate-800 text-slate-300 border-slate-800',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          {label}
          {help && (
            <span title={help} aria-label={`Definition: ${help}`} className="cursor-help">
              <Info className="w-3 h-3 text-slate-500" />
            </span>
          )}
        </span>
        {Icon && (
          <div className="p-2 bg-slate-900 border border-slate-800 rounded-md text-slate-400">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold tracking-tight text-slate-100">{value}</div>
          {badge && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${badgeStyles[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>

        {(subValue || trend) && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            {trend && (
              <span className={`font-semibold ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trend.value}
              </span>
            )}
            {subValue && <span>{subValue}</span>}
          </div>
        )}
      </div>
    </div>
  );
};
