import type { HttpHandler } from 'msw/http';
import { healthView, latestBenchmark, overviewMetrics, startBenchmark } from '../backend/overview';
import type { Router } from '../http';

export function overviewHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/overview/metrics', ({ ps, query }) => overviewMetrics(ps, query.get('window'))),

    r.get('/overview/health', ({ ps }) => healthView(ps)),

    r.post('/benchmarks', { capability: 'benchmark.run', status: 202 }, ({ ps, actor }) => startBenchmark(ps, actor)),

    r.get('/benchmarks/latest', ({ ps }) => latestBenchmark(ps)),
  ];
}
