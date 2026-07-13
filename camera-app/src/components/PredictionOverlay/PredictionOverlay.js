import React from 'react';
import { DEFECT_CLASS_COLORS } from '../../utils/constants';
import './PredictionOverlay.css';

export default function PredictionOverlay({ prediction, imageCount }) {
  const predColor = prediction
    ? DEFECT_CLASS_COLORS[prediction.class] || '#667eea'
    : '#667eea';

  if (!prediction) return null;

  return (
    <div className="prediction-overlay" style={{ borderColor: predColor }}>
      <div className="prediction-header" style={{ backgroundColor: predColor }}>
        <span className="prediction-class">{prediction.class}</span>
        <span className="prediction-confidence">
          {(prediction.confidence * 100).toFixed(1)}%
        </span>
      </div>
      <div className="prediction-bar-track">
        <div
          className="prediction-bar-fill"
          style={{
            width: `${(prediction.confidence * 100).toFixed(1)}%`,
            backgroundColor: predColor,
          }}
        />
      </div>
      <div className="prediction-counter">
        Frame #{prediction.counter || imageCount}
      </div>
    </div>
  );
}
