import { useState, useRef, useCallback, useEffect } from 'react';

const WEBCAM_DEBUG = false;

export function useWebcam(options = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
      return true;
    } catch (err) {
      const name = String(err?.name || '').toLowerCase();
      if (name.includes('notfound')) {
        setError('Failed to acquire camera feed: NotFoundError: Requested device not found');
      } else if (name.includes('notallowed') || name.includes('security')) {
        setError('Camera access denied. Please allow camera permissions.');
      } else {
        setError('Failed to acquire camera feed. Please check your device settings.');
      }
      setIsActive(false);
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (options.cropSquare) {
      // Capture a centered square from the video and resize to save space
      const OUT_SIZE = options.outSize || 160;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const minSide = Math.min(vw, vh) || 480;
      const sx = Math.max(0, Math.floor((vw - minSide) / 2));
      const sy = Math.max(0, Math.floor((vh - minSide) / 2));
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      // drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(video, sx, sy, minSide, minSide, 0, 0, OUT_SIZE, OUT_SIZE);
    } else {
      // Standard full-frame capture
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (WEBCAM_DEBUG) {
      // Debug trace: what the webcam frame capture pipeline is producing.
      console.debug('[Webcam] Captured frame', {
        timestamp: new Date().toISOString(),
        width: canvas.width,
        height: canvas.height,
        dataUrlPrefix: dataUrl.slice(0, 40),
        approxBytes: Math.round((dataUrl.length * 3) / 4),
      });
    }

    return dataUrl;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return { videoRef, canvasRef, isActive, error, startCamera, stopCamera, captureFrame, clearError };
}
