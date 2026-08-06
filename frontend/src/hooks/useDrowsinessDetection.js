import { useState, useEffect, useRef, useCallback } from 'react';
import '@mediapipe/face_mesh';

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

// Tuned to suppress false positives from brief blinks, head turns, and jitter.
const EAR_FLOOR_THRESHOLD = 0.18;
const EAR_BASELINE_DROP_RATIO = 0.28;
const EAR_SMOOTHING_ALPHA = 0.35;
const DROWSY_CONSECUTIVE_FRAMES = 20;
const RECOVERY_CONSECUTIVE_FRAMES = 8;
const MIN_FACE_PRESENCE_FRAMES = 20;
const MISSING_FACE_RESET_FRAMES = 10;
const BASELINE_UPDATE_MIN_EAR = 0.23;

function euclideanDistance(point1, point2) {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}

function calculateEAR(eyeLandmarks) {
  const v1 = euclideanDistance(eyeLandmarks[1], eyeLandmarks[5]);
  const v2 = euclideanDistance(eyeLandmarks[2], eyeLandmarks[4]);
  const h = euclideanDistance(eyeLandmarks[0], eyeLandmarks[3]);
  if (!Number.isFinite(h) || h <= 0) return Number.NaN;
  return (v1 + v2) / (2.0 * h);
}

function isValidEar(value) {
  return Number.isFinite(value) && value > 0.08 && value < 0.5;
}

export function useDrowsinessDetection(videoRef, isActive) {
  const [isDrowsy, setIsDrowsy] = useState(false);
  const faceMeshRef = useRef(null);
  const detectionTimerRef = useRef(null);
  const processingFrameRef = useRef(false);

  const drowsyFramesCount = useRef(0);
  const recoveryFramesCount = useRef(0);
  const facePresenceFrames = useRef(0);
  const missingFaceFrames = useRef(0);
  const smoothedEar = useRef(null);
  const baselineEar = useRef(null);
  // Fix #7: Use a ref to track drowsy state inside callbacks to avoid stale closures
  const isDrowsyRef = useRef(false);

  const resetState = useCallback(() => {
    drowsyFramesCount.current = 0;
    recoveryFramesCount.current = 0;
    facePresenceFrames.current = 0;
    missingFaceFrames.current = 0;
    smoothedEar.current = null;
    baselineEar.current = null;
    isDrowsyRef.current = false;
    setIsDrowsy(false);
  }, []);

  const updateDrowsy = (value) => {
    isDrowsyRef.current = value;
    setIsDrowsy(value);
  };

  useEffect(() => {
    if (!videoRef.current || !isActive) {
      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }

      try {
        if (faceMeshRef.current) {
          faceMeshRef.current.close();
          faceMeshRef.current = null;
        }
      } catch (e) { console.error("FaceMesh close error:", e); }
      resetState();
      return;
    }

    // Fix #22: Guard against missing MediaPipe globals
    const FaceMesh = window.FaceMesh;
    if (!FaceMesh) {
      console.warn('MediaPipe FaceMesh not loaded — drowsiness detection disabled');
      return;
    }

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        facePresenceFrames.current += 1;
        missingFaceFrames.current = 0;

        const leftEyeLandmarks = LEFT_EYE.map(index => landmarks[index]);
        const rightEyeLandmarks = RIGHT_EYE.map(index => landmarks[index]);

        const leftEAR = calculateEAR(leftEyeLandmarks);
        const rightEAR = calculateEAR(rightEyeLandmarks);
        const avgEAR = (leftEAR + rightEAR) / 2.0;

        if (!isValidEar(avgEAR)) {
          return;
        }

        if (smoothedEar.current == null) {
          smoothedEar.current = avgEAR;
        } else {
          smoothedEar.current = (EAR_SMOOTHING_ALPHA * avgEAR) + ((1 - EAR_SMOOTHING_ALPHA) * smoothedEar.current);
        }

        // Fix #7: Use isDrowsyRef instead of stale isDrowsy closure
        if (smoothedEar.current > BASELINE_UPDATE_MIN_EAR && !isDrowsyRef.current) {
          baselineEar.current = baselineEar.current == null
            ? smoothedEar.current
            : ((0.98 * baselineEar.current) + (0.02 * smoothedEar.current));
        }

        if (facePresenceFrames.current < MIN_FACE_PRESENCE_FRAMES) {
          updateDrowsy(false);
          return;
        }

        const adaptiveThreshold = baselineEar.current == null
          ? EAR_FLOOR_THRESHOLD
          : Math.max(EAR_FLOOR_THRESHOLD, baselineEar.current * (1 - EAR_BASELINE_DROP_RATIO));

        if (smoothedEar.current < adaptiveThreshold) {
          drowsyFramesCount.current += 1;
          recoveryFramesCount.current = 0;
          if (drowsyFramesCount.current >= DROWSY_CONSECUTIVE_FRAMES) {
            updateDrowsy(true);
          }
        } else {
          drowsyFramesCount.current = Math.max(0, drowsyFramesCount.current - 1);
          recoveryFramesCount.current += 1;
          if (recoveryFramesCount.current >= RECOVERY_CONSECUTIVE_FRAMES) {
            updateDrowsy(false);
          }
        }
      } else {
          missingFaceFrames.current += 1;
          if (missingFaceFrames.current >= MISSING_FACE_RESET_FRAMES) {
            drowsyFramesCount.current = 0;
            recoveryFramesCount.current = 0;
            facePresenceFrames.current = 0;
            smoothedEar.current = null;
            baselineEar.current = null;
            updateDrowsy(false);
          }
      }
    });

    faceMeshRef.current = faceMesh;

    detectionTimerRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (processingFrameRef.current) return;

      processingFrameRef.current = true;
      try {
        await faceMesh.send({ image: videoRef.current });
      } catch (err) {
        console.error('Drowsiness frame processing error:', err);
      } finally {
        processingFrameRef.current = false;
      }
    }, 120);

    return () => {
      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }

      try {
        if (faceMeshRef.current) {
            faceMeshRef.current.close();
            faceMeshRef.current = null;
        }
      } catch (err) { console.error("Cleanup faceMesh error:", err); }
      resetState();
    };
  // Fix #8 & #19: videoRef is stable (useRef), removed from deps. isDrowsy tracked via ref.
  }, [isActive, resetState]);

  return isDrowsy;
}
