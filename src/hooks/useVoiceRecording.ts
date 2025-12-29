import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseVoiceRecordingOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecording({ onTranscript, onError }: UseVoiceRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Store callbacks in refs to avoid dependency issues
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

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

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      console.log('Base64 audio length:', base64Audio?.length);
      
      try {
        const { data, error } = await supabase.functions.invoke('voice-to-text', {
          body: { audio: base64Audio }
        });
        
        if (error) {
          console.error('Supabase function error:', error);
          throw error;
        }
        
        console.log('Transcription response:', data);
        
        if (data.text && data.text.trim()) {
          onTranscriptRef.current(data.text.trim());
        } else if (data.error) {
          onErrorRef.current?.(data.error);
        } else {
          onErrorRef.current?.('No speech detected. Please try again.');
        }
      } catch (err) {
        console.error('Transcription error:', err);
        onErrorRef.current?.(err instanceof Error ? err.message : 'Failed to transcribe audio');
      } finally {
        setIsProcessing(false);
      }
    };
    
    reader.onerror = () => {
      console.error('FileReader error');
      onErrorRef.current?.('Failed to process audio file');
      setIsProcessing(false);
    };
    
    reader.readAsDataURL(audioBlob);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      
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
        onErrorRef.current?.('Recording error occurred');
      };
      
      mediaRecorderRef.current = mediaRecorder;
      // Request data every 250ms for more reliable recording
      mediaRecorder.start(250);
      setIsRecording(true);
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      onErrorRef.current?.('Failed to access microphone. Please allow microphone access.');
    }
  }, [processAudio]);

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

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
