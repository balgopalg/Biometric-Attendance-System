import { useState, useRef, useCallback, useEffect } from 'react';

const WEBCAM_DEBUG = import.meta.env.VITE_WEBCAM_DEBUG === 'true';

export function useWebcam(options = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const startingRef = useRef(false);
  const lastStopAtRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState(options.facingMode || 'user');

  useEffect(() => {
    if (options.facingMode) {
      setFacingMode(options.facingMode);
    }
  }, [options.facingMode]);

  const startCamera = useCallback(async (facing) => {
    if (startingRef.current) return false;
    startingRef.current = true;

    // Cooling period: hardware needs time to release
    const timeSinceStop = Date.now() - lastStopAtRef.current;
    if (timeSinceStop < 800) {
      await new Promise(r => setTimeout(r, 800 - timeSinceStop));
    }

    setError(null);
    try {
      // Guard: mediaDevices API unavailable in non-HTTPS or restricted contexts
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not available. Ensure you are using HTTPS or localhost.');
        startingRef.current = false;
        return false;
      }
      // Add a larger delay to allow hardware to release if switching
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        await new Promise(r => setTimeout(r, 500));
      }

      let stream;
      const mode = facing || facingMode || 'user';

      try {
        // Tier 1: Try exact match
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: mode === 'environment' ? { ideal: 0.75 } : { ideal: 1.333 }
          }
        });
      } catch (e1) {
        try {
          // Tier 2: Try explicit device search if looking for environment
          if (mode === 'environment') {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const backCam = devices.find(d =>
              d.kind === 'videoinput' &&
              (d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment'))
            );
            if (backCam) {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { exact: backCam.deviceId },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  aspectRatio: { ideal: 0.75 }
                }
              });
            } else {
              throw new Error('No back camera found in labels');
            }
          } else {
            throw new Error('Skip to ideal');
          }
        } catch (e2) {
          try {
            // Tier 3: Ideal fallback
            await new Promise(r => setTimeout(r, 400));
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: mode },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: mode === 'environment' ? { ideal: 0.75 } : { ideal: 1.333 }
              }
            });
          } catch (e3) {
            // Tier 4: Absolute fallback
            await new Promise(r => setTimeout(r, 400));
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFacingMode(mode);
      setIsActive(true);
      return true;
    } catch (err) {
      const name = String(err?.name || '').toLowerCase();
      if (name.includes('notfound') || name.includes('devicesnotfound')) {
        setError('Camera not found. Please ensure your webcam is connected.');
      } else if (name.includes('notallowed') || name.includes('security')) {
        setError('Camera access denied. Please allow camera permissions in your browser.');
      } else if (name.includes('notreadable') || name.includes('track')) {
        setError('Camera is already in use by another application or tab.');
      } else {
        setError('Failed to acquire camera feed. Please check your device settings.');
      }
      setIsActive(false);
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [facingMode]);

  const clearError = useCallback(() => setError(null), []);

  const stopCamera = useCallback(() => {
    startingRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastStopAtRef.current = Date.now();
    setIsActive(false);
  }, []);

  const flipCamera = useCallback(async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    return startCamera(nextMode);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (options.cropSquare) {
      const OUT_SIZE = options.outSize || 160;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const minSide = Math.min(vw, vh) || 480;
      const sx = Math.max(0, Math.floor((vw - minSide) / 2));
      const sy = Math.max(0, Math.floor((vh - minSide) / 2));
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      ctx.drawImage(video, sx, sy, minSide, minSide, 0, 0, OUT_SIZE, OUT_SIZE);
    } else {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (WEBCAM_DEBUG) {
      console.debug('[Webcam] Captured frame', {
        timestamp: new Date().toISOString(),
        width: canvas.width,
        height: canvas.height,
        dataUrlPrefix: dataUrl.slice(0, 40),
        approxBytes: Math.round((dataUrl.length * 3) / 4),
      });
    }

    return dataUrl;
  }, [options.cropSquare, options.outSize]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return { videoRef, canvasRef, isActive, error, facingMode, startCamera, stopCamera, flipCamera, captureFrame, clearError };
}