import React from 'react';
import { useOverviewData } from './hooks/useOverviewData';
import { HeroMetricCard } from './components/HeroMetricCard';
import { AutonomousPipelineCard } from './components/AutonomousPipelineCard';
import { AgentActivityFeed } from './components/AgentActivityFeed';
import { SystemHealthGauge } from './components/SystemHealthGauge';

export const OverviewPage: React.FC = () => {
  const {
    agents,
    filteredWorkpacks,
    activePipelineFilter,
    setActivePipelineFilter,
    timeframe,
    setTimeframe,
    showTimeframeMenu,
    setShowTimeframeMenu,
    metrics,
    health,
    isBenchmarking,
    handleBenchmark,
    openTaskDrawer,
    openAgentDrawer,
    setIsNewWorkpackModalOpen,
    setCurrentTab
  } = useOverviewData();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-5 max-w-[1560px] mx-auto pb-12">
        {/* Top Header & Quick Action Ribbon */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-mono text-primary font-medium">synthetix</span>
              <span className="text-on-surface-muted">/</span>
              <span className="text-on-surface-variant font-mono">factory-overview</span>
              <span className="text-on-surface-muted">•</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-fluent-success-subtle text-fluent-success border border-fluent-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
                6 SPECIALISTS ACTIVE
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                AUTONOMOUS VELOCITY OPTIMAL
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => alert('Executive Telemetry report downloaded (PDF/Markdown export).')}
                className="fluent-btn-default flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium"
              >
                <span className="material-symbols-outlined text-[16px] text-on-surface-muted">
                  picture_as_pdf
                </span>
                <span className="hidden sm:inline">Download Summary</span>
                <span className="sm:hidden">Export</span>
              </button>

              <div className="relative inline-block text-left">
                <button
                  onClick={() => setShowTimeframeMenu((prev) => !prev)}
                  className="fluent-btn-default flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-muted">
                    schedule
                  </span>
                  <span>{timeframe}</span>
                  <span className="material-symbols-outlined text-[15px] text-on-surface-muted">
                    expand_more
                  </span>
                </button>

                {showTimeframeMenu && (
                  <div className="absolute right-0 mt-1 w-44 rounded-md acrylic-card py-1 z-30 shadow-2xl bg-[#262626]">
                    {['Last 6 Hours', 'Last 24 Hours', 'Last 7 Days', 'Current Sprint'].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTimeframe(t);
                          setShowTimeframeMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-white/[0.08] rounded transition-colors ${
                          timeframe === t ? 'text-primary font-semibold' : 'text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsNewWorkpackModalOpen(true)}
                className="fluent-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold"
              >
                <span className="material-symbols-outlined text-[17px]">add_circle</span>
                <span>Dispatch Custom Epic</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pt-1">
            <h1 className="text-[24px] font-semibold tracking-tight text-white flex items-center gap-2.5">
              Autonomous Factory Overview
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
                v4.2-enterprise
              </span>
            </h1>
            <p className="text-[12.5px] text-on-surface-variant">
              Continuous multi-agent software engineering across 3 repository branches
            </p>
          </div>
        </div>

        {/* Hero KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <HeroMetricCard key={metric.id} metric={metric} />
          ))}
        </div>

        {/* Main Operational Section: Assembly Line & Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <AutonomousPipelineCard
              workpacks={filteredWorkpacks}
              activeFilter={activePipelineFilter}
              onFilterChange={setActivePipelineFilter}
              onSelectWorkpack={openTaskDrawer}
              onViewAll={() => setCurrentTab('task-matrix')}
            />
          </div>

          <div>
            <SystemHealthGauge
              health={health}
              isBenchmarking={isBenchmarking}
              onBenchmark={handleBenchmark}
            />
          </div>
        </div>

        {/* Specialist Swarm Status Grid */}
        <AgentActivityFeed
          agents={agents}
          onOpenAgent={openAgentDrawer}
          onViewFleet={() => setCurrentTab('fleet-tuning')}
        />
      </div>
    </div>
  );
};

export default OverviewPage;
