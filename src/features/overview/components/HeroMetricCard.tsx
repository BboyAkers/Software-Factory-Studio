import React from 'react';
import type { OverviewMetricItem } from '../lib/overviewModel';

interface HeroMetricCardProps {
  metric: OverviewMetricItem;
}

export const HeroMetricCard: React.FC<HeroMetricCardProps> = ({ metric }) => {
  return (
    <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden transition-all hover:border-fluent-border-hover group">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-on-surface-variant group-hover:text-white transition-colors">
          {metric.label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${metric.color}15`, color: metric.color }}
        >
          <span className="material-symbols-outlined text-[19px]">{metric.icon}</span>
        </div>
      </div>

      <div className="my-2.5">
        <div className="text-[26px] font-bold text-white tracking-tight leading-none">
          {metric.value}
        </div>
        <div className="text-[11.5px] text-on-surface-muted mt-1 truncate">
          {metric.subValue}
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
        <span
          className={`flex items-center gap-1 font-medium ${
            metric.trend === 'up'
              ? 'text-fluent-success'
              : metric.trend === 'down'
              ? 'text-primary'
              : 'text-on-surface-muted'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {metric.trend === 'up' ? 'trending_up' : metric.trend === 'down' ? 'trending_down' : 'remove'}
          </span>
          {metric.delta}
        </span>

        {/* Micro sparkline */}
        <div className="flex items-end gap-1 h-3.5">
          {metric.sparkline.map((val, idx) => (
            <div
              key={idx}
              className="w-1 rounded-t transition-all group-hover:opacity-100 opacity-60"
              style={{
                height: `${Math.max(20, Math.min(100, (val / 100) * 100))}%`,
                backgroundColor: metric.color
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
