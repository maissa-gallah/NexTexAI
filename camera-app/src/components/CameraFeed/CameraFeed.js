import React from 'react';
import { FaPause, FaCircle } from 'react-icons/fa';
import './CameraFeed.css';

export default function CameraFeed({
  isConnected,
  isStreaming,
  currentImageUrl,
  imageCount,
  fps,
  prediction,
}) {
  // Extracting details safely. Adjust key names (e.g., prediction.label/prediction.confidence) 
  // depending on your PredictionOverlay's props or API response structure.
  const className = prediction?.class || prediction?.label || 'No detection';
  const score = prediction?.score !== undefined 
    ? `${(prediction.score * 100).toFixed(1)}%` 
    : prediction?.confidence !== undefined 
      ? `${(prediction.confidence * 100).toFixed(1)}%` 
      : '';

  return (
    <div className="camera-feed-wrapper">
      {/* 1. Main Streaming Window */}
      <div className="feed-container">
        {!isStreaming && (
          <div className="paused-overlay">
            <div className="pause-icon"><FaPause /></div>
            <h2>Stream Paused</h2>
            <p>Click "Resume" to continue the feed</p>
          </div>
        )}

        {currentImageUrl && isStreaming && (
          <img
            className="feed-image"
            src={currentImageUrl}
            alt="Camera Feed"
          />
        )}

        {!currentImageUrl && isStreaming && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Connecting to stream...</p>
          </div>
        )}

        {/* Quality badge remains pinned inside the frame overlay */}
        {isConnected && isStreaming && (
          <div className={`quality-badge ${fps > 15 ? 'good' : fps > 5 ? 'medium' : 'poor'}`}>
            {fps > 15 ? <><FaCircle style={{ color: '#4caf50', fontSize: 12 }} /> Excellent</> : fps > 5 ? <><FaCircle style={{ color: '#ffd54f', fontSize: 12 }} /> Good</> : <><FaCircle style={{ color: '#ef5350', fontSize: 12 }} /> Poor</>}
          </div>
        )}
      </div>

      {/* 2. Centered Text Display Below the Stream Window */}
      {isStreaming && (
        <div className="feed-results-bottom">
          <div className="results-frame-info">
            Frame #{imageCount} | FPS: {fps}
          </div>
          {prediction && (
            <div className="results-prediction-info">
              Detected: <span className="highlight-class">{className}</span> 
              {score && <span className="highlight-score"> ({score})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}