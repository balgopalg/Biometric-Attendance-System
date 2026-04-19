import { useState, useEffect, useRef } from 'react';
import '@mediapipe/face_mesh';
import '@mediapipe/camera_utils';

const FaceMesh = window.FaceMesh;
const Camera = window.Camera;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

function euclideanDistance(point1, point2) {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}

function calculateEAR(eyeLandmarks) {
  const v1 = euclideanDistance(eyeLandmarks[1], eyeLandmarks[5]);
  const v2 = euclideanDistance(eyeLandmarks[2], eyeLandmarks[4]);
  const h = euclideanDistance(eyeLandmarks[0], eyeLandmarks[3]);
  return (v1 + v2) / (2.0 * h);
}

export function useDrowsinessDetection(videoRef, isActive) {
  const [isDrowsy, setIsDrowsy] = useState(false);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  
  const drowsyFramesCount = useRef(0);
  const DROWSY_THRESHOLD = 0.25;
  const DROWSY_CONSECUTIVE_FRAMES = 12; // About 1-2 seconds of frame processing

  useEffect(() => {
    if (!videoRef.current || !isActive) {
      try {
        if (cameraRef.current) {
          cameraRef.current.stop();
          cameraRef.current = null;
        }
      } catch (e) { console.error("Camera stop error:", e); }
      
      try {
        if (faceMeshRef.current) {
          faceMeshRef.current.close();
          faceMeshRef.current = null;
        }
      } catch (e) { console.error("FaceMesh close error:", e); }
      setIsDrowsy(false);
      return;
    }

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Extract pixel coordinates approximations using normalized landmarks
        // Since we only need ratio, normalized coords work fine given standard aspect ratios.
        // Or we could map by video dimensions, but relative distance ratio EAR is scale-invariant.
        
        const leftEyeLandmarks = LEFT_EYE.map(index => landmarks[index]);
        const rightEyeLandmarks = RIGHT_EYE.map(index => landmarks[index]);

        const leftEAR = calculateEAR(leftEyeLandmarks);
        const rightEAR = calculateEAR(rightEyeLandmarks);
        const avgEAR = (leftEAR + rightEAR) / 2.0;

        if (avgEAR < DROWSY_THRESHOLD) {
          drowsyFramesCount.current += 1;
          if (drowsyFramesCount.current >= DROWSY_CONSECUTIVE_FRAMES) {
             setIsDrowsy(true);
          }
        } else {
          drowsyFramesCount.current = 0;
          setIsDrowsy(false);
        }
      } else {
          drowsyFramesCount.current = 0;
          setIsDrowsy(false);
      }
    });

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && faceMesh) {
            await faceMesh.send({image: videoRef.current});
        }
      },
      width: 640,
      height: 480
    });

    camera.start();
    cameraRef.current = camera;
    faceMeshRef.current = faceMesh;

    return () => {
      try {
        if (cameraRef.current) {
            cameraRef.current.stop();
            cameraRef.current = null;
        }
      } catch (err) { console.error("Cleanup camera error:", err); }

      try {
        if (faceMeshRef.current) {
            faceMeshRef.current.close();
            faceMeshRef.current = null;
        }
      } catch (err) { console.error("Cleanup faceMesh error:", err); }
    };
  }, [isActive]);

  return isDrowsy;
}
