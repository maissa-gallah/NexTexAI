import React, { useState, useEffect } from 'react';

export default function DashboardAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/alerts');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.event_type === 'threshold_exceeded') {
        setAlerts((prevAlerts) => [{...data.details, frame: data.frame}, ...prevAlerts]);
      }
    };

    return () => ws.close();
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <h3>⚠️ System Alerts</h3>
        <span className="alerts-count">{alerts.length}</span>
      </div>
      <div className="alerts-list">
        {alerts.map((alert, index) => (
          <div key={index} className="alert-card">
            <div className="alert-header">
              <span className="alert-icon">⚠️</span>
              <span className="alert-title">THRESHOLD EXCEEDED</span>
            </div>
            <div className="alert-body">
              <div className="alert-detail">
                <span className="alert-label">Defect Class</span>
                <span className="alert-value">{alert.class}</span>
              </div>
              <div className="alert-detail">
                <span className="alert-label">Confidence</span>
                <span className="alert-value confidence">{(alert.confidence * 100).toFixed(1)}%</span>
              </div>
              {alert.frame && (
                <div className="alert-detail">
                  <span className="alert-label">Frame</span>
                  <span className="alert-value">#{alert.frame}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
