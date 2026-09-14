"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { candidateApi } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Video, Mic, MicOff, CheckCircle, Clock, Target, 
  ShieldCheck, Play, ArrowRight, Info, AlertTriangle,
  UserCheck, Activity, Sparkles, ChevronRight, X, AlertOctagon
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CandidateInterview() {
  const { setPageTitle } = useUIStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [applicationId, setApplicationId] = useState<string | null>(searchParams.get('applicationId'));
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [recordStartTime, setRecordStartTime] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [faceDetectionStatus, setFaceDetectionStatus] = useState("Initializing...");
  const [audioLevel, setAudioLevel] = useState(0);

  const [isFullScreen, setIsFullScreen] = useState(typeof document !== 'undefined' ? !!document.fullscreenElement : false);
  const [warningCount, setWarningCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [mediaError, setMediaError] = useState<"PERMISSION_DENIED" | "DEVICE_NOT_FOUND" | "UNKNOWN_ERROR" | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState("Neutral");
  const [proctoringScore, setProctoringScore] = useState(100);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [proctoringAlert, setProctoringAlert] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const multipleFacesCount = useRef(0);
  const noFaceCount = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const faceApiLoaded = useRef(false);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const logMalpracticeMutation = useMutation({
    mutationFn: async (data: any) => {
       if (!interviewId) return;
       await candidateApi.logMalpractice(String(interviewId), data);
    },
  });

  useEffect(() => {
    setPageTitle("AI Interview");
  }, []);

  useEffect(() => {
    // Load biometric analysis engine
    const script = document.createElement("script");
    script.src = "/scripts/face-api.min.js";
    script.async = true;
    script.onload = async () => {
      faceApiLoaded.current = true;
      try {
        const faceapi = (window as any).faceapi;
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        setFaceDetectionStatus("Biometric System Ready");
      } catch (e) {
        console.error("Face API model load failed", e);
        setFaceDetectionStatus("Biometric Engine Error");
      }
    };
    document.head.appendChild(script);
    scriptRef.current = script;
    return () => { if (scriptRef.current) document.head.removeChild(scriptRef.current); };
  }, []);

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    const handleVisibility = () => {
      if (started && !completed && document.visibilityState === "hidden") {
        setWarningCount(v => v + 1);
        logMalpracticeMutation.mutate({ type: "TAB_SWITCH", meta: { timestamp: new Date(), question: currentQ + 1 } });
        toast.error("Warning: Tab switching is monitored.");
      }
    };

    const handleBlur = () => {
      if (started && !completed) {
        setIsWindowFocused(false);
        setWarningCount(v => v + 1);
        logMalpracticeMutation.mutate({ type: "WINDOW_UNFOCUSED", meta: { timestamp: new Date(), question: currentQ + 1 } });
      }
    };

    const handleFocus = () => setIsWindowFocused(true);

    const blockAction = (e: Event) => {
        if (started && !completed) {
          e.preventDefault();
          toast.warning("Action restricted during interview.");
        }
    };

    const handleKeys = (e: KeyboardEvent) => {
        if (started && !completed) {
            // Block Copy/Paste/Save/Print shortcuts
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 's', 'p'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                logMalpracticeMutation.mutate({ type: "COPY_ATTEMPT", meta: { key: e.key, question: currentQ + 1 } });
                toast.warning("Keyboard shortcuts are disabled.");
            }
            // Block DevTools (F12, Ctrl+Shift+I/C/J)
            if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'c', 'j'].includes(e.key.toLowerCase()))) {
                e.preventDefault();
                logMalpracticeMutation.mutate({ type: "DEVELOPER_TOOLS_ATTEMPT", meta: { key: e.key, question: currentQ + 1 } });
                toast.error("Developer tools are prohibited.");
            }
        }
    };

    const handlePrint = (e: Event) => {
        if (started && !completed) {
            e.preventDefault();
            logMalpracticeMutation.mutate({ type: "PRINT_ATTEMPT", meta: { timestamp: new Date() } });
            toast.warning("Printing is disabled during the interview.");
        }
    };

    const handleMouseLeave = (e: MouseEvent) => {
        if (started && !completed && e.clientY <= 0) {
            // Log when mouse leaves through the top of the window (towards tabs/address bar)
            logMalpracticeMutation.mutate({ type: "MOUSE_OUT_OF_BOUNDS", meta: { timestamp: new Date(), question: currentQ + 1 } });
        }
    };

    const handleOffline = () => {
        if (started && !completed) {
            logMalpracticeMutation.mutate({ type: "NETWORK_DISCONNECTED", meta: { timestamp: new Date() } });
            toast.error("Network disconnected! Reconnect immediately.");
        }
    };

    const handleOnline = () => {
        if (started && !completed) {
            toast.success("Network restored.");
        }
    };

    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("copy", blockAction);
    document.addEventListener("paste", blockAction);
    document.addEventListener("contextmenu", blockAction);
    document.addEventListener("dragstart", blockAction);
    document.addEventListener("drop", blockAction);
    window.addEventListener("beforeprint", handlePrint);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("keydown", handleKeys);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("copy", blockAction);
      document.removeEventListener("paste", blockAction);
      document.removeEventListener("contextmenu", blockAction);
      document.removeEventListener("dragstart", blockAction);
      document.removeEventListener("drop", blockAction);
      window.removeEventListener("beforeprint", handlePrint);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("keydown", handleKeys);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [started, completed, currentQ, interviewId]);

  // 1. Biometric & Audio Monitoring Loop
  useEffect(() => {
    if (!started || completed) return;

    let interval: NodeJS.Timeout;
    let noiseCounter = 0;

    const captureSnapshot = () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.6);
        }
      }
      return null;
    };

    const runMonitoring = async () => {
      const faceapi = (window as any).faceapi;
      if (faceapi && faceApiLoaded.current && videoRef.current && videoRef.current.readyState === 4) {
        try {
          const results = await faceapi.detectAllFaces(
            videoRef.current, 
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          ).withFaceLandmarks().withFaceExpressions();

          if (results.length > 1) {
            multipleFacesCount.current += 1;
            if (multipleFacesCount.current > 3) {
              setFaceDetectionStatus(`WARNING: ${results.length} People Detected`);
              setProctoringAlert("Multiple people detected in frame! Screen blurred for security.");
              logMalpracticeMutation.mutate({ 
                type: "MULTIPLE_PERSONS_DETECTED", 
                meta: { 
                  count: results.length, 
                  timestamp: new Date(),
                  image: captureSnapshot()
                } 
              });
            }
          } else if (results.length === 0) {
            noFaceCount.current += 1;
            if (noFaceCount.current > 5) {
              setFaceDetectionStatus("CRITICAL: Face Not Found");
              setProctoringAlert("Face not visible! Please stay in the camera frame.");
              logMalpracticeMutation.mutate({ 
                type: "FACE_NOT_VISIBLE", 
                meta: { 
                  timestamp: new Date(),
                  image: captureSnapshot()
                } 
              });
            }
          } else {
            multipleFacesCount.current = 0;
            noFaceCount.current = 0;
            setProctoringAlert(null);
            
            const data = results[0];
            const landmarks = data.landmarks;
            const expressions = data.expressions;

            // 1. Gaze/Head Pose Analysis
            const nose = landmarks.getNose();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            
            // Calculate horizontal nose center relative to eyes
            const eyeMidX = (leftEye[0].x + rightEye[3].x) / 2;
            const noseX = nose[3].x;
            const horizontalOffset = noseX - eyeMidX;
            const faceWidth = rightEye[3].x - leftEye[0].x;
            const gazeRatio = horizontalOffset / faceWidth;

            if (Math.abs(gazeRatio) > 0.25) {
               setFaceDetectionStatus(gazeRatio > 0 ? "WARNING: Looking Right" : "WARNING: Looking Left");
               logMalpracticeMutation.mutate({ 
                 type: "LOOKING_AWAY_FROM_SCREEN", 
                 meta: { direction: gazeRatio > 0 ? "RIGHT" : "LEFT", ratio: gazeRatio } 
               });
               setProctoringScore(prev => Math.max(0, prev - 1));
            } else {
               setFaceDetectionStatus("Biometrics: Candidate Verified");
            }

            // 2. Emotion Detection
            const sorted = Object.entries(expressions as Record<string, number>).sort((a, b) => b[1] - a[1]);
            setCurrentEmotion(sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1));

            // 3. Lip Sync Anomaly
            const mouth = landmarks.getMouth();
            const topLip = mouth[14].y;
            const bottomLip = mouth[18].y;
            const lipDist = bottomLip - topLip;
            const isSpeakingLips = lipDist > (faceWidth * 0.15);

            if (isSpeakingLips && audioLevel < 5) {
               // Potential voice-over or muted cheating?
               // logMalpracticeMutation.mutate({ type: "LIP_SYNC_ANOMALY", meta: { lips: "OPEN", audio: "SILENT" } });
            }
          }
        } catch (e) { /* Silent fail for frame issues */ }
      }

      // 2. Audio Anomaly Detection
      // If audio level is consistently very high (>70) for 10 seconds, it might be background noise or cheating
      if (audioLevel > 70) {
        noiseCounter++;
        if (noiseCounter > 3) { // ~9-12 seconds of high noise
          logMalpracticeMutation.mutate({ 
            type: "HIGH_BACKGROUND_NOISE", 
            meta: { level: audioLevel, timestamp: new Date() } 
          });
          noiseCounter = 0;
        }
      } else {
        noiseCounter = 0;
      }
    };

    interval = setInterval(runMonitoring, 1000);
    return () => clearInterval(interval);
  }, [started, completed, audioLevel, interviewId]);

  const speakQuestion = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Pause recognition while speaking to prevent self-transcription
    utterance.onstart = () => stopSpeech();
    utterance.onend = () => {
      startSpeech();
      setRecordStartTime(Date.now()); // Reset record timer to start when they can actually talk
    };

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (started && questions[currentQ]) {
      const timer = setTimeout(() => speakQuestion(questions[currentQ].question), 1000);
      return () => clearTimeout(timer);
    }
  }, [currentQ, started, questions]);

  useEffect(() => {
    let animationFrame: number;
    if (started && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      if (!audioContextRef.current) {
        try {
          const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
          const context = new AudioContextClass();
          const source = context.createMediaStreamSource(streamRef.current);
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioContextRef.current = context;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let lastUpdateTime = 0;
          const updateVolume = (timestamp: number) => {
            if (analyserRef.current) {
              if (timestamp - lastUpdateTime > 100) {
                analyserRef.current.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(avg);
                lastUpdateTime = timestamp;
              }
              animationFrame = requestAnimationFrame(updateVolume);
            }
          };
          animationFrame = requestAnimationFrame(updateVolume);
        } catch (e) { console.warn("Audio error", e); }
      }
    }
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (audioContextRef.current) { audioContextRef.current.close().catch(console.error); audioContextRef.current = null; }
    };
  }, [started]);

  const { data: overview } = useQuery({
    queryKey: ["candidate-overview"],
    queryFn: () => candidateApi.getDashboard().then(r => r.data),
  });

  const { data: interviewConfig } = useQuery({
    queryKey: ["interview-config"],
    queryFn: () => candidateApi.getInterviewConfig().then(r => r.data),
  });

  const { data: interviewStatus } = useQuery({
    queryKey: ["interview-status", applicationId],
    queryFn: () => candidateApi.getInterviewStatus(applicationId!).then(r => r.data),
    enabled: !!applicationId && !started,
    refetchInterval: 30000 // Polling for expiry every 30s
  });

  const isExpired = interviewStatus?.expires_at && new Date() > new Date(interviewStatus.expires_at);

  const firstApp = (overview?.applications || overview?.dashboard?.applications || [])[0];

  useEffect(() => {
    if ((firstApp?._id || firstApp?.id) && !applicationId)
      setApplicationId(String(firstApp._id || firstApp.id));
  }, [firstApp]);

  const startMutation = useMutation({
    mutationFn: (id: string) => candidateApi.startInterviewPhase5(id),
    onSuccess: (res) => {
      const data = res.data;
      setInterviewId(data.interview_session_id);
      setQuestions([data.current_question]);
      setStarted(true);
      setRecordStartTime(Date.now());
      if (data.config?.duration_minutes) setTimeLeft(data.config.duration_minutes * 60);
      toast.success("Interview session initialized.");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Initialization failed.");
    }
  });

  const submitResponseMutation = useMutation({
    mutationFn: ({ sessionId, data }: any) => candidateApi.submitResponsePhase5(sessionId, data),
    onSuccess: (res) => {
      const data = res.data;
      if (data.analysis) setCurrentAnalysis(data.analysis);
      if (data.interview_complete) {
        setCompleted(true);
        stopCamera();
        stopSpeech();
        stopRecording();
        return;
      }
      setQuestions((prev: any[]) => [...prev, data.current_question]);
      setCurrentQ((prev: number) => prev + 1);
      setAnswer("");
      setRecordStartTime(Date.now());
      startRecording();
    },
    onError: (err: any) => {
      toast.error("Sync error. Please retry.");
      startRecording();
    }
  });

  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.start(1000);
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
  };

  const startSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (e: any) => {
      let fullTranscript = "";
      for (let i = 0; i < e.results.length; i++) {
        fullTranscript += e.results[i][0].transcript + " ";
      }
      setAnswer(fullTranscript.trim());
    };
    recognition.onerror = (e: any) => {
      // 'aborted' usually happens when we intentionally stop speech, ignore it to reduce log noise
      // 'no-speech' happens when there is silence, which is common
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      if (e.error === 'network') {
        console.warn("Speech Recognition Network Error");
        toast.warning("Speech recognition network error. Please check your connection.");
        setListening(false);
        return;
      }

      console.error("Speech Recognition Error:", e.error);
      if (e.error === 'not-allowed') {
        setMediaError("PERMISSION_DENIED");
        toast.error("Microphone permission denied.");
      }
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (e) {
      console.error("Recognition start failed", e);
    }
  };

  const stopSpeech = () => {
    setListening(false);
    if (recognitionRef.current) { 
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null; 
    }
  };

  const startCamera = async () => {
    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 }, 
        audio: true 
      });

      // Detect Virtual Cameras
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const label = videoTrack.label.toLowerCase();
        if (label.includes("virtual") || label.includes("obs") || label.includes("manycam") || label.includes("snap camera")) {
          stream.getTracks().forEach(t => t.stop());
          toast.error("Virtual cameras are strictly prohibited. Please use a physical webcam.");
          setMediaError("UNKNOWN_ERROR");
          return false;
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Ensure it actually plays
        await videoRef.current.play().catch(e => console.error("Video play failed", e));
      }
      startRecording();
      return true;
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMediaError("PERMISSION_DENIED");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMediaError("DEVICE_NOT_FOUND");
      } else {
        setMediaError("UNKNOWN_ERROR");
      }
      toast.error("Camera and microphone access required.");
      return false;
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleFullScreen = () => {
    const elem = containerRef.current || document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
         toast.error("Fullscreen mode was blocked by your browser settings.");
      });
    }
  };

  const handleStart = async () => {
    try { 
      const cameraSuccess = await startCamera(); 
      if (!cameraSuccess) return;

      if (applicationId) {
        setIsInitializing(true);
        handleFullScreen();
        startMutation.mutate(applicationId); 
        startSpeech(); // Automate speech start
        setTimeout(() => setIsInitializing(false), 2000);
      }
    } catch (e) { 
      console.error(e); 
      setIsInitializing(false);
    }
  };

  const handleSubmitAnswer = () => {
    if (!answer.trim()) { toast.warning("Please provide a verbal response."); return; }
    setIsSubmitting(true);
    stopRecording();
    stopSpeech(); // Stop speech before transition
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const formData = new FormData();
    formData.append("video_blob", blob);
    formData.append("data", JSON.stringify({ 
      question_id: questions[currentQ]?.id, 
      transcription: answer, 
      response_duration_seconds: recordStartTime ? Math.floor((Date.now() - recordStartTime) / 1000) : 30, 
      question_number: currentQ + 1 
    }));
    submitResponseMutation.mutate({ applicationId, sessionId: interviewId, data: formData }, {
      onSettled: () => {
        setIsSubmitting(false);
        // Restart speech for next question if not complete
        if (!completed) startSpeech();
      }
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (completed) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Card className="w-full max-w-xl bg-white border-none shadow-sm rounded-[40px] p-16 text-center space-y-10">
          <div className="w-24 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-100/50">
             <CheckCircle className="w-12 h-12" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Interview Complete</h2>
            <p className="text-slate-500 font-medium leading-relaxed">Your professional evaluation has been successfully recorded and shared with the hiring team.</p>
          </div>
          <Button onClick={() => window.location.href = "/candidate"} className="w-full h-16 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black uppercase tracking-widest transition-all shadow-sm">Return to Dashboard</Button>
        </Card>
      </div>
    );
  }

  if (started && !isFullScreen && !completed && !isInitializing) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono p-12 text-white">
         <div className="text-center">
            <AlertOctagon className="w-24 h-14 text-red-500 mx-auto mb-8 animate-bounce" />
            <h2 className="text-5xl font-black uppercase tracking-tighter">Isolation Breach</h2>
            <p className="text-slate-400 mt-4 font-bold uppercase tracking-widest">Interview Locked: Fullscreen is mandatory</p>
            <Button onClick={handleFullScreen} className="mt-10 bg-white text-black font-black uppercase px-16 h-12 rounded-lg hover:bg-slate-200 transition-all">Re-Enable Shield</Button>
         </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50/30">
      {!isWindowFocused && started && !completed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
          <div className="text-center p-12 bg-white rounded-lg max-w-lg shadow-sm">
             <AlertOctagon className="w-20 h-12 text-orange-500 mx-auto mb-6 animate-pulse" />
             <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4">Focus Lost</h2>
             <p className="text-slate-600 font-medium mb-8">You clicked away from the interview window. This action has been logged.</p>
             <Button onClick={() => setIsWindowFocused(true)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 h-12 font-bold uppercase tracking-wide">Resume</Button>
          </div>
        </div>
      )}
      
      {proctoringAlert && started && !completed && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-xl">
          <div className="text-center p-12 bg-white rounded-lg max-w-lg shadow-sm">
             <AlertTriangle className="w-20 h-12 text-red-500 mx-auto mb-6 animate-pulse" />
             <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4">Security Alert</h2>
             <p className="text-slate-600 font-medium mb-8">{proctoringAlert}</p>
             <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Fix the issue to resume interview</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-10 pb-12 pt-8">
        {!started ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <Card className="max-w-4xl w-full bg-white border-none shadow-sm rounded-[40px] overflow-hidden">
              <div className="p-16 space-y-12">
                 <div className="flex items-center gap-6">
                    <div className="w-10 h-10 bg-blue-600 rounded-[24px] flex items-center justify-center shadow-lg shadow-blue-100">
                       <Video className="text-white w-8 h-8" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black text-slate-900 tracking-tight">AI Technical Interview</h2>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Phase 5: Cognitive Evaluation</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { label: "Duration", val: `${interviewConfig?.DURATION_MINUTES || 60}m`, icon: Clock, color: "text-blue-500", bg: "bg-blue-50" },
                      { label: "Questions", val: `${interviewConfig?.TOTAL_QUESTIONS || 10} Units`, icon: Target, color: "text-purple-500", bg: "bg-purple-50" }
                    ].map((stat, i) => (
                      <div key={i} className="p-5 rounded-xl bg-slate-50 border border-slate-50 flex items-center gap-6">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shadow-sm", stat.bg, stat.color)}><stat.icon className="w-6 h-6" /></div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                          <p className="text-lg font-black text-slate-900">{stat.val}</p>
                        </div>
                      </div>
                    ))}
                 </div>

                  {mediaError ? (
                    <div className="p-6 rounded-xl bg-red-50 border border-red-100 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                          <AlertOctagon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-red-900 uppercase tracking-tight">Access Restricted</h3>
                          <p className="text-red-700/70 text-xs font-bold uppercase tracking-widest">
                            {mediaError === "PERMISSION_DENIED" ? "Camera & Mic Permission Denied" : "Media Device Not Found"}
                          </p>
                        </div>
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {mediaError === "PERMISSION_DENIED" 
                          ? "We need access to your camera and microphone to conduct the AI interview. Please click the camera icon in your browser address bar and select 'Allow'." 
                          : "We couldn't find a working camera or microphone on your device. Please ensure they are connected and active."}
                      </p>
                      <Button onClick={handleStart} variant="outline" className="bg-white border-red-200 text-red-600 hover:bg-red-50 rounded-lg h-14 px-5 font-black uppercase tracking-widest">
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-500" /> Compliance Protocols
                       </h3>
                       <div className="grid grid-cols-1 gap-4">
                         {[
                            "Region-optimized AI engine will facilitate the session.",
                            "Environment monitoring will ensure assessment integrity.",
                            "Session locking is active to prevent navigation breaches.",
                            "Exiting fullscreen mode will be logged as a strike."
                         ].map((t, i) => (
                           <div key={i} className="flex gap-4 p-5 bg-slate-50/50 rounded-lg border border-slate-50">
                             <span className="text-blue-600 font-black">0{i + 1}.</span>
                             <span className="text-slate-600 text-sm font-medium leading-relaxed">{t}</span>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}

                 <div className="bg-slate-900 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
                    <div className="relative z-10 flex items-start gap-6 max-w-xl">
                       <div 
                          onClick={() => setAgreed(!agreed)}
                          className={cn(
                             "w-10 h-10 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all shrink-0",
                             agreed ? "bg-blue-600 border-blue-600" : "border-slate-700 hover:border-slate-600"
                          )}
                       >
                          {agreed && <CheckCircle className="w-6 h-6 text-white" />}
                       </div>
                       <div>
                          <h4 className="text-white font-bold text-lg">I acknowledge the professional constraints</h4>
                          <p className="text-slate-400 text-sm mt-1">Accept biometric data sync and assessment protocols.</p>
                       </div>
                    </div>

                    {interviewStatus?.expires_at && (
                      <div className="relative z-10 flex flex-col items-end gap-2 bg-white/5 backdrop-blur-xl p-6 rounded-[24px] border border-white/10 min-w-[280px]">
                          <div className="flex items-center gap-2 text-rose-400">
                             <Clock className="w-4 h-4" />
                             <span className="text-[10px] font-black uppercase tracking-widest">Attempt Window Closing</span>
                          </div>
                          <p className={cn(
                             "text-lg font-black tabular-nums",
                             isExpired ? "text-rose-500" : "text-white"
                          )}>
                             {isExpired ? "EXPIRED" : new Date(interviewStatus.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                             Locks on {new Date(interviewStatus.expires_at).toLocaleDateString()}
                          </p>
                      </div>
                    )}

                    <Button 
                       disabled={!agreed || startMutation.isPending || isExpired}
                       onClick={handleStart}
                       className={cn(
                          "relative z-10 h-16 px-12 rounded-[24px] font-black uppercase tracking-widest transition-all shadow-sm",
                          isExpired ? "bg-rose-500 text-white cursor-not-allowed" : "bg-white hover:bg-slate-50 text-slate-900"
                       )}
                    >
                       {isExpired ? "Session Locked" : startMutation.isPending ? "Configuring..." : "Start Interview"}
                    </Button>
                    <div className="absolute top-0 right-0 p-12 opacity-5"><Sparkles className="w-48 h-48 text-white" /></div>
                 </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Question Area */}
            <div className="lg:col-span-8 space-y-8">
              {questions[currentQ] && (
                <Card className="bg-white border-none shadow-sm rounded-[40px] overflow-hidden flex flex-col min-h-[600px]">
                  <div className="p-6 lg:p-14 border-b border-slate-50 relative">
                     <div className="flex items-center justify-between mb-8">
                        <Badge className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-lg border-none font-black text-[10px] uppercase tracking-widest">Question {currentQ + 1} of {interviewConfig?.TOTAL_QUESTIONS || 10}</Badge>
                        {timeLeft !== null && (
                           <div className="flex items-center gap-3">
                              <Clock className={cn("w-5 h-5", timeLeft < 300 ? "text-red-500 animate-pulse" : "text-slate-300")} />
                              <span className="text-lg font-black text-slate-900 font-mono tracking-tighter">{formatTime(timeLeft)}</span>
                           </div>
                        )}
                     </div>
                     <h3 className="text-xl font-bold text-slate-900 leading-tight">
                        {questions[currentQ].question}
                     </h3>
                  </div>

                  <div className="flex-1 p-6 lg:p-14 flex flex-col bg-slate-50/30">
                     <div className="flex-1 rounded-xl bg-white border-2 border-slate-50 p-12 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                        {!answer ? (
                           <div className="space-y-6">
                              <div className="flex justify-center items-center gap-2 h-16">
                                 {[...Array(12)].map((_, i) => (
                                   <div
                                     key={i}
                                     className={cn(
                                       "w-2 rounded-full transition-all duration-150",
                                       audioLevel > 5 ? "bg-blue-500" : "bg-slate-100"
                                     )}
                                     style={{ 
                                        height: audioLevel > 5 
                                           ? `${Math.random() * 40 + 10}px` 
                                           : "8px" 
                                     }}
                                   />
                                 ))}
                              </div>
                              <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">
                                 {audioLevel > 5 ? "AI Capture Active" : "Waiting for audio..."}
                              </p>
                           </div>
                        ) : (
                           <div className="max-w-3xl">
                              <p className="text-slate-700 text-lg font-medium leading-relaxed italic">
                                 "{answer}"
                              </p>
                           </div>
                        )}
                        {listening && <div className="absolute top-6 right-6 flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                           <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                           <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Recording</span>
                        </div>}
                     </div>

                     <div className="mt-12 flex items-center justify-between">
                        <div className="flex gap-4">
                           <Button 
                              onClick={listening ? stopSpeech : startSpeech} 
                              className={cn(
                                 "h-12 w-20 rounded-[28px] shadow-sm transition-all duration-300 relative group",
                                 listening ? "bg-red-500 hover:bg-red-600 text-white" : "bg-white hover:bg-slate-50 text-slate-900 border border-slate-100"
                              )}
                           >
                              {listening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                           </Button>
                           <Button 
                              onClick={() => setAnswer("")}
                              variant="ghost"
                              className="h-12 px-5 rounded-[28px] text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-red-500"
                           >
                              Reset Answer
                           </Button>
                        </div>
                        <Button 
                           onClick={handleSubmitAnswer}
                           disabled={isSubmitting || !answer.trim()}
                           className="h-12 px-16 rounded-[28px] bg-slate-900 hover:bg-black text-white font-black uppercase tracking-[0.2em] shadow-sm transition-all disabled:opacity-20"
                        >
                           {isSubmitting ? "Syncing..." : "Submit Response"}
                        </Button>
                     </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-8">
              <Card className="aspect-video bg-black rounded-[40px] border-none shadow-lg overflow-hidden relative group">
                 <video ref={videoRef} autoPlay muted playsInline width="1280" height="720" className="w-full h-full object-cover scale-x-[-1]" />
                 <div className="absolute top-6 left-6 flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">AI Interview Link</span>
                 </div>
                 <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                    <Badge className="bg-blue-600 text-white border-none font-bold text-[9px] uppercase px-3 py-1">Biometrics Active</Badge>
                    <Activity className="w-5 h-5 text-white/30" />
                 </div>
              </Card>

              <Card className="bg-white border-none shadow-sm rounded-[40px] p-6 space-y-10">
                 <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Real-time Analysis</h4>
                    <div className="flex items-center justify-between">
                       <p className="text-lg font-bold text-slate-900">Cognitive Metrics</p>
                       <Activity className="w-6 h-6 text-blue-500/50" />
                    </div>
                 </div>

                 <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Alignment</span>
                        <span className="text-xl font-black text-slate-900">{currentAnalysis ? Math.round(currentAnalysis.relevance * 100) : (answer ? 88 : 12)}%</span>
                      </div>
                      <Progress value={currentAnalysis ? Math.round(currentAnalysis.relevance * 100) : (answer ? 88 : 12)} className="h-2 bg-slate-100 [&>div]:bg-blue-600" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sentiment</p>
                           <p className="font-bold text-slate-900">{currentEmotion || (currentAnalysis ? (currentAnalysis.sentiment > 0.6 ? "Positive" : "Balanced") : "Syncing")}</p>
                        </div>
                       <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Confidence</p>
                          <p className="font-bold text-blue-600">{currentAnalysis ? (currentAnalysis.confidence > 0.7 ? "High" : "Normal") : "Syncing"}</p>
                       </div>
                    </div>
                 </div>

                 <div className="p-6 bg-blue-50/50 rounded-lg border border-blue-100 flex gap-4">
                    <Info className="w-5 h-5 text-blue-600 shrink-0" />
                    <p className="text-[10px] font-medium text-slate-500 leading-relaxed">Cognitive evaluation is powered by GPT-4 and behavioral biometric mapping.</p>
                 </div>
              </Card>

              <Card className="bg-slate-900 rounded-[40px] p-5 text-white">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center">
                       <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Environment</p>
                       <p className="text-sm font-bold">{faceDetectionStatus}</p>
                    </div>
                 </div>
                 <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Please ensure you are in a quiet, well-lit environment. Technical issues? <button onClick={() => router.push("/contact")} className="text-blue-400 font-bold">Contact Support</button></p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
