import React from 'react';
import { useFleetTuning } from './hooks/useFleetTuning';
import { FleetBarometerCards } from './components/FleetBarometerCards';
import { LeadArchitectCard } from './components/LeadArchitectCard';
import { SpecialistAgentGrid } from './components/SpecialistAgentGrid';
import { ModelFallbackMatrix } from './components/ModelFallbackMatrix';

export const FleetTuningPage: React.FC = () => {
  const {
    architect,
    specialists,
    clusterStats,
    openAgentDrawer,
    handleRunNow
  } = useFleetTuning();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-16">
        {/* Top Command Matrix & Cluster Barometer */}
        <FleetBarometerCards stats={clusterStats} />

        {/* Lead Architect Card */}
        <LeadArchitectCard
          architect={architect}
          onOpenDrawer={openAgentDrawer}
          onRunNow={handleRunNow}
        />

        {/* Dedicated Specialist Agents Grid */}
        <SpecialistAgentGrid
          specialists={specialists}
          onOpenDrawer={openAgentDrawer}
          onRunNow={handleRunNow}
        />

        {/* Provider Fallback & Routing Matrix */}
        <ModelFallbackMatrix />
      </div>
    </div>
  );
};

export default FleetTuningPage;
