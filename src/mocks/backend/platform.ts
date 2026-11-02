import { stepEvals, syncAgentActivity } from './agents';
import type { ProjectState } from './store';

/**
 * The simulator calls this on every tick for work that belongs to the platform services: agent eval
 * progress and each specialist's 24 h activity. Everything derives from the virtual clock, so how often
 * it runs does not change the outcome. Benchmarks finish through scheduled tasks.
 */
export function tickPlatform(ps: ProjectState): void {
  stepEvals(ps);
  syncAgentActivity(ps);
}
