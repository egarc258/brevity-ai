// app/components/TranscriptionComponent.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useParams } from 'next/navigation';
import { supabase, Transcription } from './../lib/supabase';

interface TranscriptionComponentProps {
    onTranscriptUpdate: (transcript: string) => void;
    isActive: boolean;
    meetingId?: string; // Add meetingId as a prop
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

export default function TranscriptionComponent({
                                                   onTranscriptUpdate,
                                                   isActive,
                                                   meetingId: propMeetingId // Accept meetingId as a prop
                                               }: TranscriptionComponentProps) {
    const { user } = useUser();
    const params = useParams();
    // Use meetingId from props or fallback to URL params
    const meetingId = propMeetingId || (params?.id as string);

    const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
    const [recording, setRecording] = useState(false);
    const [recognitionSupported, setRecognitionSupported] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [liveTranscript, setLiveTranscript] = useState<string>('');
    const [sessionText, setSessionText] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [heartbeat, setHeartbeat] = useState(0);

    // Add a state to display the combined text (accumulated + live) for continuous visibility
    const [displayedText, setDisplayedText] = useState<string>('');

    // Add this flag to prevent duplicate transcriptions
    const isTranscriptionSaved = useRef(false);

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

    // Load existing transcriptions when component mounts
    useEffect(() => {
        if (!user || !meetingId) return;

        const fetchTranscriptions = async () => {
            try {
                // Using transcriptions_new table
                const { data, error } = await supabase
                    .from('transcriptions_new')  // Use the new table
                    .select('*')
                    .eq('meeting_id', meetingId)
                    .order('timestamp', { ascending: true });

                if (error) {
                    console.error('Error fetching transcriptions:', error);
                    return;
                }

                if (data && data.length > 0) {
                    setTranscriptions(data);

                    // Combine all transcriptions for display
                    const fullText = data.map(t => t.text).join(' ');
                    setSessionText(fullText);
                    setDisplayedText(''); // Reset displayed text when loading from DB
                    onTranscriptUpdate(fullText);
                }
            } catch (err) {
                console.error('Error in fetchTranscriptions:', err);
            }
        };

        fetchTranscriptions();

        // Set up real-time listener for new transcriptions
        const subscription = supabase
            .channel(`transcription_updates_${meetingId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transcriptions_new',  // Changed from 'transcriptions'
                filter: `meeting_id=eq.${meetingId}`
            }, (payload) => {
                // Clear displayed text when new transcription arrives from database
                // This prevents duplication
                setDisplayedText('');

                setTranscriptions(current => [...current, payload.new as Transcription]);

                // Update session text with new transcription
                setSessionText(prev => {
                    const updatedText = `${prev} ${(payload.new as Transcription).text}`.trim();
                    onTranscriptUpdate(updatedText);
                    return updatedText;
                });

                // Reset the accumulatedText ref to prevent duplication
                accumulatedText.current = '';

                // Also reset the isTranscriptionSaved flag
                isTranscriptionSaved.current = false;
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [meetingId, user, onTranscriptUpdate]);

    // Auto-scroll to bottom when new transcriptions arrive or when live transcript changes
    useEffect(() => {
        if (transcriptionEndRef.current) {
            transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [transcriptions, displayedText, heartbeat]);

    // Update displayed text whenever accumulated text or live transcript changes
    useEffect(() => {
        // Only display the live text if we're currently recording
        if (recording) {
            // Combine accumulated text with live transcript for continuous display
            const combinedText = `${accumulatedText.current} ${liveTranscript}`.trim();
            if (combinedText) {
                setDisplayedText(combinedText);
            }
        } else if (!recording && !transcriptions.length) {
            // If not recording and no transcriptions from DB, show the accumulated text
            setDisplayedText(accumulatedText.current);
        }
    }, [liveTranscript, recording, transcriptions.length]);

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

                // Clear live transcript since it's now in accumulated text
                setLiveTranscript('');

                // But make sure to update displayed text with accumulated text
                setDisplayedText(accumulatedText.current);

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

                // Also update the combined displayed text
                setDisplayedText(`${accumulatedText.current} ${transcript}`.trim());
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
    const finalizeRecording = async () => {
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
            setDisplayedText(accumulatedText.current);

            // Update parent component
            onTranscriptUpdate(accumulatedText.current);
        }

        // Get the final text to save
        const finalText = accumulatedText.current.trim();

        // Only save if we have actual content and a meeting ID AND we haven't already saved this session
        if (finalText && meetingId && user && !isTranscriptionSaved.current) {
            setIsSaving(true);
            // Mark as saved to prevent duplication
            isTranscriptionSaved.current = true;

            try {
                // Store the Clerk user ID in localStorage for Supabase headers
                if (typeof window !== 'undefined' && user.id) {
                    localStorage.setItem('clerk-user-id', user.id);
                }

                console.log("Attempting to save transcription with:", {
                    meeting_id: meetingId,
                    user_id: user.id,
                    text_length: finalText.length,
                    timestamp: new Date().toISOString(),
                    speaker: user.fullName || 'Unknown'
                });

                // IMPORTANT: Using transcriptions_new table for testing
                const { data, error } = await supabase
                    .from('transcriptions_new')  // Use the new table
                    .insert({
                        meeting_id: meetingId,
                        user_id: user.id,
                        text: finalText,
                        timestamp: new Date().toISOString(),
                        speaker: user.fullName || 'Unknown'
                    });

                if (error) {
                    console.error("Error saving transcription:", error);

                    // More detailed error logging
                    if (error.code) console.error("Error code:", error.code);
                    if (error.message) console.error("Error message:", error.message);
                    if (error.details) console.error("Error details:", error.details);
                    if (error.hint) console.error("Error hint:", error.hint);

                    setStatusMessage(`Error saving: ${error.message || 'Database error'}`);

                    // Reset the flag so we can try again
                    isTranscriptionSaved.current = false;
                } else {
                    console.log("Transcription saved successfully", data);
                    setStatusMessage('Recording stopped and saved.');

                    // Important: Clear displayed text now so it doesn't duplicate
                    // when the subscription event adds it
                    setDisplayedText('');

                    // Since the database insert will trigger a subscription event,
                    // we don't need to manually add the transcription to the local state
                }
            } catch (err) {
                // Log the full error object for debugging
                console.error("Exception saving transcription:", err);
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                setStatusMessage(`Failed to save: ${errorMessage}`);

                // Reset the flag so we can try again
                isTranscriptionSaved.current = false;
            } finally {
                setIsSaving(false);
            }
        } else {
            // Log why we're not saving
            if (!finalText) console.log("Not saving: No text to save");
            if (!meetingId) console.log("Not saving: No meeting ID available");
            if (!user) console.log("Not saving: No user available");
            if (isTranscriptionSaved.current) console.log("Not saving: Already saved this transcription");
        }

        // Reset state
        setRecording(false);
        setLiveTranscript('');
        if (!finalText) {
            setStatusMessage('Recording stopped. No content to save.');
        }
        isStoppingRef.current = false;

        // Clear resources only after saving
        setTimeout(() => {
            // Only clear accumulated text if the save was successful
            if (isTranscriptionSaved.current) {
                accumulatedText.current = '';
            }
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
                setDisplayedText(newText);
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

            // Reset saved state flag for new recording session
            isTranscriptionSaved.current = false;

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
                    setDisplayedText('');
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

    // Group transcriptions by speaker for display
    const groupedTranscriptions = transcriptions.reduce((acc: GroupedTranscription[], curr) => {
        // Check if we already have a group for this speaker
        const existingGroup = acc.find(group => group.speaker === curr.speaker);

        if (existingGroup) {
            // Add to existing group
            existingGroup.segments.push({
                id: curr.id,
                text: curr.text,
                timestamp: curr.timestamp
            });
        } else {
            // Create new group
            acc.push({
                speaker: curr.speaker,
                segments: [{
                    id: curr.id,
                    text: curr.text,
                    timestamp: curr.timestamp
                }]
            });
        }

        return acc;
    }, []);

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
                    {/* Display saved transcriptions */}
                    {groupedTranscriptions.length > 0 ? (
                        groupedTranscriptions.map((group, groupIndex) => (
                            <div key={`group-${groupIndex}`} className="flex items-start space-x-2">
                                <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-medium text-indigo-800">{group.speaker.charAt(0)}</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline">
                                        <span className="text-sm font-medium text-gray-900">{group.speaker}</span>
                                        <span className="ml-2 text-xs text-gray-500">
                                            {new Date(group.segments[0].timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {group.segments.map((segment, segmentIndex) => (
                                        <p key={`segment-${segmentIndex}`} className="text-gray-700 mt-1">
                                            {segment.text}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : !displayedText ? (
                        <p className="text-gray-500 text-center italic">No transcriptions yet. Start recording to begin.</p>
                    ) : null}

                    {/* Live Transcription (only show if we have live text and are recording,
                         or if we have displayedText but no saved transcriptions) */}
                    {(recording || (displayedText && transcriptions.length === 0)) && (
                        <div className="flex items-start space-x-2">
                            <div className={`flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center ${isActiveNow ? "animate-pulse" : ""}`}>
                                <span className="text-xs font-medium text-indigo-800">{user?.fullName?.charAt(0) || 'Y'}</span>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-baseline">
                                    <span className="text-sm font-medium text-gray-900">
                                        {user?.fullName || 'You'}
                                        <span className="ml-2 text-xs font-normal text-indigo-500">{recording ? "(live)" : ""}</span>
                                    </span>
                                    <span className="ml-2 text-xs text-gray-500">{new Date().toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="text-gray-700 border-l-2 border-indigo-300 pl-2 mt-1">
                                    {displayedText || (recording ? "Listening..." : "")}
                                    {recording && <span className={`ml-1 ${cursorAnimation}`}>|</span>}
                                </p>
                            </div>
                        </div>
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