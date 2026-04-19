import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaceMesh } from "@mediapipe/face_mesh";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import useJob from "../hooks/useJob";
import useInterviewQuestions from "../hooks/useInterviewQuestions";
import CompanyLogo from "../components/CompanyLogo";
import api from "../utils/api";

const Interview = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { job, loading: jobLoading, error: jobError } = useJob(jobId);

  const [level, setLevel] = useState(null);

  // AI generates fresh questions every session
  const { questions, sessionToken, loading: questionsLoading, error: questionsError } = useInterviewQuestions(jobId, level);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [answers, setAnswers] = useState({});
  const [allAnswers, setAllAnswers] = useState([]);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isTypingMode, setIsTypingMode] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [interviewId, setInterviewId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [answerText, setAnswerText] = useState("");

  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const lastSpeechTimeRef = useRef(Date.now());
  const [stream, setStream] = useState(null);
  const [timeLeft, setTimeLeft] = useState(120);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let interim = "";
        let final = ""; // Start fresh for this result set

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + " ";
          } else {
            interim += transcript;
          }
        }

        const currentFullText = finalTranscriptRef.current + interim;
        setAnswerText(currentFullText);
        setLiveTranscript(interim);
      };

      recognition.onerror = (e) => {
        console.error("❌ Speech error:", e.error);
        if (e.error === "network") {
          setRecording(false);
          isRecordingRef.current = false;
        }
      };

      recognition.onend = () => {
        // Restart only if we are supposed to be recording
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch (err) {
            console.error("Auto-restart failed:", err);
          }
        }
      };

      recognitionRef.current = recognition;
      console.log("✅ Speech Engine Initialized");
    }
  }, []);

  // ── Proctoring Engine State ──
  const [cocoLoaded, setCocoLoaded] = useState(false);
  const cocoModelRef = useRef(null);
  const cocoIntervalRef = useRef(null);
  const proctoringScore = useRef(0);
  const proctoringWarnings = useRef(0);
  const proctoringEvents = useRef([]);
  const warningCooldowns = useRef({});
  const terminationTriggered = useRef(false);
  const animationFrameRef = useRef(null);

  // ── Startup flow state ──
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Callback ref: auto-attaches stream whenever <video> mounts/remounts
  const videoCallbackRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
        node.play().catch(() => { });
      }
    }
  }, []);
  const faceMeshRef = useRef(null);
  const eyeContactDataRef = useRef({ frames: 0, consistentFrames: 0 });
  const [isLooking, setIsLooking] = useState(true);
  const [notLookingTime, setNotLookingTime] = useState(0);
  const [lookBuffer, setLookBuffer] = useState([]);
  const [calibrated, setCalibrated] = useState(false);
  const [faceDetected, setFaceDetected] = useState(true);
  const [noFaceTime, setNoFaceTime] = useState(0);
  const [facingCamera, setFacingCamera] = useState(true);
  const [notFacingTime, setNotFacingTime] = useState(0);
  const [facingBuffer, setFacingBuffer] = useState([]);
  const [interviewStarted, setInterviewStarted] = useState(false); // true once fullscreen is active & interview begins
  const detectionActiveRef = useRef(true); // controls whether detection loop runs
  const [movementWarning, setMovementWarning] = useState("");
  const movementWarningTimeout = useRef(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const stopCamera = useCallback(() => {
    console.log('[Camera] stopCamera called');
    detectionActiveRef.current = false; // kill detection loop first

    // Stop ALL Proctoring Loops immediately
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (cocoIntervalRef.current) clearInterval(cocoIntervalRef.current);
    if (faceMeshRef.current) {
      try { faceMeshRef.current.close(); } catch (e) { }
      faceMeshRef.current = null;
    }

    // STEP 1: Immediately stop ALL MediaStream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[Camera] Track stopped:', track.kind);
      });
    }

    // STEP 2: Clear video element source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load(); // force release
    }

    // STEP 3: Reset stream reference
    streamRef.current = null;
    setStream(null);
  }, []);

  // ── Proctoring Logic ──
  const handleTermination = useCallback(async (manualReason = null) => {
    if (terminationTriggered.current) return;
    terminationTriggered.current = true;

    const endTime = new Date();
    stopCamera();

    const currentReason = manualReason || (proctoringEvents.current.length > 0 ? proctoringEvents.current[proctoringEvents.current.length - 1].event : "Proctoring violation");

    try {
      // Prepare proctoring data
      const cappedEvents = (proctoringEvents.current || []).slice(-20);
      const slimAnswers = allAnswers.map((a, idx) => ({
        questionIndex: idx,
        userAnswer: (a.userAnswer || "").substring(0, 2000),
      }));

      // Call API to save the terminated session
      const res = await api.post("/interviews/evaluate", {
        sessionToken,
        jobId: jobId || job?.id,
        role: job?.title,
        answers: slimAnswers,
        start_time: startTime,
        end_time: endTime,
        eye_contact_consistency: 0,
        proctoring: {
          score: proctoringScore.current,
          warnings: proctoringWarnings.current,
          terminated: true,
          termination_reason: currentReason,
          events: cappedEvents,
        },
      });

      // Navigate to the terminated page with the new session ID
      navigate("/interview/terminated", {
        state: {
          sessionId: res.data.data._id,
          reason: currentReason
        }
      });
    } catch (err) {
      console.error("Failed to save terminated session", err);
      // Fallback navigate if API fails
      navigate("/interview/terminated", { state: { reason: currentReason } });
    }
  }, [stopCamera, navigate, allAnswers, sessionToken, jobId, job, startTime]);

  const triggerProctoringEvent = useCallback((eventName, severity, scorePenalty, warningOnly = false) => {
    if (terminationTriggered.current) return;
    const now = Date.now();
    // 10 second cooldown per event type
    if (warningCooldowns.current[eventName] && now - warningCooldowns.current[eventName] < 10000) {
      return;
    }
    warningCooldowns.current[eventName] = now;

    if (!warningOnly) {
      proctoringScore.current += scorePenalty;
      proctoringWarnings.current += 1;
    }

    const timestamp = new Date().toISOString().substr(11, 8);
    const event = {
      event: eventName,
      timestamp,
      severity
    };
    proctoringEvents.current.push(event);

    console.warn(`[Proctoring] ${eventName} | Score: ${proctoringScore.current} | Warnings: ${proctoringWarnings.current} | Warning Only: ${warningOnly}`);

    // ── Precise Termination Logic ──
    const deviceCount = proctoringEvents.current.filter(e => e.event === "External device detected").length;

    if (eventName === "External device detected" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('externalDeviceWarning', { detail: { count: deviceCount } }));
    }

    const shouldTerminate = !warningOnly && (
      proctoringScore.current >= 12 ||
      proctoringWarnings.current >= 10 ||
      deviceCount >= 3
    );

    if (shouldTerminate) {
      handleTermination("Session Terminated due to Proctoring Violations");
    }
  }, [handleTermination]);

  // ── Preload COCO-SSD ──
  useEffect(() => {
    let isMounted = true;
    const loadModel = async () => {
      try {
        await tf.ready();
        const model = await cocoSsd.load();
        if (isMounted) {
          cocoModelRef.current = model;
          setCocoLoaded(true);
          console.log("[Proctoring] COCO-SSD Engine Loaded");
        }
      } catch (err) {
        console.error("Failed to load COCO-SSD model", err);
        // Fallback to allow progress if WASM fails
        if (isMounted) setCocoLoaded(true);
      }
    };
    loadModel();
    return () => { isMounted = false; };
  }, []);

  // ── Fullscreen enforcement state ──
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [interviewEndedByFullscreen, setInterviewEndedByFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const fullscreenExitCountRef = useRef(0);
  const interviewActiveRef = useRef(false); // only true once interview has started

  // ── Tab switching detection state ──
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [interviewEndedByTabSwitch, setInterviewEndedByTabSwitch] = useState(false);
  const tabSwitchCountRef = useRef(0);

  useEffect(() => {
    if (job) {
      localStorage.setItem("selectedJob", JSON.stringify(job));
    }
  }, [job]);

  // ── Global cleanup: beforeunload + unmount ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopCamera();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopCamera(); // always clean up on unmount
    };
  }, [stopCamera]);

  // Keep interviewActiveRef in sync
  useEffect(() => {
    interviewActiveRef.current = interviewStarted && !interviewComplete && !interviewEndedByFullscreen && !interviewEndedByTabSwitch;
  }, [interviewStarted, interviewComplete, interviewEndedByFullscreen, interviewEndedByTabSwitch]);

  const [deviceWarningCount, setDeviceWarningCount] = useState(0);
  const [showDeviceWarning, setShowDeviceWarning] = useState(false);
  const [showMultipleVoicesWarning, setShowMultipleVoicesWarning] = useState(false);
  const [showMultipleFacesWarning, setShowMultipleFacesWarning] = useState(false);

  useEffect(() => {
    const handleDeviceWarning = (e) => {
      setDeviceWarningCount(e.detail.count);
      setShowDeviceWarning(true);
      setTimeout(() => setShowDeviceWarning(false), 5000);
    };
    const handleVoicesWarning = () => {
      setShowMultipleVoicesWarning(true);
      setTimeout(() => setShowMultipleVoicesWarning(false), 5000);
    };
    const handleMultipleFaces = () => {
      setShowMultipleFacesWarning(true);
      setTimeout(() => setShowMultipleFacesWarning(false), 5000);
    };
    window.addEventListener('externalDeviceWarning', handleDeviceWarning);
    window.addEventListener('multipleVoicesWarning', handleVoicesWarning);
    window.addEventListener('multipleFacesWarning', handleMultipleFaces);
    return () => {
      window.removeEventListener('externalDeviceWarning', handleDeviceWarning);
      window.removeEventListener('multipleVoicesWarning', handleVoicesWarning);
      window.removeEventListener('multipleFacesWarning', handleMultipleFaces);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      // PREVENT MULTIPLE STREAMS: Always stop previous stream before starting a new one
      stopCamera();

      try {
        // 1. Check camera + microphone permission state explicitly
        const camPerm = navigator.permissions ? await navigator.permissions.query({ name: 'camera' }).catch(() => null) : null;
        const micPerm = navigator.permissions ? await navigator.permissions.query({ name: 'microphone' }).catch(() => null) : null;

        let state = 'prompt'; // default fallback
        if (camPerm && micPerm) {
          if (camPerm.state === 'denied' || micPerm.state === 'denied') {
            state = 'denied';
          } else if (camPerm.state === 'granted' && micPerm.state === 'granted') {
            state = 'granted';
          } else {
            state = 'prompt';
          }
        }

        // 2. Handle all cases explicitly
        if (state === 'denied') {
          if (!cancelled) {
            setCameraPermissionGranted(false);
            setCameraPermissionError("Camera & microphone access is required before starting.");
          }
          return;
        }

        // IF state = 'granted' -> starts directly / IF state = 'prompt' -> triggers getUserMedia UI prompt
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

        // Critical Fix: If the component unmounted while waiting for permissions (React StrictMode), kill the stream immediately to prevent hardware light staying on.
        if (cancelled) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        console.log("Camera started:", streamRef.current);

        // Attach to video element if already mounted
        if (videoRef.current && videoRef.current.srcObject !== mediaStream) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => { });
        }

        if (!cancelled) {
          setCameraPermissionGranted(true);
          setCameraPermissionError("");
        }
      } catch (err) {
        console.error("Camera/Mic permission error:", err);
        if (!cancelled) {
          setCameraPermissionGranted(false);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setCameraPermissionError("Camera & microphone access is required before starting.");
          } else if (err.name === 'NotFoundError') {
            setCameraPermissionError("No camera/microphone device detected.");
          } else {
            setCameraPermissionError("Error accessing media: " + err.message);
          }
        }
      }
    }

    startCamera();

    // Calibration: ignore first 2 seconds
    const calibrationTimer = setTimeout(() => setCalibrated(true), 2000);

    return () => {
      cancelled = true;
      clearTimeout(calibrationTimer);
      stopCamera();
    };
  }, [jobId, stopCamera]); // reinit on each interview session

  // Retry permission handler
  const handleRetryPermissions = useCallback(async () => {
    // PREVENT MULTIPLE STREAMS: Always stop previous stream before starting a new one
    stopCamera();

    try {
      const camPerm = navigator.permissions ? await navigator.permissions.query({ name: 'camera' }).catch(() => null) : null;
      const micPerm = navigator.permissions ? await navigator.permissions.query({ name: 'microphone' }).catch(() => null) : null;

      if (camPerm && micPerm && (camPerm.state === 'denied' || micPerm.state === 'denied')) {
        setCameraPermissionGranted(false);
        setCameraPermissionError("Camera & microphone access was previously denied. Please enable them in your browser settings and try again.");
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => { });
      }

      setCameraPermissionGranted(true);
      setCameraPermissionError("");
    } catch (err) {
      console.error("Camera/Mic permission error:", err);
      setCameraPermissionGranted(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermissionError("Camera & microphone access is required before starting.");
      } else if (err.name === 'NotFoundError') {
        setCameraPermissionError("No camera/microphone device detected.");
      } else {
        setCameraPermissionError("Error accessing media: " + err.message);
      }
    }
  }, [stopCamera]);

  // ── FaceMesh Tracking — persistent detection loop ──
  // Use a ref to track calibration so the onResults callback never has a stale closure
  const calibratedRef = useRef(false);
  useEffect(() => { calibratedRef.current = calibrated; }, [calibrated]);

  useEffect(() => {
    if (!cameraPermissionGranted) return;

    detectionActiveRef.current = true;
    console.log('[Detection] Initializing FaceMesh');

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults((results) => {
      if (!detectionActiveRef.current) return;
      eyeContactDataRef.current.frames += 1;
      if (!calibratedRef.current) return;

      // ── Face presence detection ──
      const hasFace = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0 && results.multiFaceLandmarks[0];
      setFaceDetected(!!hasFace);

      if (!hasFace) {
        setFacingCamera(true); // reset when no face
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];

      // ── Layer 3: Face orientation detection (Yaw and Pitch) ──
      const noseTip = landmarks[1];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];
      const forehead = landmarks[10];
      const chin = landmarks[152];

      const faceWidth = Math.abs(rightCheek.x - leftCheek.x) || 0.001;
      const faceHeight = Math.abs(chin.y - forehead.y) || 0.001;

      const noseToLeft = Math.abs(noseTip.x - leftCheek.x);
      const noseToForehead = Math.abs(noseTip.y - forehead.y);

      const yawRatio = noseToLeft / faceWidth;
      const pitchRatio = noseToForehead / faceHeight;

      // Extremely relaxed bounds for yaw and pitch - user can look almost anywhere on screen
      const isFacingNow = yawRatio > 0.05 && yawRatio < 0.95 && pitchRatio > 0.05 && pitchRatio < 0.95;

      const setPersistentWarning = (msg) => {
        setMovementWarning(msg);
        if (movementWarningTimeout.current) clearTimeout(movementWarningTimeout.current);
        movementWarningTimeout.current = setTimeout(() => setMovementWarning(""), 3000);
      };

      // Detailed head movements - only if EXTREME (looking 90deg away)
      if (yawRatio > 0.95) { triggerProctoringEvent("Looking Left", "MEDIUM", 1); setPersistentWarning("Looking Left"); }
      if (yawRatio < 0.05) { triggerProctoringEvent("Looking Right", "MEDIUM", 1); setPersistentWarning("Looking Right"); }
      if (pitchRatio < 0.05) { triggerProctoringEvent("Looking Up", "MEDIUM", 1); setPersistentWarning("Looking Up"); }
      if (pitchRatio > 0.95) { triggerProctoringEvent("Looking Down", "MEDIUM", 1); setPersistentWarning("Looking Down"); }

      // Smooth over 10 frames — majority > 6 means facing
      setFacingBuffer(prev => {
        const updated = [...prev, isFacingNow].slice(-10);
        const trueCount = updated.filter(v => v).length;
        setFacingCamera(trueCount > 6);
        return updated;
      });

      // ── Layer 2: Eye contact detection ──
      // The user should be able to view any part of the screen
      // Therefore, if their face is generally oriented towards the screen (isFacingNow),
      // we consider them to be looking at the screen.
      const isLookingNow = isFacingNow;

      // Strong smoothing — last 15 frames, majority > 10
      setLookBuffer(prev => {
        const updated = [...prev, isLookingNow].slice(-15);
        const trueCount = updated.filter(v => v).length;
        setIsLooking(trueCount > 10);
        return updated;
      });

      if (isLookingNow) {
        eyeContactDataRef.current.consistentFrames += 1;
      }
    });
    faceMeshRef.current = faceMesh;

    // ── Persistent rAF loop — decoupled from React render cycle ──
    let animFrameId;
    let processing = false; // prevent overlapping sends
    const processFrame = async () => {
      if (!detectionActiveRef.current) return; // loop dies when detection disabled
      if (!processing && videoRef.current && faceMeshRef.current && videoRef.current.readyState >= 2) {
        processing = true;
        try { await faceMeshRef.current.send({ image: videoRef.current }); } catch (e) { }
        processing = false;
      }
      animFrameId = requestAnimationFrame(processFrame);
      animationFrameRef.current = animFrameId;
    };
    processFrame();

    return () => {
      console.log('[Detection] Cleaning up FaceMesh');
      detectionActiveRef.current = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      try { faceMesh.close(); } catch (e) { }
      faceMeshRef.current = null;
    };
  }, [cameraPermissionGranted]);

  // ── Delay Timer — eye contact (Anti-Spam) ──
  useEffect(() => {
    let interval;
    if (!isLooking && interviewStarted) {
      interval = setInterval(() => {
        setNotLookingTime((prev) => {
          const next = prev + 1;
          if (next === 3) triggerProctoringEvent("Looking away", "MEDIUM", 1);
          return next;
        });
      }, 1000);
    } else {
      setNotLookingTime(0);
    }
    return () => clearInterval(interval);
  }, [isLooking, interviewStarted, triggerProctoringEvent]);

  // ── Delay Timer — face presence ──
  useEffect(() => {
    let interval;
    if (!faceDetected && interviewStarted) {
      interval = setInterval(() => {
        setNoFaceTime((prev) => {
          const next = prev + 1;
          if (next === 3) triggerProctoringEvent("Face not visible", "HIGH", 2);
          return next;
        });
      }, 1000);
    } else {
      setNoFaceTime(0);
    }
    return () => clearInterval(interval);
  }, [faceDetected, interviewStarted, triggerProctoringEvent]);

  // ── Delay Timer — face orientation ──
  useEffect(() => {
    let interval;
    if (!facingCamera && interviewStarted) {
      interval = setInterval(() => {
        setNotFacingTime((prev) => {
          const next = prev + 1;
          if (next === 3) triggerProctoringEvent("Face sideways", "MEDIUM", 1);
          return next;
        });
      }, 1000);
    } else {
      setNotFacingTime(0);
    }
    return () => clearInterval(interval);
  }, [facingCamera, interviewStarted, triggerProctoringEvent]);

  // ── Proctoring Engines — Start COCO-SSD & Audio Only When Interview Becomes Active ──
  useEffect(() => {
    if (!interviewStarted || interviewComplete || terminationTriggered.current) return;

    console.log('[Detection] Starting Secondary Proctoring Engines...');

    // 3. COCO-SSD Object Loop (2s)
    let detectionRunning = false;
    const VIOLATION_CLASSES = ['cell phone', 'laptop', 'remote', 'book', 'keyboard', 'tablet'];
    cocoIntervalRef.current = setInterval(async () => {
      if (detectionRunning || !cocoModelRef.current || !videoRef.current || videoRef.current.readyState < 2) return;

      detectionRunning = true;
      try {
        const predictions = await cocoModelRef.current.detect(videoRef.current, 10, 0.4);
        let objectViolations = [];
        let personCount = 0;

        predictions.forEach(pred => {
          if (VIOLATION_CLASSES.includes(pred.class)) {
            objectViolations.push(pred.class);
          }
          if (pred.class === 'person') {
            personCount++;
          }
        });

        if (objectViolations.length > 0) {
          triggerProctoringEvent("External device detected", "HIGH", 5);
        }
        if (personCount > 1) {
          triggerProctoringEvent("Multiple faces detected", "HIGH", 5);
          // Dispatch visible warning event to UI
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('multipleFacesWarning', { detail: { count: personCount } }));
          }
        }
      } catch (e) {
        console.error("[Proctoring] COCO-SSD detection error", e);
      }
      detectionRunning = false;
    }, 2000);

    return () => {
      if (cocoIntervalRef.current) clearInterval(cocoIntervalRef.current);
    };
  }, [interviewStarted, interviewComplete, triggerProctoringEvent]);

  // ── Handle Fullscreen Reattach ──
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => { });
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // ── Fullscreen utility ──
  const requestFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.error("Could not enter fullscreen:", err);
    }
  }, []);

  // ── Derived: are questions ready? ──
  const questionsReady = !questionsLoading && !questionsError && questions && questions.length > 0;

  const [isMicActive, setIsMicActive] = useState(true);
  useEffect(() => {
    const handleMicUpdate = (e) => setIsMicActive(e.detail.active);
    window.addEventListener('micStateUpdate', handleMicUpdate);
    return () => window.removeEventListener('micStateUpdate', handleMicUpdate);
  }, []);

  // ── Handler: User clicks "Start Interview" → enter fullscreen → begin ──
  const handleStartInterview = useCallback(async () => {
    if (!isMicActive) {
      alert("Please ensure your microphone is working and not silent before starting.");
      return;
    }
    try {
      const res = await api.post('/interviews/start', { sessionToken, jobId: job?.id || jobId, role: job?.title });
      if (res.data.success) {
        setInterviewId(res.data.data._id);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start session. Please check backend connection.");
      return;
    }
    await requestFullscreen();
    setInterviewStarted(true);
    setStartTime(new Date());
  }, [requestFullscreen, isMicActive, sessionToken, job, jobId]);

  // ── Fullscreen change listener — only active after interview starts ──
  useEffect(() => {
    if (!interviewStarted) return;

    const handleFullscreenChange = () => {
      // User left fullscreen
      if (!document.fullscreenElement && interviewActiveRef.current) {
        const newCount = fullscreenExitCountRef.current + 1;
        fullscreenExitCountRef.current = newCount;
        setFullscreenExitCount(newCount);

        if (newCount >= 2) {
          // Second exit → auto-end
          setInterviewEndedByFullscreen(true);
          setShowFullscreenWarning(false);
          setIsPaused(false);
          handleTermination("Fullscreen exited multiple times");
        } else {
          // First exit → show warning & pause
          setShowFullscreenWarning(true);
          setIsPaused(true);
        }
      }

      // User returned to fullscreen — dismiss warning, resume
      if (document.fullscreenElement) {
        setShowFullscreenWarning(false);
        setIsPaused(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [interviewStarted, handleTermination]);

  // ── Tab visibility change listener — only active after interview starts ──
  useEffect(() => {
    if (!interviewStarted) return;

    const handleVisibilityChange = () => {
      if (!interviewActiveRef.current) return;

      if (document.visibilityState === "hidden") {
        // User switched away — increment counter & pause immediately
        const newCount = tabSwitchCountRef.current + 1;
        tabSwitchCountRef.current = newCount;
        setTabSwitchCount(newCount);
        setIsPaused(true);
      }

      if (document.visibilityState === "visible") {
        // User returned to the tab
        if (tabSwitchCountRef.current >= 2) {
          // Second (or more) tab switch → auto-end interview
          setInterviewEndedByTabSwitch(true);
          setShowTabSwitchWarning(false);
          setIsPaused(false);
          handleTermination("Tab switching detected multiple times");
        } else if (tabSwitchCountRef.current >= 1) {
          // First tab switch — show warning modal, stay paused until acknowledged
          setShowTabSwitchWarning(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [interviewStarted, handleTermination]);

  // ── Handler: Acknowledge tab switch warning ──
  const handleContinueInterview = useCallback(() => {
    setShowTabSwitchWarning(false);
    setIsPaused(false);
  }, []);

  // ── Clean up fullscreen on unmount ──
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(e => console.error(e));
      }
    };
  }, []);

  // ── Handler: Return to Fullscreen ──
  const handleReturnToFullscreen = useCallback(async () => {
    await requestFullscreen();
    // fullscreenchange listener will automatically dismiss the modal & resume
  }, [requestFullscreen]);

  // ── Handler: Handle Manual Exit ──
  const handleManualExit = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const confirmManualExit = useCallback(() => {
    stopCamera();
    navigate(`/job/${jobId}`);
  }, [stopCamera, navigate, jobId]);

  // ── Handler: End Interview from warning modal ──
  const handleEndInterviewFromWarning = useCallback(() => {
    setInterviewEndedByFullscreen(true);
    setShowFullscreenWarning(false);
    setIsPaused(false);
    handleTermination("Ended from fullscreen warning modal");
  }, [handleTermination]);

  useEffect(() => {
    if (recording && timeLeft > 0 && !isPaused) {
      const timer = setInterval(() => setTimeLeft((value) => value - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [recording, timeLeft, isPaused]);

  useEffect(() => {
    if ((interviewComplete || interviewEndedByFullscreen || interviewEndedByTabSwitch) && document.fullscreenElement) {
      document.exitFullscreen().catch(e => console.error(e));
    }
    // Stop camera when interview ends by any means
    if (interviewEndedByFullscreen || interviewEndedByTabSwitch) {
      stopCamera();
    }
  }, [interviewComplete, interviewEndedByFullscreen, interviewEndedByTabSwitch, stopCamera]);

  const seconds = timeLeft % 60;
  const minutes = Math.floor(timeLeft / 60);

  // ─────────────────────────────────────────────────────
  // EARLY RETURN SCREENS
  // ─────────────────────────────────────────────────────

  if (jobLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
          <p className="text-gray-500 font-medium">Fetching job details...</p>
        </div>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-red-600 mb-4 font-bold">Interview selection error.</p>
          <button onClick={() => { stopCamera(); navigate("/dashboard"); }} className="px-6 py-2 rounded-full bg-violet-600 text-white font-medium">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Level Selection Screen ──
  if (!level) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-sans p-6">
        <div className="w-full max-w-4xl bg-white rounded-[32px] shadow-sm border border-gray-100 p-10 md:p-14 text-center animate-[scaleIn_0.3s_ease-out]">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 shadow-inner">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight font-[Georgia]">Select Interview Difficulty</h1>
          <p className="text-gray-500 mb-12 text-sm max-w-lg mx-auto leading-relaxed">Choose the difficulty level for your mock interview. The AI will tailor the technical depth, scenario complexity, and expectations strictly to your selected tier.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              { id: 'Beginner', label: 'Beginner', desc: 'Focuses on core concepts, foundational principles, and basic scenario handling.' },
              { id: 'Intermediate', label: 'Intermediate', desc: 'Standard difficulty with practical problem-solving and architectural tradeoffs.' },
              { id: 'Expert', label: 'Expert', desc: 'Complex systems, extreme edge cases, leadership, and deep architectural issues.' }
            ].map(tier => (
              <button
                key={tier.id}
                onClick={() => setLevel(tier.id)}
                className="group relative flex flex-col p-8 rounded-[24px] border border-gray-200 hover:border-[#8338ec] hover:shadow-xl hover:shadow-violet-100/50 transition-all duration-300 text-left bg-white overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-50/0 to-violet-50/0 group-hover:from-violet-50/50 group-hover:to-transparent transition-all duration-300"></div>
                <span className="font-black text-xl text-slate-800 mb-3 group-hover:text-[#8338ec] relative z-10 transition-colors">{tier.label}</span>
                <span className="text-sm text-gray-500 leading-relaxed relative z-10 group-hover:text-gray-600 transition-colors">{tier.desc}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { stopCamera(); navigate(`/job/${job?.id || jobId}`); }}
            className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
          >
            Cancel & Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── AI generating / permission check screen (NOT fullscreen) ──
  if (questionsLoading || (!cameraPermissionGranted && !cameraPermissionError) || !cocoLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white font-sans gap-6">
        <div className="w-16 h-16 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin shadow-lg" />
        <div className="text-center space-y-2">
          <p className="text-gray-900 text-xl font-black tracking-tight uppercase">AI is preparing your session</p>
          <div className="flex items-center justify-center gap-2">
            <span className="px-2 py-1 bg-violet-50 text-violet-600 text-[10px] font-black rounded uppercase tracking-widest border border-violet-100">
              {questionsLoading ? "Analyzing Job Role" : "Loading Proctoring Engine"}
            </span>
          </div>

          {/* Camera/Mic permission status indicator */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-col">
            {cameraPermissionGranted ? (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                Camera & Mic Ready
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full uppercase tracking-widest border border-amber-100 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Requesting Permissions
              </span>
            )}

            {!cocoLoaded && (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full uppercase tracking-widest border border-blue-100 flex items-center gap-1.5 mt-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                Downloading Neural Models (may take a moment)
              </span>
            )}
          </div>

          <p className="text-gray-400 text-xs mt-4 max-w-sm mx-auto font-medium">This safely loads the AI models into your browser to ensure proctoring without sending video over the network.</p>
        </div>
      </div>
    );
  }

  // ── Permission denied screen (NOT fullscreen) ──
  if (cameraPermissionError && !cameraPermissionGranted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-sans">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v2a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h8a2 2 0 012 2v2z" />
            </svg>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-2">Camera Access Required</p>
          <p className="text-gray-500 text-sm mb-8">{cameraPermissionError}</p>
          <button
            onClick={handleRetryPermissions}
            className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all mb-3"
          >
            Allow Required Access
          </button>
          <button
            onClick={() => { stopCamera(); navigate(`/job/${job.id}`); }}
            className="w-full py-3 rounded-xl bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (questionsError || !questions || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-2">AI Generation Offline</p>
          <p className="text-gray-500 text-sm mb-8">{questionsError || "Check if your backend is running and the AI API key is valid in your .env file."}</p>
          <button onClick={() => { stopCamera(); navigate(`/job/${job.id}`); }} className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Interview ended because fullscreen was exited twice ──
  if (interviewEndedByFullscreen) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-rose-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-3">Interview Ended</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Interview ended because fullscreen mode was exited.
          </p>
          <button
            onClick={() => { stopCamera(); navigate(`/job/${job?.id || jobId}`); }}
            className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all"
          >
            Return to Job Profile
          </button>
        </div>
      </div>
    );
  }

  // ── Interview ended because tab was switched twice ──
  if (interviewEndedByTabSwitch) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-rose-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-3">Interview Ended</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Interview ended because tab switching was detected multiple times.
          </p>
          <button
            onClick={() => { stopCamera(); navigate(`/job/${job?.id || jobId}`); }}
            className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all"
          >
            Return to Job Profile
          </button>
        </div>
      </div>
    );
  }

  if (interviewComplete) {
    if (isEvaluating) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F5FB] font-sans gap-6">
          <div className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin shadow-lg" />
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI is evaluating your performance</h2>
            <p className="text-gray-500 text-sm">Please wait while we generate your detailed report and scores.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 font-sans">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 mb-6 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Evaluation Failed</h2>
            <p className="text-gray-500 mb-8">We could not complete your interview evaluation. Please try submitting again or return to the dashboard.</p>
            <div className="flex gap-4">
              <button onClick={() => { stopCamera(); navigate('/dashboard'); }} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors text-sm">
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Interview ready — waiting for user to click "Start Interview" ──
  if (!interviewStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white font-sans">
        <div className="w-full max-w-md text-center px-6">
          {/* Ready icon */}
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-violet-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-2xl font-black text-gray-900 mb-2">Your Interview is Ready</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-2">
            {questions.length} questions have been generated for <span className="font-semibold text-gray-600">{job?.title}</span>
          </p>
          <p className="text-gray-400 text-xs mb-10">
            The interview will start in fullscreen mode.
          </p>

          <button
            onClick={handleStartInterview}
            className="w-full py-4 rounded-xl text-white font-bold shadow-lg hover:opacity-90 transition-all text-sm tracking-wide"
            style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
          >
            Start Interview
          </button>

          <button
            onClick={() => { stopCamera(); navigate(`/job/${job?.id || jobId}`); }}
            className="w-full py-3 mt-3 rounded-xl bg-white border border-gray-200 text-gray-500 font-semibold hover:bg-gray-50 transition-all text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // ACTIVE INTERVIEW (fullscreen is active)
  // ─────────────────────────────────────────────────────

  const currentQuestion = questions[currentQuestionIndex];

  // ── Voice input: constants ──
  const SILENCE_TIMEOUT_MS = 30000; // 30s silence → auto-stop
  const MIN_CONFIDENCE = 0.6; // Minimum confidence threshold for accepting speech

  const startRecording = async () => {
    if (!recognitionRef.current) {
      console.error("Speech recognition not initialized. Check useEffect.");
      return;
    }

    // Reset transcripts for the new recording session
    finalTranscriptRef.current = "";
    setAnswerText("");
    setLiveTranscript("");

    setRecording(true);
    isRecordingRef.current = true;

    try {
      // We use the existing instance from the ref
      recognitionRef.current.start();
      console.log("🎤 Mic started using persistent instance");
    } catch (e) {
      // If the browser says it's already started, we just log it and move on
      if (e.name === 'InvalidStateError') {
        console.warn("Recognition already running.");
      } else {
        console.error("Mic start error:", e.message);
        setRecording(false);
        isRecordingRef.current = false;
      }
    }
  };
  const stopRecording = () => {
    isRecordingRef.current = false;
    setRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("🎤 Mic stopped");
      } catch (e) {
        console.log("Mic was already stopped");
      }
    }
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else { startRecording(); }
  };

  const scoreAnswer = (candidate, modelKeywords) => {
    const candidateLower = (candidate || "").toLowerCase();
    const intersect = (modelKeywords || []).filter((kw) => candidateLower.includes(kw.toLowerCase()));
    const missed = (modelKeywords || []).filter((kw) => !candidateLower.includes(kw.toLowerCase()));
    const ratio = modelKeywords && modelKeywords.length > 0 ? intersect.length / modelKeywords.length : 0;
    return { ratio, intersect, missed };
  };

  const isLastQuestion = currentQuestionIndex + 1 === questions.length;

  const handleSubmitAnswer = async () => {
    // Stop any active recording
    stopRecording();

    // Read from finalTranscriptRef directly, NOT UI field, as per strict instructions
    const finalAnswer = (finalTranscriptRef.current || answerText || '').trim();

    let status = "answered";
    if (!finalAnswer) {
      status = "not_answered";
      console.log('[Submit] No answer provided for question', currentQuestionIndex + 1);
    }
    const isSame = finalAnswer.toLowerCase().trim() === currentQuestion.question.toLowerCase().trim();

    if (isSame) {
      console.warn("Blocked: answer same as question");
      return;
    }
    let savedData = null;
    try {
      console.log("Final answer submitted:", finalAnswer);
      const res = await api.post('/answers/save', {
        interview_id: interviewId,
        question_id: currentQuestionIndex,
        answer_text: finalAnswer,
        answer_status: status
      });
      console.log("Saved to DB:", res.data);
      savedData = res.data;
    } catch (e) {
      console.error("Failed to save answer to DB", e);
      // Wait, should we block if it fails?
      // Strict rule: "ONLY after success move to next question".
      // But if there's a strict network failure, wait we'll alert the user.
      alert("Failed to save answer. Please try again.");
      return; // Do NOT proceed
    }

    const response = {
      questionIndex: currentQuestionIndex,
      userAnswer: finalAnswer || '',
    };

    const newAllAnswers = [...allAnswers, response];
    setAllAnswers(newAllAnswers);
    console.log("Answer per question:", newAllAnswers);

    if (isLastQuestion) {
      finalTranscriptRef.current = "";
      setInterviewComplete(true);
      setIsEvaluating(true);
      stopCamera();

      try {
        const finalEyeScore = eyeContactDataRef.current.frames > 0
          ? eyeContactDataRef.current.consistentFrames / eyeContactDataRef.current.frames
          : 0;

        // Cap proctoring events to prevent payload bloat
        const cappedEvents = (proctoringEvents.current || []).slice(-20);

        // Slim payload — only questionIndex + userAnswer, no modelAnswer/keywords
        const slimAnswers = newAllAnswers.map((a, idx) => ({
          questionIndex: idx,
          userAnswer: (a.userAnswer || '').substring(0, 2000),
        }));

        const res = await api.post('/interviews/evaluate', {
          interview_id: interviewId,
          sessionToken,
          jobId: jobId || job?.id,
          role: job?.title,
          answers: slimAnswers,
          start_time: startTime,
          end_time: new Date(),
          eye_contact_consistency: finalEyeScore,
          proctoring: {
            score: proctoringScore.current,
            warnings: proctoringWarnings.current,
            terminated: false,
            events: cappedEvents,
          },
        });

        navigate(`/interview/review/${res.data.data._id}`, { state: { sessionData: res.data.data } });
      } catch (err) {
        console.error('Failed to submit evaluation', err);
        setIsEvaluating(false);
      }
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // RESET EVERYTHING
      setAnswerText("");
      setLiveTranscript("");
      finalTranscriptRef.current = "";

      setSpeechError("");
      setTimeLeft(120);
      setHasRecorded(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row font-sans">
      <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center border-r border-gray-100 relative max-h-screen overflow-y-auto">
        <div className="interview-header">
          <div className="live-label flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
            {isPaused ? 'SESSION PAUSED' : 'LIVE INTERVIEW SESSION'}
          </div>

          <video
            ref={videoCallbackRef}
            autoPlay
            muted
            playsInline
            className="camera-feed"
            style={{ display: cameraPermissionGranted ? "block" : "none" }}
          />
        </div>

        <div className="max-w-xl mx-auto w-full mt-12 md:mt-0">
          <p className="text-[#8338ec] text-xs font-bold tracking-[0.2em] mb-4 uppercase">
            Question {(currentQuestionIndex + 1).toString().padStart(2, "0")} of {questions.length}
          </p>
          <h2 className="text-4xl md:text-5xl text-gray-900 leading-[1.3] font-[Georgia] tracking-tight">
            {currentQuestion.question}
          </h2>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col items-center justify-center relative bg-white">
        <button
          onClick={handleManualExit}
          className="absolute top-10 right-10 text-[10px] text-gray-700 font-bold hover:text-gray-900 transition-colors flex items-center gap-2 uppercase tracking-widest px-4 py-2 rounded-full border border-gray-200 bg-white shadow-sm"
        >
          Exit <span className="font-light text-sm">&#x2715;</span>
        </button>

        <div className="w-full max-w-sm flex flex-col items-center justify-center">
          <div className="text-center mb-16 relative">
            <h1 className="text-6xl font-black text-slate-800 tabular-nums tracking-tighter">
              {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-2">Recording Time</p>
          </div>

          <div className="w-full flex flex-col items-center justify-center mb-8 gap-6">
            {showDeviceWarning && (
              <div className="eye-warning bg-rose-500 text-white animate-pulse">
                External device detected! Warning {deviceWarningCount} of 3
              </div>
            )}
            {showMultipleVoicesWarning && (
              <div className="eye-warning bg-amber-500 text-white animate-pulse">
                Multiple voices or loud background noise detected!
              </div>
            )}
            {noFaceTime >= 3 && !faceDetected && (
              <div className="eye-warning bg-rose-600 text-white shadow-lg animate-pulse">
                ⚠ Face not detected. Please stay in frame.
              </div>
            )}
            {faceDetected && notFacingTime >= 3 && !facingCamera && (
              <div className="eye-warning bg-amber-500 text-white shadow-lg animate-pulse">
                ⚠ Please face the screen squarely
              </div>
            )}
            {showMultipleFacesWarning && (
              <div className="eye-warning bg-rose-600 text-white shadow-lg animate-pulse">
                ⚠ Multiple faces detected! Only one person allowed.
              </div>
            )}

            {/* Additional Head Movement Warnings - Persistent State */}
            {movementWarning && (
              <div className="eye-warning bg-amber-500 text-white shadow-lg animate-bounce">
                ⚠ {movementWarning} detected! Please stay focused.
              </div>
            )}



            {!isTypingMode ? (
              <div className="w-48 h-48 flex items-center justify-center relative rounded-full">
                <div className={`absolute inset-0 bg-violet-100 rounded-full transition-transform duration-1000 ${recording ? 'scale-[1.8] opacity-50 animate-pulse' : 'scale-100 opacity-0'}`}></div>
                <div className={`absolute inset-4 bg-violet-200 rounded-full transition-transform duration-700 ${recording ? 'scale-[1.3] opacity-60 animate-pulse delay-75' : 'scale-100 opacity-0'}`}></div>
                <button
                  onClick={toggleRecording}
                  disabled={isPaused}
                  className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300 ${isPaused ? 'bg-gray-100 opacity-50 cursor-not-allowed' : recording ? 'bg-[#8338ec] scale-105' : (hasRecorded && !recording) ? 'bg-gray-100' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
                >
                  {recording ? <div className="w-8 h-8 bg-white rounded-sm animate-pulse"></div> : <svg className="w-8 h-8 text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8h-2a5 5 0 01-10 0H3a7.001 7.001 0 006 6.93V17H6v2h8v-2h-3v-2.07z" clipRule="evenodd" /></svg>}
                </button>
                {recording && (
                  <div className="absolute -top-12 flex items-center gap-1.5 h-10 w-32 justify-center">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="w-1.5 bg-violet-400 rounded-full animate-bounce" style={{ height: `${Math.max(20, Math.random() * 100)}%`, animationDelay: `${i * 0.1}s` }}></div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full">
                <p className="text-sm font-semibold text-gray-600 mb-2">Type your answer:</p>
                <textarea
                  value={answerText}
                  onChange={(e) => {
                    setAnswerText(e.target.value);
                    finalTranscriptRef.current = e.target.value;
                  }}
                  disabled={isPaused}
                  className={`w-full h-40 p-4 border border-gray-300 rounded-2xl focus:ring-violet-500 shadow-sm ${isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="Type your response..."
                />
              </div>
            )}
          </div>

          <button
            onClick={handleSubmitAnswer}
            disabled={recording || isPaused}
            className={`w-full text-white py-4 rounded-xl font-medium tracking-wide shadow-lg text-sm mt-6 mb-4 ${(recording || isPaused) ? 'bg-gray-300 cursor-not-allowed' : isLastQuestion ? 'bg-rose-600' : 'bg-[#1e2029]'}`}
          >
            {isLastQuestion ? "END INTERVIEW" : "SUBMIT & NEXT"}
          </button>

          <div className="text-center mt-2">
            <button onClick={() => { setIsTypingMode(!isTypingMode); if (recording) stopRecording(); }} className="text-[10px] text-gray-400 uppercase tracking-widest hover:text-gray-800">
              {isTypingMode ? "Switch to microphone" : "Switch to typing"}
            </button>
          </div>
          {speechError && <div className="w-full mt-6 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-600 shadow-sm text-center">{speechError}</div>}
        </div>
      </div>

      {/* ── Fullscreen Warning Modal Overlay ── */}
      {showFullscreenWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-[scaleIn_0.25s_ease-out]">
            {/* Warning icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-black text-gray-900 mb-3">Fullscreen Required</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              Fullscreen mode is required for this interview.
            </p>
            <p className="text-rose-500 text-xs font-semibold mb-8">
              If you exit fullscreen again, the interview will automatically end.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleReturnToFullscreen}
                className="w-full py-3.5 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all text-sm"
              >
                Return to Fullscreen
              </button>
              <button
                onClick={handleEndInterviewFromWarning}
                className="w-full py-3.5 rounded-xl bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all text-sm"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Switch Warning Modal Overlay ── */}
      {showTabSwitchWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-[scaleIn_0.25s_ease-out]">
            {/* Warning icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-rose-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-black text-gray-900 mb-3">Tab Switching Detected</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              You switched tabs during the interview.
            </p>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              Please remain on the interview page. If this happens again, the interview will automatically end.
            </p>

            <button
              onClick={handleContinueInterview}
              className="w-full py-3.5 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all text-sm mt-6"
            >
              Continue Interview
            </button>
          </div>
        </div>
      )}
      {/* ── Manual Exit Confirmation Modal Overlay ── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-sm w-full p-10 text-center animate-[scaleIn_0.25s_ease-out]">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[#1e2029] mb-3">Are you sure?</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              Your interview progress will be lost and no report will be generated.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-4 rounded-xl bg-[#8338ec] text-white font-bold shadow-lg shadow-violet-100 hover:bg-[#7025e0] transition-all text-sm"
              >
                Stay in Interview
              </button>
              <button
                onClick={confirmManualExit}
                className="w-full py-4 rounded-xl bg-white border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-all text-sm"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Interview;
