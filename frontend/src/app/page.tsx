'use client';

import { useEffect, useState } from 'react';

interface ServiceMetric {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyP99: string;
  errorRate: string;
}

interface SystemMetrics {
  cpuUsage: string;
  memoryUsage: string;
  activeTracesCount: number;
}

interface DashboardData {
  services: ServiceMetric[];
  systemMetrics: SystemMetrics;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:4000/api/v1/dashboard/metrics')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch metrics from backend');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Tracelyt Observability
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Real-time telemetry, tracing, and AI investigation engine
          </p>
        </div>
        <div style={{ background: '#1e293b', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #334155' }}>
          🟢 System Status: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>Operational</span>
        </div>
      </header>

      {loading && <p style={{ color: '#94a3b8' }}>Loading telemetry data from Fastify backend...</p>}
      {error && (
        <div style={{ background: '#7f1d1d', border: '1px solid #f87171', padding: '1rem', borderRadius: '8px', color: '#fca5a5' }}>
          <strong>Connection Error:</strong> {error}. Ensure the Fastify backend is running on port 4000.
        </div>
      )}

      {data && (
        <>
          {/* System Overview Cards */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>CPU Usage</h3>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#38bdf8' }}>{data.systemMetrics.cpuUsage}</p>
            </div>
            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>Memory Usage</h3>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#818cf8' }}>{data.systemMetrics.memoryUsage}</p>
            </div>
            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>Active Traces</h3>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#4ade80' }}>{data.systemMetrics.activeTracesCount.toLocaleString()}</p>
            </div>
          </section>

          {/* Services Table */}
          <section style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>
              Monitored Services
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Service Name</th>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1.5rem' }}>P99 Latency</th>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((service, index) => (
                  <tr key={index} style={{ borderTop: '1px solid #334155' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: '500' }}>{service.name}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: service.status === 'healthy' ? '#065f46' : '#7f1d1d',
                        color: service.status === 'healthy' ? '#6ee7b7' : '#fca5a5'
                      }}>
                        {service.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace' }}>{service.latencyP99}</td>
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace' }}>{service.errorRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
