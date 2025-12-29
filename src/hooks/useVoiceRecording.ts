import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseVoiceRecordingOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  maxDurationMs?: number; // Maximum recording duration in milliseconds
}

const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB max for OpenAI Whisper
const DEFAULT_MAX_DURATION = 5 * 60 * 1000; // 5 minutes default

export function useVoiceRecording({ 
  onTranscript, 
  onError,
  maxDurationMs = DEFAULT_MAX_DURATION 
}: UseVoiceRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<number | null>(null);
  
  // Store callbacks in refs to avoid dependency issues
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  // Cleanup audio level monitoring
  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Monitor audio levels for waveform visualization
  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average level
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        const normalizedLevel = average / 255;
        
        setAudioLevel(normalizedLevel);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (err) {
      console.error('Failed to start audio level monitoring:', err);
    }
  }, []);

  // Process audio in chunks if needed
  const processAudioChunked = useCallback(async (audioBlob: Blob): Promise<string> => {
    console.log('Processing audio, size:', audioBlob.size, 'bytes');
    
    // If audio is within size limit, process normally
    if (audioBlob.size <= MAX_CHUNK_SIZE) {
      return await processAudioBlob(audioBlob);
    }
    
    // For larger files, we need to process in chunks
    // This is a simplified approach - for very long recordings, 
    // consider splitting by time segments
    console.log('Audio too large, processing in chunks');
    
    const chunkCount = Math.ceil(audioBlob.size / MAX_CHUNK_SIZE);
    const transcripts: string[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const start = i * MAX_CHUNK_SIZE;
      const end = Math.min((i + 1) * MAX_CHUNK_SIZE, audioBlob.size);
      const chunk = audioBlob.slice(start, end, audioBlob.type);
      
      console.log(`Processing chunk ${i + 1}/${chunkCount}`);
      const transcript = await processAudioBlob(chunk);
      if (transcript) {
        transcripts.push(transcript);
      }
    }
    
    return transcripts.join(' ');
  }, []);

  const processAudioBlob = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        try {
          const { data, error } = await supabase.functions.invoke('voice-to-text', {
            body: { audio: base64Audio }
          });
          
          if (error) {
            reject(error);
            return;
          }
          
          if (data.text && data.text.trim()) {
            resolve(data.text.trim());
          } else if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve('');
          }
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read audio file'));
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = useCallback(async () => {
    if (chunksRef.current.length === 0) {
      console.log('No audio chunks to process');
      onErrorRef.current?.('No audio recorded. Please try again.');
      setIsProcessing(false);
      return;
    }

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    console.log('Audio blob size:', audioBlob.size, 'bytes');
    
    if (audioBlob.size < 1000) {
      console.log('Audio too short');
      onErrorRef.current?.('Recording too short. Please speak for at least 1 second.');
      setIsProcessing(false);
      return;
    }

    try {
      const transcript = await processAudioChunked(audioBlob);
      
      if (transcript) {
        onTranscriptRef.current(transcript);
      } else {
        onErrorRef.current?.('No speech detected. Please try again.');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      onErrorRef.current?.(err instanceof Error ? err.message : 'Failed to transcribe audio');
    } finally {
      setIsProcessing(false);
    }
  }, [processAudioChunked]);

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      setRecordingDuration(0);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      
      // Start audio level monitoring for waveform
      startAudioLevelMonitoring(stream);
      
      // Check supported mime types
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/mp4';
      
      console.log('Using mime type:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, chunks:', chunksRef.current.length);
        
        // Stop duration tracking
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        
        // Stop audio level monitoring
        stopAudioLevelMonitoring();
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        setIsProcessing(true);
        processAudio();
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        stopAudioLevelMonitoring();
        onErrorRef.current?.('Recording error occurred');
      };
      
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now();
      
      // Track recording duration
      durationIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartTimeRef.current;
        setRecordingDuration(elapsed);
        
        // Auto-stop if max duration reached
        if (elapsed >= maxDurationMs) {
          console.log('Max duration reached, stopping recording');
          stopRecording();
        }
      }, 100);
      
      // Request data every 250ms for more reliable recording
      mediaRecorder.start(250);
      setIsRecording(true);
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      stopAudioLevelMonitoring();
      onErrorRef.current?.('Failed to access microphone. Please allow microphone access.');
    }
  }, [processAudio, startAudioLevelMonitoring, stopAudioLevelMonitoring, maxDurationMs]);

  const stopRecording = useCallback(() => {
    console.log('Stopping recording...');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioLevelMonitoring();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [stopAudioLevelMonitoring]);

  return {
    isRecording,
    isProcessing,
    audioLevel,
    recordingDuration,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
