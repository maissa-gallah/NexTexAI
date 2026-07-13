import { useState, useEffect, useCallback, useRef } from 'react';
import { STATUS_API_URL } from '../utils/constants';

export function useSystemStatus() {
  const [status, setStatus] = useState(null);
  const statusIntervalRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(STATUS_API_URL);
      if (response.ok) {
        setStatus(await response.json());
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    statusIntervalRef.current = setInterval(fetchStatus, 500);
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [fetchStatus]);

  return status;
}
