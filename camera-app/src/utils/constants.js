export const DEFECT_CLASS_COLORS = {
  'Broken stitch': '#e74c3c',
  'defect free': '#2ecc71',
  'hole': '#e67e22',
  'horizontal': '#3498db',
  'lines': '#9b59b6',
  'Needle mark': '#f1c40f',
  'Pinched fabric': '#1abc9c',
  'stain': '#e91e63',
  'Vertical': '#00bcd4',
};

export const STREAM_BOUNDARIES = {
  START: new TextEncoder().encode('--frame\r\n'),
  MID: new TextEncoder().encode('\r\n--frame\r\n'),
  HEADER_END: new TextEncoder().encode('\r\n\r\n'),
};

export const DEFAULT_STREAM_URL = 'http://localhost:8000/video_feed';

export const STATUS_API_URL = 'http://localhost:8000/status';
export const METRICS_API_URL = 'http://localhost:8000/metrics';
export const ALERTS_WS_URL = 'ws://localhost:8000/ws/alerts';
