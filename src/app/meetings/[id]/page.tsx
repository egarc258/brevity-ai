// app/meetings/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from './../../lib/supabase';
import TranscriptionComponent from '../../components/TranscriptionComponent';
import ExportDocumentButton from '../../components/ExportDocumentButton';
import { use } from 'react';

// Define a Meeting interface to fix TypeScript errors
interface Meeting {
    id: string;
    name: string;
    user_id: string;
    is_active: boolean;
    created_at: string;
    [key: string]: any; // For any other properties the meeting object might have
}

export default function MeetingPage({ params }: { params: any }) {
    const { user, isLoaded } = useUser();
    const [meeting, setMeeting] = useState<Meeting | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [transcriptions, setTranscriptions] = useState<any[]>([]);
    const [isFetchingTranscriptions, setIsFetchingTranscriptions] = useState(false);
    const router = useRouter();

    // Unwrap params using React.use() for future compatibility
    const paramsUnwrapped = params instanceof Promise ? use(params) : params;
    const meetingId = paramsUnwrapped.id;

    useEffect(() => {
        if (!isLoaded) return;
        if (!user) {
            router.push('/sign-in');
            return;
        }

        const fetchMeeting = async () => {
            try {
                // Fetch meeting details
                const { data, error } = await supabase
                    .from('meetings')
                    .select('*')
                    .eq('id', meetingId)
                    .eq('user_id', user.id)
                    .single();

                if (error) {
                    console.error("Supabase error:", error);
                    throw error;
                }

                if (!data) {
                    throw new Error('Meeting not found or you do not have access');
                }

                setMeeting(data);
            } catch (err: unknown) {
                console.error("Full error:", err);
                const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        };

        fetchMeeting();
    }, [meetingId, router, user, isLoaded]);

    // Fetch all transcriptions for the meeting (needed for export)
    useEffect(() => {
        if (!user || !meetingId) return;

        const fetchAllTranscriptions = async () => {
            setIsFetchingTranscriptions(true);
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
                console.error('Error in fetchAllTranscriptions:', err);
            } finally {
                setIsFetchingTranscriptions(false);
            }
        };

        fetchAllTranscriptions();

        // Subscribe to real-time changes for transcriptions
        const subscription = supabase
            .channel(`transcription_updates_for_export_${meetingId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transcriptions',
                filter: `meeting_id=eq.${meetingId}`
            }, (payload) => {
                // Update the transcriptions array when a new item is added
                setTranscriptions(current => [...current, payload.new]);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [meetingId, user]);

    const handleToggleActive = async () => {
        if (!meeting) return;

        try {
            const { error } = await supabase
                .from('meetings')
                .update({ is_active: !meeting.is_active })
                .eq('id', meetingId)
                .eq('user_id', user?.id);

            if (error) {
                console.error("Update error:", error);
                throw error;
            }

            setMeeting((prev: Meeting | null) => prev ? ({ ...prev, is_active: !prev.is_active }) : null);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
            setError(errorMessage);
        }
    };

    const handleDeleteMeeting = async () => {
        if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('meetings')
                .delete()
                .eq('id', meetingId)
                .eq('user_id', user?.id);

            if (error) {
                console.error("Delete error:", error);
                throw error;
            }

            router.push('/dashboard');
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
            setError(errorMessage);
        }
    };

    if (!isLoaded || loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-white p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                    </div>
                    <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium">
                        &larr; Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (!meeting) {
        return (
            <div className="min-h-screen bg-white p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
                        <p className="font-bold">Meeting not found</p>
                        <p>The meeting you're looking for doesn't exist or you don't have access to it.</p>
                    </div>
                    <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium">
                        &larr; Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-white">
            {/* Header with blue accents */}
            <header className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-5xl mx-auto px-6 py-5 flex justify-between items-center">
                    <div className="flex items-center">
                        <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium mr-4">
                            &larr; Back
                        </Link>
                        <h1 className="text-xl md:text-2xl font-medium text-gray-800">{meeting.name}</h1>
                        <span className={`ml-4 px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                            meeting.is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                            {meeting.is_active ? 'Active' : 'Closed'}
                        </span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-1.5 text-sm font-medium rounded-full ${
                                meeting.is_active
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                            }`}
                        >
                            {meeting.is_active ? 'Close Meeting' : 'Reopen Meeting'}
                        </button>
                        <button
                            onClick={handleDeleteMeeting}
                            className="px-4 py-1.5 text-sm font-medium rounded-full bg-red-100 text-red-700 hover:bg-red-200"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8">
                {/* Meeting details card with blue and white theme */}
                <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h2 className="text-lg font-medium text-gray-800">Meeting Details</h2>

                        <ExportDocumentButton
                            meetingName={meeting.name}
                            transcript={transcriptions.map(t => t.content || '').join('\n')}
                            summary={null}
                            actionItems={null}
                        />
                    </div>

                    <div className="px-6 py-5">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                            <div>
                                <dt className="text-sm font-medium text-blue-600">Created</dt>
                                <dd className="mt-1 text-sm text-gray-800">{formatDate(meeting.created_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-blue-600">Status</dt>
                                <dd className="mt-1 text-sm text-gray-800">
                                    {meeting.is_active ? 'Active (Recording enabled)' : 'Closed (Read-only)'}
                                </dd>
                            </div>
                            <div className="sm:col-span-2">
                                <dt className="text-sm font-medium text-blue-600">Transcription Instructions</dt>
                                <dd className="mt-1 text-sm text-gray-800">
                                    {meeting.is_active
                                        ? 'Click "Start Recording" below to begin capturing audio. Speak clearly for best results.'
                                        : 'This meeting is closed. You can view the transcription but cannot record new content.'}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Transcription section with white and blue theme */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h2 className="text-lg font-medium text-gray-800">Live Transcription</h2>

                        <div className="text-sm text-blue-600">
                            {transcriptions.length > 0
                                ? `${transcriptions.length} message${transcriptions.length === 1 ? '' : 's'}`
                                : 'No messages yet'}
                        </div>
                    </div>

                    <div className="p-6 h-[600px]">
                        <div className="h-full overflow-hidden rounded-lg">
                            <div className="h-full transcription-wrapper">
                                <TranscriptionComponent
                                    onTranscriptUpdate={(transcript: string) => {
                                        console.log("Transcript updated:", transcript);
                                        // Handle transcript updates here if needed
                                    }}
                                    isActive={meeting.is_active}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Updated global styles for the TranscriptionComponent */}
            <style jsx global>{`
                /* Customize the transcription component to match white and blue theme */
                .transcription-wrapper {
                    --text-primary: #1f2937;
                    --text-secondary: #4b5563;
                    --bg-primary: #ffffff;
                    --bg-secondary: #f3f4f6;
                    --border-color: #e5e7eb;
                    --button-blue: #2563eb;
                    --button-red: #dc2626;
                    --button-bg-blue: #dbeafe;
                    --button-bg-red: #fee2e2;
                    color: var(--text-primary);
                }
                
                /* Override TranscriptionComponent styles */
                .transcription-wrapper .bg-white {
                    background-color: var(--bg-primary) !important;
                    border: 1px solid var(--border-color) !important;
                }
                
                .transcription-wrapper .bg-gray-100 {
                    background-color: var(--bg-secondary) !important;
                }
                
                .transcription-wrapper .text-gray-500,
                .transcription-wrapper .text-gray-600 {
                    color: var(--text-secondary) !important;
                }
                
                .transcription-wrapper .text-gray-700,
                .transcription-wrapper .text-gray-900 {
                    color: var(--text-primary) !important;
                }
                
                .transcription-wrapper .bg-green-600 {
                    background-color: var(--button-blue) !important;
                }
                
                .transcription-wrapper .bg-red-600 {
                    background-color: var(--button-red) !important;
                }
                
                .transcription-wrapper .bg-indigo-100 {
                    background-color: var(--bg-secondary) !important;
                }
                
                .transcription-wrapper .text-indigo-800 {
                    color: var(--text-secondary) !important;
                }
                
                .transcription-wrapper .border-indigo-300 {
                    border-color: var(--border-color) !important;
                }
                
                /* Style scrollbars for a modern look */
                .transcription-wrapper ::-webkit-scrollbar {
                    width: 8px;
                }
                
                .transcription-wrapper ::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .transcription-wrapper ::-webkit-scrollbar-thumb {
                    background-color: rgba(37, 99, 235, 0.3);
                    border-radius: 20px;
                }
            `}</style>
        </div>
    );
}