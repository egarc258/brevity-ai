'use client';

import React, { useState, useEffect, useRef } from 'react';

// Define proper TypeScript interfaces for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

// This component handles voice transcription
const TranscriptionComponent: React.FC<{
    onTranscriptUpdate: (transcript: string) => void;
    isActive: boolean;
}> = ({ onTranscriptUpdate, isActive }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const lastActivityRef = useRef<number>(Date.now());
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Check if SpeechRecognition is available
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setError('Speech recognition is not supported in your browser. Try Chrome or Edge.');
            return;
        }

        // Clear any existing recognition instance
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        // Initialize speech recognition using our type assertion from above
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // Store recognition instance in ref
        recognitionRef.current = recognition;

        // Set up event listeners using addEventListener instead of on* properties
        recognition.addEventListener('start', (event: Event) => {
            console.log("Speech recognition started");
            lastActivityRef.current = Date.now();
        });

        recognition.addEventListener('result', (event: Event) => {
            const speechEvent = event as unknown as SpeechRecognitionEvent;
            console.log("Speech recognition result received");
            lastActivityRef.current = Date.now();

            let currentTranscript = '';
            for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
                if (speechEvent.results[i].isFinal) {
                    currentTranscript += speechEvent.results[i][0].transcript + ' ';
                }
            }

            if (currentTranscript) {
                setTranscript(prev => {
                    const newTranscript = prev + currentTranscript;
                    onTranscriptUpdate(newTranscript);
                    return newTranscript;
                });
            }
        });

        recognition.addEventListener('end', (event: Event) => {
            console.log("Speech recognition ended");

            // Only restart if we're still supposed to be listening
            if (isListening) {
                console.log("Restarting speech recognition");
                recognition.start();
            } else {
                setIsListening(false);
            }
        });

        recognition.addEventListener('error', (event: Event) => {
            const errorEvent = event as unknown as { error: string };
            console.error("Speech recognition error", errorEvent.error);
            setError(`Speech recognition error: ${errorEvent.error}`);

            if (isListening) {
                // Try to restart after an error
                setTimeout(() => {
                    if (recognitionRef.current && isListening) {
                        try {
                            recognitionRef.current.start();
                        } catch (e) {
                            console.error("Failed to restart after error", e);
                        }
                    }
                }, 1000);
            }
        });

        // Start/stop recognition based on isListening state
        if (isListening && isActive) {
            try {
                recognition.start();
                console.log("Started speech recognition");
            } catch (err) {
                console.error("Error starting recognition", err);
                setError('Failed to start speech recognition. Please refresh and try again.');
            }
        }

        // Cleanup function
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                    console.log("Stopped speech recognition on cleanup");
                } catch (err) {
                    console.error("Error stopping recognition during cleanup", err);
                }
            }

            // Clear activity timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [isListening, isActive, onTranscriptUpdate]);

    // Set up inactivity detection
    useEffect(() => {
        if (!isListening) return;

        const checkActivity = () => {
            const now = Date.now();
            const timeSinceLastActivity = now - lastActivityRef.current;

            // If inactive for more than 5 seconds, try restarting
            if (timeSinceLastActivity > 5000 && isListening && recognitionRef.current) {
                console.log(`No activity for ${timeSinceLastActivity}ms, restarting recognition`);

                try {
                    // Try to stop and restart
                    recognitionRef.current.stop();
                    setTimeout(() => {
                        if (recognitionRef.current && isListening) {
                            recognitionRef.current.start();
                        }
                    }, 500);

                    lastActivityRef.current = now;
                } catch (err) {
                    console.error("Error while trying to restart on inactivity", err);
                }
            }

            // Check again in 2 seconds
            timeoutRef.current = setTimeout(checkActivity, 2000);
        };

        timeoutRef.current = setTimeout(checkActivity, 2000);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [isListening]);

    // Stop listening when meeting becomes inactive
    useEffect(() => {
        if (!isActive && isListening) {
            setIsListening(false);
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (err) {
                    console.error("Error stopping recognition when meeting became inactive", err);
                }
            }
        }
    }, [isActive, isListening]);

    const toggleListening = () => {
        setIsListening(!isListening);
        setError(null);
    };

    return (
        <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-2">
                <button
                    onClick={toggleListening}
                    disabled={!isActive}
                    className={`flex items-center justify-center px-4 py-2 rounded-full transition-colors ${
                        isListening
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-[#0056b3] hover:bg-[#003d82] text-white'
                    } ${!isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isListening ? (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                            </svg>
                            Stop Recording
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            Start Recording
                        </>
                    )}
                </button>

                {isListening && (
                    <div className="flex items-center text-green-600">
                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        <span className="text-sm">Recording...</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm">
                    {error}
                </div>
            )}

            {!isListening && transcript && (
                <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm">
                    <p className="font-medium">Recording paused</p>
                    <p className="text-xs mt-1">Click &quot;Start Recording&quot; to continue capturing speech.</p>
                </div>
            )}
        </div>
    );
};

export default TranscriptionComponent;

// Use type assertion instead of declaration to avoid conflicts
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;