import React, { useState, useEffect, useCallback } from 'react';
import { STATUS_API_URL, METRICS_API_URL } from '../../utils/constants';
import './CloudStatus.css';

export default function CloudStatus() {
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const [metricsRes, healthRes] = await Promise.all([
        fetch(METRICS_API_URL),
        fetch(STATUS_API_URL),
      ]);
      if (metricsRes.ok && healthRes.ok) {
        setMetrics(await metricsRes.json());
        setHealth(await healthRes.json());
        setError(null);
      }
    } catch (_) {
      setError('Unable to reach backend');
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 500);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (!metrics && !error) {
    return (
      <div className="cloud-status-panel">
        <div className="cloud-status-header">
          <h3>☁️ Cloud & System Health</h3>
        </div>
        <div className="cloud-status-loading">Loading status...</div>
      </div>
    );
  }

  const uptime = metrics?.uptime?.human || '—';
  const cloudUploads = metrics?.cloud_uploads?.enqueued ?? 0;
  const activeWs = metrics?.connections?.active_websockets ?? 0;
  const wsBroadcasts = metrics?.websocket?.broadcasts ?? 0;
  const processingErrors = metrics?.errors?.processing_errors ?? 0;
  const totalFrames = metrics?.frames?.total_processed ?? 0;
  const queueBacklog = metrics?.stream?.queue_backlog ?? 0;
  const queueMax = metrics?.stream?.queue_max ?? '—';
  const queueUtil = metrics?.stream?.queue_utilization_pct ?? 0;

  const trackedClasses = health?.tracked_anomaly_classes?.length ?? 0;
  const imagesIngested = health?.images_ingested ?? 0;
  const newAnomalyClasses = metrics?.anomalies?.new_classes_by_class
    ? Object.entries(metrics.anomalies.new_classes_by_class)
    : [];
  const newClassesDiscovered = metrics?.anomalies?.new_classes_discovered ?? 0;

  const overallHealth = error
    ? 'error'
    : processingErrors > 10
    ? 'degraded'
    : 'healthy';

  return (
    <div className="cloud-status-panel">
      <div className="cloud-status-header" onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer' }}>
        <h3>☁️ Cloud & System Health</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`cloud-status-badge ${overallHealth}`}>
            {overallHealth === 'healthy' ? '🟢 Healthy' : overallHealth === 'degraded' ? '🟡 Degraded' : '🔴 Error'}
          </span>
          <span className={`cloud-status-toggle ${collapsed ? 'collapsed' : ''}`}>▼</span>
        </div>
      </div>

      {!collapsed && <div className="cloud-status-body">
        {/* ── Uptime & Frames ── */}
        <div className="cloud-status-section-title">System</div>
        <div className="cloud-status-section">
          <div className="cloud-status-item">
            <span className="cloud-status-label">Uptime</span>
            <span className="cloud-status-value">{uptime}</span>
          </div>
          <div className="cloud-status-item">
            <span className="cloud-status-label">Frames Ingested</span>
            <span className="cloud-status-value">{totalFrames || imagesIngested}</span>
          </div>
          <div className="cloud-status-item">
            <span className="cloud-status-label">Tracked Classes</span>
            <span className="cloud-status-value">{trackedClasses}</span>
          </div>
        </div>

        {/* ── Cloud / MinIO ── */}
        <div className="cloud-status-section-title">☁️ Cloud Storage (MinIO)</div>
        <div className="cloud-status-section">
          <div className="cloud-status-item">
            <span className="cloud-status-label">Uploads Enqueued</span>
            <span className="cloud-status-value">{cloudUploads}</span>
          </div>
          <div className="cloud-status-item">
            <span className="cloud-status-label">Queue Backlog</span>
            <span className="cloud-status-value">{queueBacklog} / {queueMax}</span>
          </div>
          <div className="cloud-status-bar-track">
            <div
              className="cloud-status-bar-fill"
              style={{ width: `${Math.min(queueUtil, 100)}%` }}
            />
          </div>
        </div>

        {/* ── Messaging ── */}
        <div className="cloud-status-section-title">📨 Messaging</div>
        <div className="cloud-status-section">
          <div className="cloud-status-item">
            <span className="cloud-status-label">Active WebSockets</span>
            <span className="cloud-status-value">{activeWs}</span>
          </div>
          <div className="cloud-status-item">
            <span className="cloud-status-label">WS Broadcasts</span>
            <span className="cloud-status-value">{wsBroadcasts}</span>
          </div>
        </div>

        {/* ── New Anomaly Classes ── */}
        {newAnomalyClasses.length > 0 && (
          <>
            <div className="cloud-status-section-title">🆕 New Anomaly Classes</div>
            <div className="cloud-status-section">
              <div className="cloud-status-item">
                <span className="cloud-status-label">Total New Classes</span>
                <span className="cloud-status-value">{newClassesDiscovered}</span>
              </div>
              <div className="cloud-status-anomaly-list">
                {newAnomalyClasses.map(([cls, count]) => (
                  <div key={cls} className="cloud-status-anomaly-row">
                    <span className="cloud-status-anomaly-class">{cls}</span>
                    <span className="cloud-status-anomaly-count">{count} frame{count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Errors ── */}
        <div className="cloud-status-section-title">⚠️ Errors</div>
        <div className="cloud-status-section">
          <div className="cloud-status-item">
            <span className="cloud-status-label">Processing Errors</span>
            <span className={`cloud-status-value ${processingErrors > 0 ? 'error' : ''}`}>
              {processingErrors}
            </span>
          </div>
        </div>

        {error && (
          <div className="cloud-status-error">
            ⚠️ {error}
          </div>
        )}
      </div>}
    </div>
  );
}
