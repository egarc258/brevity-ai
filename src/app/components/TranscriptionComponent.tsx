// app/components/TranscriptionComponent.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { supabase, Transcription } from './../lib/supabase';

interface TranscriptionComponentProps {
    meetingId: string;
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

export default function TranscriptionComponent({ meetingId }: TranscriptionComponentProps) {
    const { user, isLoaded } = useUser();
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

    // Load initial transcriptions
    useEffect(() => {
        if (!user) return;

        const fetchTranscriptions = async () => {
            try {
                const { data, error } = await supabase
                    .from('transcriptions')
                    .select('*')
                    .eq('meeting_id', meetingId)
                    .order('timestamp', { ascending: true });

                if (error) {
                    console.error('Error fetching transcriptions:', error);
                    return;
                }

                setTranscriptions(data || []);
            } catch (err) {
                console.error('Error in fetchTranscriptions:', err);
            }
        };

        fetchTranscriptions();

        // Subscribe to real-time changes
        const subscription = supabase
            .channel(`transcription_updates_${meetingId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transcriptions',
                filter: `meeting_id=eq.${meetingId}`
            }, (payload) => {
                console.log("Real-time update received:", payload);
                setTranscriptions(current => [...current, payload.new as Transcription]);

                // If we were saving, we're done now
                setIsSaving(false);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [meetingId, user]);

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
                            const testAccess = recognitionRef.current.continuous;
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

            // Set a longer audio buffer for more stability
            if ('audioContext' in window) {
                // Some browsers support this, which can improve stability
                try {
                    (recognition as any).audioContext = {
                        sampleRate: 16000 // Lower sample rate for better performance
                    };
                } catch (e) {
                    // Ignore if not supported
                    console.log("Advanced audio context settings not supported");
                }
            }

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

        // Configure event handlers
        recognition.onresult = (event: any) => {
            // Update activity timestamp
            lastActivityRef.current = Date.now();

            // Skip if we're explicitly stopping
            if (isStoppingRef.current) return;

            // Process results
            const currentResult = event.results[0];
            const transcript = currentResult[0].transcript;

            if (currentResult.isFinal) {
                // For final results, accumulate text
                accumulatedText.current += ' ' + transcript;
                accumulatedText.current = accumulatedText.current.trim();

                // Update display
                setSessionText(accumulatedText.current);
                setLiveTranscript('');

                // Start new recognition if still recording
                if (recording && !isStoppingRef.current) {
                    // Start next recognition immediately to reduce gaps
                    startNewRecognition();
                }
            } else {
                // For interim results, show in the live display
                setLiveTranscript(transcript);
            }
        };

        // Handle recognition start
        recognition.onstart = () => {
            console.log("Speech recognition started");
            lastActivityRef.current = Date.now();
        };

        // Handle recognition end
        recognition.onend = () => {
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
        };

        // Handle recognition errors with better recovery
        recognition.onerror = (event: any) => {
            console.log('Speech recognition error:', event.error, event);

            switch (event.error) {
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
                    console.log(`Unhandled speech recognition error: ${event.error}`);
                    if (recording && !isStoppingRef.current) {
                        setTimeout(() => startNewRecognition(), 200);
                    }
            }
        };

        // Add audio processing error handling
        recognition.onaudioprocess = (event: any) => {
            // This helps detect when audio is processing
            lastActivityRef.current = Date.now();
        };

        // Extra check for audio flow issues
        recognition.onsoundstart = (event: any) => {
            console.log("Sound detected");
            lastActivityRef.current = Date.now();
        };

        recognition.onsoundend = (event: any) => {
            console.log("Sound ended");
            // Don't update lastActivityRef here, we still want to detect long silences
        };

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
        }

        // Save accumulated text if we have any
        if (accumulatedText.current.trim()) {
            saveTranscription(accumulatedText.current.trim());
        } else {
            setIsSaving(false);
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

    // Function to save transcription to Supabase
    const saveTranscription = async (text: string) => {
        if (!text?.trim() || isSaving || !user) return;

        setIsSaving(true);

        try {
            // First enhance the text via our API
            let enhancedText = text.trim();
            try {
                const response = await fetch('/api/enhance-text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ text: enhancedText }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.enhancedText) {
                        enhancedText = data.enhancedText;
                    }
                }
            } catch (enhanceError) {
                console.warn('Text enhancement failed, using original text:', enhanceError);
                // Continue with original text if enhancement fails
            }

            // Store user ID for Supabase
            localStorage.setItem('clerk-user-id', user.id);

            const transcriptionData = {
                meeting_id: meetingId,
                text: enhancedText,
                confidence: 0.9,
                speaker: user.fullName || 'You'
            };

            console.log("Saving transcription:", transcriptionData);

            const { data, error } = await supabase
                .from('transcriptions')
                .insert(transcriptionData)
                .select();

            if (error) {
                console.error('Error saving transcription:', error);
                setStatusMessage(`Save error: ${error.message || 'Unknown error'}`);
                setIsSaving(false);
            } else {
                console.log("Transcription saved successfully:", data);
                setStatusMessage('Transcription saved successfully.');
                // Real-time subscription will handle updating the UI

                // Clear session text
                setSessionText('');
            }
        } catch (err) {
            console.error('Exception in save operation:', err);
            setStatusMessage('Error saving transcription. Please try again.');
            setIsSaving(false);
        }
    };

    // Group transcriptions by speaker
    const groupedTranscriptions = (): GroupedTranscription[] => {
        if (transcriptions.length === 0) return [];

        // Sort transcriptions by timestamp
        const sorted = [...transcriptions].sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const groups: GroupedTranscription[] = [];
        let currentGroup: GroupedTranscription | null = null;

        sorted.forEach(item => {
            // Start a new group if speaker changes
            if (!currentGroup || currentGroup.speaker !== item.speaker) {
                if (currentGroup) groups.push(currentGroup);

                currentGroup = {
                    speaker: item.speaker,
                    segments: [{
                        id: item.id,
                        text: item.text,
                        timestamp: item.timestamp
                    }]
                };
            } else {
                // Add to existing group
                currentGroup.segments.push({
                    id: item.id,
                    text: item.text,
                    timestamp: item.timestamp
                });
            }
        });

        // Add the last group
        if (currentGroup) groups.push(currentGroup);

        return groups;
    };

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            // Stop recording if active
            isStoppingRef.current = true;

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (error) {
                    console.error("Error stopping recognition on unmount:", error);
                }
            }

            // Clean up timers
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
            }
            if (noActivityTimeoutRef.current) {
                clearTimeout(noActivityTimeoutRef.current);
            }

            // Save any pending text
            if (accumulatedText.current.trim() && !isSaving && !isFinalizingRef.current) {
                saveTranscription(accumulatedText.current.trim());
            }
        };
    }, [isSaving]);

    // Format timestamp for display
    const formatTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });
    };

    // UI feedback based on activity
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    const isActive = timeSinceActivity < 3000;
    const cursorAnimation = isActive ? "animate-pulse" : "animate-[pulse_1.5s_ease-in-out_infinite]";

    // Handle authentication requirement
    if (!user) {
        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                <p className="font-bold">Authentication Required</p>
                <p>Please sign in to access this meeting's transcription.</p>
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

    // Get grouped transcriptions for display
    const groups = groupedTranscriptions();

    return (
        <div className="flex flex-col h-full">
            {/* Transcription Display */}
            <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 mb-4 min-h-[400px]">
                <div className="space-y-6">
                    {groups.length === 0 && !liveTranscript && !sessionText ? (
                        <p className="text-gray-500 text-center italic">No transcriptions yet. Start recording to begin.</p>
                    ) : (
                        <>
                            {/* Grouped Saved Transcriptions */}
                            {groups.map((group, groupIndex) => (
                                <div key={groupIndex} className="flex items-start space-x-2">
                                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                        <span className="text-xs font-medium text-indigo-800">{group.speaker.charAt(0)}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-baseline">
                                            <span className="text-sm font-medium text-gray-900">{group.speaker}</span>
                                            <span className="ml-2 text-xs text-gray-500">
                                                {formatTime(group.segments[0].timestamp)}
                                            </span>
                                        </div>
                                        <div className="text-gray-700 mt-1">
                                            {group.segments.map((segment, i) => (
                                                <span key={segment.id}>
                                                    {segment.text}
                                                    {i < group.segments.length - 1 ? ' ' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}

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
                                                {isSaving && <span className="ml-2 text-xs font-normal text-orange-500">(saving...)</span>}
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
                                    <div className={`flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center ${isActive ? "animate-pulse" : ""}`}>
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
                    disabled={isSaving}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white ${
                        recording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
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