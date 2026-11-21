'use client';

import { useEffect, useState } from 'react';

interface OperationMetrics {
  operationName: string;
  requestCount: number;
  avgMs: number;
  p95Ms: number;
  errorRate: number;
}

interface MetricsResponse {
  projectId: string;
  window: string;
  summary: {
    requestCount: number;
    avgMs: number;
    p95Ms: number;
    errorRate: number;
  };
  operations: OperationMetrics[];
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return `${Math.round(ms || 0)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatPercent(rate: number): string {
  return `${((rate || 0) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/metrics', { cache: 'no-store' });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error ?? 'Failed to fetch metrics from backend');
          setLoading(false);
          return;
        }
        setData(body);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics from backend');
        setLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Tracelyt Observability
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            API health for the last 5 minutes
          </p>
        </div>
        <div style={{ background: '#1e293b', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #334155' }}>
          Window: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>5 minutes</span>
        </div>
      </header>

      {loading && <p style={{ color: '#94a3b8' }}>Loading API metrics from the Fastify backend...</p>}
      {error && (
        <div style={{ background: '#7f1d1d', border: '1px solid #f87171', padding: '1rem', borderRadius: '8px', color: '#fca5a5', marginBottom: '1rem' }}>
          <strong>Connection Error:</strong> {error}. Ensure the Fastify backend is running on port 4000.
        </div>
      )}

      {data && (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <MetricCard label="GraphQL requests" value={data.summary.requestCount.toLocaleString()} color="#38bdf8" />
            <MetricCard label="Average response" value={formatDuration(data.summary.avgMs)} color="#818cf8" />
            <MetricCard label="P95 response" value={formatDuration(data.summary.p95Ms)} color="#fbbf24" />
            <MetricCard label="Error rate" value={formatPercent(data.summary.errorRate)} color={data.summary.errorRate > 0 ? '#fca5a5' : '#4ade80'} />
          </section>

          <section style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>
              Slowest GraphQL operations
            </div>
            {data.operations.length === 0 ? (
              <p style={{ padding: '1.5rem', margin: 0, color: '#94a3b8' }}>No API events in the last 5 minutes.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.75rem 1.5rem' }}>Operation</th>
                    <th style={{ padding: '0.75rem 1.5rem' }}>Requests</th>
                    <th style={{ padding: '0.75rem 1.5rem' }}>Average</th>
                    <th style={{ padding: '0.75rem 1.5rem' }}>P95</th>
                    <th style={{ padding: '0.75rem 1.5rem' }}>Error rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operations.map((operation) => (
                    <tr key={operation.operationName} style={{ borderTop: '1px solid #334155' }}>
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{operation.operationName}</td>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace' }}>{operation.requestCount.toLocaleString()}</td>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace' }}>{formatDuration(operation.avgMs)}</td>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace' }}>{formatDuration(operation.p95Ms)}</td>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace', color: operation.errorRate > 0 ? '#fca5a5' : '#e2e8f0' }}>
                        {formatPercent(operation.errorRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155' }}>
      <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>{label}</h3>
      <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color }}>{value}</p>
    </div>
  );
}
