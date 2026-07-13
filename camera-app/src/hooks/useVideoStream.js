import { useState, useRef, useCallback, useEffect } from 'react';
import { consumeStream } from '../utils/streamParser';
import { DEFAULT_STREAM_URL } from '../utils/constants';

export function useVideoStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [imageCount, setImageCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(DEFAULT_STREAM_URL);
  const [prediction, setPrediction] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);

  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const streamStateRef = useRef({ abortController: null, active: false });
  const lastImageUrlRef = useRef(null);

  // ── Update FPS counter ──────────────────────────────────────────────
  const tallyFrame = useCallback(() => {
    frameCountRef.current += 1;
    setImageCount(prev => prev + 1);
    setError(null);

    const now = Date.now();
    if (now - lastFpsUpdateRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }
  }, []);

  // ── Start the stream reader ─────────────────────────────────────────
  const startStream = useCallback(async (url) => {
    const state = streamStateRef.current;
    if (state.abortController) {
      state.abortController.abort();
    }
    state.active = true;

    const abortController = new AbortController();
    state.abortController = abortController;

    frameCountRef.current = 0;
    lastFpsUpdateRef.current = Date.now();

    try {
      setIsConnected(true);
      setError(null);

      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();

      await consumeStream(
        reader,
        // onJson – metadata frame
        (data) => {
          setPrediction(data);
          if (data.counter !== undefined) {
            setImageCount(data.counter);
          }
        },
        // onImage – JPEG frame
        (jpegBytes) => {
          const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
          const objectUrl = URL.createObjectURL(blob);

          if (lastImageUrlRef.current) {
            URL.revokeObjectURL(lastImageUrlRef.current);
          }
          lastImageUrlRef.current = objectUrl;

          setCurrentImageUrl(objectUrl);
          tallyFrame();
        },
        abortController.signal
      );
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(`Stream error: ${err.message}`);
      setIsConnected(false);

      if (state.active) {
        setTimeout(() => {
          if (state.active) startStream(streamUrl);
        }, 3000);
      }
    } finally {
      if (state.abortController === abortController) {
        setIsConnected(false);
      }
    }
  }, [streamUrl, tallyFrame]);

  // ── Stop the stream ─────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    const state = streamStateRef.current;
    state.active = false;
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    if (lastImageUrlRef.current) {
      URL.revokeObjectURL(lastImageUrlRef.current);
      lastImageUrlRef.current = null;
    }
    setCurrentImageUrl(null);
    setIsConnected(false);
  }, []);

  // ── Toggle / pause / resume ─────────────────────────────────────────
  const toggleStream = useCallback(() => {
    setIsStreaming(prev => !prev);
  }, []);

  const refreshStream = useCallback(() => {
    stopStream();
    setTimeout(() => setIsStreaming(true), 50);
  }, [stopStream]);

  const updateStreamUrl = useCallback((newUrl) => {
    setStreamUrl(newUrl);
    setError(null);
    stopStream();
    setIsStreaming(true);
  }, [stopStream]);

  // ── Effect: start/stop stream ───────────────────────────────────────
  useEffect(() => {
    if (isStreaming) {
      startStream(streamUrl);
    } else {
      stopStream();
    }
  }, [isStreaming, streamUrl, startStream, stopStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (lastImageUrlRef.current) {
        URL.revokeObjectURL(lastImageUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isConnected,
    isStreaming,
    imageCount,
    fps,
    error,
    streamUrl,
    prediction,
    currentImageUrl,
    toggleStream,
    refreshStream,
    updateStreamUrl,
  };
}
