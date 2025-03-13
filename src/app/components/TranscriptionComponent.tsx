// app/components/TranscriptionComponent.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { supabase, Transcription } from './../lib/supabase';

interface TranscriptionComponentProps {
    onTranscriptUpdate: (transcript: string) => void;
    isActive: boolean;
}

// Custom type for grouping transcriptions by speaker
interface GroupedTranscription {
    speaker: string;
    segments: {
        id: string;
        text: string;
        timestamp: string;
    }[];
}

export default function TranscriptionComponent({ onTranscriptUpdate, isActive }: TranscriptionComponentProps) {
    const { user } = useUser();
    const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
    const [recording, setRecording] = useState(false);
    const [recognitionSupported, setRecognitionSupported] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [liveTranscript, setLiveTranscript] = useState<string>('');
    const [sessionText, setSessionText] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [heartbeat, setHeartbeat] = useState(0);

    // Use refs to track state across renders and event callbacks
    const recognitionRef = useRef<any>(null);
    const transcriptionEndRef = useRef<HTMLDivElement>(null);
    const isStoppingRef = useRef(false);
    const isFinalizingRef = useRef(false);
    const accumulatedText = useRef('');
    const lastActivityRef = useRef(Date.now());
    const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
    const noActivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Constants
    const MAX_INACTIVE_TIME = 5000; // 5 seconds - reduced for faster recovery

    // Format live text for better readability
    const formatLiveText = (text: string): string => {
        if (!text || text === "Listening..." || text === "Restarting recognition...") {
            return text;
        }

        // Simple capitalize first letter
        return text.charAt(0).toUpperCase() + text.slice(1);
    };

    // Auto-scroll to bottom when new transcriptions arrive or when live transcript changes
    useEffect(() => {
        if (transcriptionEndRef.current) {
            transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [transcriptions, liveTranscript, heartbeat]);

    // Set up heartbeat timer for UI updates and activity monitoring
    useEffect(() => {
        if (recording) {
            // Clean up any existing timers
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
            }
            if (noActivityTimeoutRef.current) {
                clearTimeout(noActivityTimeoutRef.current);
            }

            // Set up new heartbeat timer with more frequent checks
            heartbeatTimerRef.current = setInterval(() => {
                // Update heartbeat to trigger UI refresh
                setHeartbeat(prev => prev + 1);

                // Check for inactivity
                const now = Date.now();
                const timeSinceLastActivity = now - lastActivityRef.current;

                // If no activity for 3 seconds, update UI
                if (timeSinceLastActivity > 3000) {
                    setLiveTranscript("Listening...");
                }

                // If no activity for too long but less than max time, check if recognition is still active
                if (timeSinceLastActivity > 5000 && timeSinceLastActivity < MAX_INACTIVE_TIME && !isStoppingRef.current) {
                    // Check if recognition is still active by attempting to get its state
                    if (recognitionRef.current) {
                        try {
                            // If we can't access a property, it might be in a bad state
                            console.log("Recognition still appears active");
                        } catch (error) {
                            console.log("Recognition appears to be in a bad state, restarting");
                            restartRecognition();
                        }
                    } else if (recording) {
                        // No recognition instance but we're supposed to be recording
                        console.log("No active recognition instance but recording flag is true, restarting");
                        restartRecognition();
                    }
                }

                // If no activity for max time, force restart recognition
                if (timeSinceLastActivity > MAX_INACTIVE_TIME && !isStoppingRef.current) {
                    console.log("Maximum inactivity time reached, forcing restart");
                    restartRecognition();
                }
            }, 500); // Check more frequently (every 500ms instead of 1000ms)
        } else {
            // Clean up timers when not recording
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
            if (noActivityTimeoutRef.current) {
                clearTimeout(noActivityTimeoutRef.current);
                noActivityTimeoutRef.current = null;
            }
        }

        // Cleanup on effect change
        return () => {
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
            if (noActivityTimeoutRef.current) {
                clearTimeout(noActivityTimeoutRef.current);
                noActivityTimeoutRef.current = null;
            }
        };
    }, [recording]);

    // Function to restart recognition when stalled
    const restartRecognition = () => {
        console.log("Recognition appears stalled, performing restart");

        // Reset activity timer
        lastActivityRef.current = Date.now();

        // Stop current recognition if it exists
        if (recognitionRef.current) {
            try {
                const tempRef = recognitionRef.current;
                recognitionRef.current = null;
                tempRef.stop();
            } catch (error) {
                console.error("Error stopping stalled recognition:", error);
            }
        }

        // Only restart if we're still recording and not in the stopping process
        if (recording && !isStoppingRef.current) {
            setLiveTranscript("Restarting recognition...");
            // Use a shorter timeout to restart faster
            setTimeout(() => startNewRecognition(), 100);
        }
    };

    // Function to create a new speech recognition instance
    const createRecognitionInstance = () => {
        if (typeof window === 'undefined') return null;

        // Access the Speech Recognition API safely
        const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.log("Speech recognition not supported in this browser");
            setRecognitionSupported(false);
            return null;
        }

        try {
            // Create a new recognition instance
            const recognition = new SpeechRecognition();

            // Configure recognition with more resilient settings
            recognition.continuous = false; // We'll manage continuity ourselves
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            recognition.maxAlternatives = 1; // We only need one result

            return recognition;
        } catch (error) {
            console.error("Error creating speech recognition instance:", error);
            setRecognitionSupported(false);
            return null;
        }
    };

    // Function to start a new recognition instance
    const startNewRecognition = () => {
        // Skip if we're stopping or not recording
        if (isStoppingRef.current || !recording) return;

        // Create a fresh recognition instance
        const recognition = createRecognitionInstance();
        if (!recognition) {
            setStatusMessage('Failed to create recognition instance');
            setRecording(false);
            return;
        }

        // Configure event handlers using addEventListener instead of on* properties
        recognition.addEventListener('result', (event: Event) => {
            // Type assertion to access the SpeechRecognition event properties
            const speechEvent = event as unknown as {
                results: {
                    [index: number]: {
                        [index: number]: {
                            transcript: string;
                        };
                        isFinal: boolean;
                    };
                };
                resultIndex: number;
            };

            // Update activity timestamp
            lastActivityRef.current = Date.now();

            // Skip if we're explicitly stopping
            if (isStoppingRef.current) return;

            // Process results
            const currentResult = speechEvent.results[0];
            const transcript = currentResult[0].transcript;

            if (currentResult.isFinal) {
                // For final results, accumulate text
                accumulatedText.current += ' ' + transcript;
                accumulatedText.current = accumulatedText.current.trim();

                // Update display
                setSessionText(accumulatedText.current);
                setLiveTranscript('');

                // Update parent component
                onTranscriptUpdate(accumulatedText.current);

                // Start new recognition if still recording
                if (recording && !isStoppingRef.current) {
                    // Start next recognition immediately to reduce gaps
                    startNewRecognition();
                }
            } else {
                // For interim results, show in the live display
                setLiveTranscript(transcript);
            }
        });

        // Handle recognition start
        recognition.addEventListener('start', () => {
            console.log("Speech recognition started");
            lastActivityRef.current = Date.now();
        });

        // Handle recognition end
        recognition.addEventListener('end', () => {
            console.log("Speech recognition ended");

            // If stopping, finalize recording
            if (isStoppingRef.current) {
                finalizeRecording();
                return;
            }

            // If still recording, restart recognition immediately
            if (recording && recognitionRef.current === recognition) {
                console.log("Recognition ended but still recording. Restarting...");
                // Start immediately to reduce gaps
                startNewRecognition();
            }
        });

        // Handle recognition errors with better recovery
        recognition.addEventListener('error', (event: Event) => {
            const errorEvent = event as unknown as { error: string };
            console.log('Speech recognition error:', errorEvent.error);

            switch (errorEvent.error) {
                case 'not-allowed':
                    setStatusMessage('Please allow microphone access to use the transcription feature.');
                    isStoppingRef.current = true;
                    setRecording(false);
                    break;

                case 'no-speech':
                    setLiveTranscript("Listening... (Try speaking louder or check your microphone)");
                    lastActivityRef.current = Date.now();

                    // Continue if still recording - restart with shorter delay
                    if (recording && !isStoppingRef.current) {
                        setTimeout(() => startNewRecognition(), 100);
                    }
                    break;

                case 'network':
                    console.log("Network error in speech recognition, attempting recovery");
                    // For network errors, try to recover
                    if (recording && !isStoppingRef.current) {
                        setLiveTranscript("Network issue detected. Reconnecting...");
                        setTimeout(() => startNewRecognition(), 300);
                    }
                    break;

                case 'aborted':
                    // This can happen when the browser aborts the recognition
                    console.log("Recognition aborted, attempting recovery");
                    if (recording && !isStoppingRef.current) {
                        setTimeout(() => startNewRecognition(), 100);
                    }
                    break;

                default:
                    // For other errors, restart if still recording with a short delay
                    console.log(`Unhandled speech recognition error: ${errorEvent.error}`);
                    if (recording && !isStoppingRef.current) {
                        setTimeout(() => startNewRecognition(), 200);
                    }
            }
        });

        // Store the recognition instance
        recognitionRef.current = recognition;

        // Start recognition
        try {
            recognition.start();
            lastActivityRef.current = Date.now();
        } catch (error) {
            console.error("Error starting recognition:", error);

            // Check for specific error types
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';

            if (errorMsg.includes('already running')) {
                // This can happen if a previous instance didn't clean up properly
                console.log("Recognition already running, stopping and restarting");
                try {
                    recognition.stop();
                } catch (stopError) {
                    console.error("Error stopping existing recognition:", stopError);
                }

                // Try again after a short delay
                setTimeout(() => {
                    if (recording && !isStoppingRef.current) {
                        startNewRecognition();
                    }
                }, 100);
            } else {
                setStatusMessage(`Error starting recording: ${errorMsg}`);
                recognitionRef.current = null;

                // If catastrophic failure that can't be recovered, stop recording
                if (recording) {
                    setRecording(false);
                }
            }
        }
    };

    // Function to finalize recording
    const finalizeRecording = () => {
        console.log("Finalizing recording");

        // Prevent multiple finalization calls
        if (isFinalizingRef.current) {
            console.log("Finalization already in progress, skipping");
            return;
        }

        isFinalizingRef.current = true;

        // Important: Before we finalize, check if there's any live transcription to save
        if (liveTranscript && liveTranscript !== "Listening..." && liveTranscript !== "Restarting recognition...") {
            // Add live transcript to accumulated text
            accumulatedText.current = (accumulatedText.current + ' ' + liveTranscript).trim();
            setSessionText(accumulatedText.current);

            // Update parent component
            onTranscriptUpdate(accumulatedText.current);
        }

        // Reset state
        setRecording(false);
        setLiveTranscript('');
        setStatusMessage('Recording stopped.');
        isStoppingRef.current = false;

        // Clear resources only after saving
        setTimeout(() => {
            accumulatedText.current = '';
            isFinalizingRef.current = false;
        }, 100);
    };

    // Start/stop recording
    const toggleRecording = () => {
        if (recording) {
            // Stopping recording
            console.log("Stopping recording...");

            // Update UI immediately
            setStatusMessage('Stopping recording...');

            // Set the stopping flag to prevent restarts
            isStoppingRef.current = true;

            // Capture current live transcript if it exists
            if (liveTranscript && liveTranscript !== "Listening..." && liveTranscript !== "Restarting recognition...") {
                const newText = (accumulatedText.current + ' ' + liveTranscript).trim();
                accumulatedText.current = newText;
                setSessionText(newText);
                setLiveTranscript('');

                // Update parent component
                onTranscriptUpdate(newText);
            }

            // Stop recognition instance if it exists
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                    // Let the onend handler call finalizeRecording
                } catch (error) {
                    console.error("Error stopping recognition:", error);

                    // If stop fails, force finalization
                    finalizeRecording();
                }
            } else {
                // No active recognition, just finalize
                finalizeRecording();
            }

            // Failsafe: ensure we finalize if stop doesn't trigger onend
            setTimeout(() => {
                if (isStoppingRef.current && !isFinalizingRef.current) {
                    console.log("Stop timeout reached, forcing finalization");
                    finalizeRecording();
                }
            }, 1000);
        } else {
            // Starting recording
            console.log("Starting recording...");

            // Request microphone permission
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => {
                    // Reset recording state
                    setStatusMessage('Recording started. Speak now...');
                    setRecording(true);
                    isStoppingRef.current = false;
                    isFinalizingRef.current = false;
                    accumulatedText.current = '';
                    setSessionText('');
                    setLiveTranscript('');
                    lastActivityRef.current = Date.now();

                    // Start recognition
                    startNewRecognition();
                })
                .catch(err => {
                    console.error("Microphone permission denied:", err);
                    setStatusMessage('Microphone access denied. Please allow microphone access in your browser.');
                });
        }
    };

    // UI feedback based on activity
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    const isActiveNow = timeSinceActivity < 3000;
    const cursorAnimation = isActiveNow ? "animate-pulse" : "animate-[pulse_1.5s_ease-in-out_infinite]";

    // Handle authentication requirement
    if (!user) {
        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                <p className="font-bold">Authentication Required</p>
                <p>Please sign in to access transcription.</p>
            </div>
        );
    }

    // Handle browser compatibility
    if (!recognitionSupported) {
        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                <p className="font-bold">Warning</p>
                <p>Your browser doesn't support the Web Speech API. Please use Chrome, Edge, or Safari for transcription.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Transcription Display */}
            <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 mb-4 min-h-[400px]">
                <div className="space-y-6">
                    {!liveTranscript && !sessionText ? (
                        <p className="text-gray-500 text-center italic">No transcriptions yet. Start recording to begin.</p>
                    ) : (
                        <>
                            {/* Current Session Text (accumulated final transcripts) */}
                            {sessionText && (
                                <div className="flex items-start space-x-2">
                                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                        <span className="text-xs font-medium text-indigo-800">{user?.fullName?.charAt(0) || 'Y'}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-baseline">
                                            <span className="text-sm font-medium text-gray-900">
                                                {user?.fullName || 'You'}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-500">{new Date().toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="text-gray-700 mt-1">
                                            {sessionText}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Live Transcription (including both interim and final results) */}
                            {(recording || liveTranscript) && (
                                <div className="flex items-start space-x-2">
                                    <div className={`flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center ${isActiveNow ? "animate-pulse" : ""}`}>
                                        <span className="text-xs font-medium text-indigo-800">{user?.fullName?.charAt(0) || 'Y'}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-baseline">
                                            <span className="text-sm font-medium text-gray-900">
                                                {user?.fullName || 'You'}
                                                <span className="ml-2 text-xs font-normal text-indigo-500">(live)</span>
                                            </span>
                                            <span className="ml-2 text-xs text-gray-500">{new Date().toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="text-gray-700 border-l-2 border-indigo-300 pl-2 mt-1">
                                            {formatLiveText(liveTranscript) || (recording ? "Listening..." : "")}
                                            <span className={`ml-1 ${cursorAnimation}`}>|</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={transcriptionEndRef} />
                </div>
            </div>

            {/* Recording Controls */}
            <div className="bg-gray-100 p-4 rounded-lg shadow">
                <button
                    onClick={toggleRecording}
                    disabled={!isActive || isSaving}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white ${
                        recording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    } ${!isActive || isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isSaving ? 'Saving...' : recording ? 'Stop Recording' : 'Start Recording'}
                </button>

                {statusMessage && (
                    <div className="mt-2 text-sm text-gray-600">
                        <p>{statusMessage}</p>
                    </div>
                )}

                {recording && (
                    <div className="flex items-center justify-center mt-2">
                        <div className="animate-pulse h-3 w-3 bg-red-600 rounded-full mr-2"></div>
                        <span className="text-sm text-gray-600">Recording in progress...</span>
                    </div>
                )}
            </div>
        </div>
    );
}