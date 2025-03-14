// app/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, testSupabaseConnection } from '../lib/supabase'; // Fixed path
import type { Meeting } from '../lib/supabase';

export default function Dashboard() {
    const { user, isLoaded } = useUser();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [newMeetingName, setNewMeetingName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
    const router = useRouter();

    // Store the Clerk user ID in localStorage for Supabase RLS
    useEffect(() => {
        if (user) {
            localStorage.setItem('clerk-user-id', user.id);
            console.log("Set clerk-user-id in localStorage:", user.id);
        }
    }, [user]);

    // Test Supabase connection
    useEffect(() => {
        const testConnection = async () => {
            try {
                const result = await testSupabaseConnection();
                console.log("Connection test result:", result);
                if (result.success) {
                    // Don't show success message
                    setConnectionStatus(null);
                } else {
                    setConnectionStatus(`Connection issue: ${JSON.stringify(result.error)}`);
                }
            } catch (err) {
                console.error("Connection test error:", err);
                setConnectionStatus("Failed to test connection");
            }
        };

        testConnection();
    }, []);

    // Rest of your component code remains the same

    // Fetch meetings
    useEffect(() => {
        if (!isLoaded || !user) return;

        const fetchMeetings = async () => {
            try {
                console.log("Fetching meetings for user:", user.id);
                console.log("Headers being sent:", {
                    'x-clerk-user-id': localStorage.getItem('clerk-user-id')
                });

                const { data, error } = await supabase
                    .from('meetings')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Supabase fetch error:", error);
                    console.error("Error details:", JSON.stringify(error, null, 2));
                    throw error;
                }

                console.log("Meetings fetched:", data?.length || 0);
                setMeetings(data || []);
            } catch (err: unknown) {
                console.error("Full fetch error:", err);
                let errorMessage = 'An unknown error occurred';

                if (err instanceof Error) {
                    errorMessage = err.message;
                } else if (typeof err === 'object' && err !== null) {
                    errorMessage = JSON.stringify(err);
                }

                setError(`Failed to fetch meetings: ${errorMessage}`);
            } finally {
                setLoading(false);
            }
        };

        fetchMeetings();
    }, [isLoaded, user]);

    const handleCreateMeeting = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) return;

        setIsCreating(true);
        setError(null);

        try {
            console.log("Creating meeting with user ID:", user.id);
            console.log("Clerk user ID in localStorage:", localStorage.getItem('clerk-user-id'));

            // Insert the meeting
            const { data, error } = await supabase
                .from('meetings')
                .insert({
                    name: newMeetingName,
                    user_id: user.id
                })
                .select()
                .single();

            if (error) {
                console.error("Supabase error details:", JSON.stringify(error, null, 2));
                throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
            }

            console.log("Meeting created:", data);

            // Clear form
            setNewMeetingName('');

            // Redirect to the newly created meeting
            router.push(`/meetings/${data.id}`);
        } catch (err: unknown) {
            console.error("Full error:", err);
            let errorMessage = 'An unknown error occurred';

            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'object' && err !== null) {
                errorMessage = JSON.stringify(err);
            }

            setError(`Failed to create meeting: ${errorMessage}`);
            setIsCreating(false);
        }
    };

    const handleDeleteMeeting = async (meetingId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) return;

        setIsDeleting(meetingId);
        setError(null);

        try {
            console.log("Deleting meeting:", meetingId);

            const { error } = await supabase
                .from('meetings')
                .delete()
                .eq('id', meetingId)
                .eq('user_id', user.id); // Extra security check

            if (error) {
                console.error("Supabase delete error:", error);
                throw new Error(`Supabase error: ${error.message || JSON.stringify(error)}`);
            }

            console.log("Meeting deleted successfully");

            // Update the meetings list by filtering out the deleted meeting
            setMeetings(meetings.filter(meeting => meeting.id !== meetingId));

        } catch (err: unknown) {
            console.error("Delete error:", err);
            let errorMessage = 'An unknown error occurred';

            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'object' && err !== null) {
                errorMessage = JSON.stringify(err);
            }

            setError(`Failed to delete meeting: ${errorMessage}`);
        } finally {
            setIsDeleting(null);
        }
    };

    if (!isLoaded) {
        return (
            <div className="flex justify-center items-center h-screen bg-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0056b3]"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-white">
                <p className="text-lg mb-4 text-[#2c3e50]">Please sign in to access your dashboard</p>
                <Link
                    href="/sign-in"
                    className="px-4 py-2 bg-[#0056b3] text-white rounded-full hover:bg-[#003d82] transition-colors"
                >
                    Sign In
                </Link>
            </div>
        );
    }

    // Get the user's first name or full name
    const userName = user.firstName || user.fullName || user.username || 'User';

    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white border-b border-[#e6f2ff] shadow-sm">
                <div className="max-w-5xl mx-auto px-6 py-5">
                    <h1 className="text-2xl font-medium text-[#131F3D]">{userName}'s Meetings</h1>
                </div>
            </header>
            <main className="max-w-5xl mx-auto px-6 py-8">
                {connectionStatus && (
                    <div className="mb-6 p-4 rounded-lg bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]">
                        <p>{connectionStatus}</p>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]">
                        <p>{error}</p>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-[#e6f2ff] overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-[#e6f2ff]">
                        <h2 className="text-lg font-medium text-[#131F3D]">Create New Meeting</h2>
                    </div>

                    <div className="px-6 py-5">
                        <form onSubmit={handleCreateMeeting} className="space-y-4">
                            <div>
                                <label htmlFor="meeting-name" className="block text-sm font-medium text-[#2c3e50]">
                                    Meeting Name
                                </label>
                                <input
                                    type="text"
                                    id="meeting-name"
                                    value={newMeetingName}
                                    onChange={(e) => setNewMeetingName(e.target.value)}
                                    required
                                    className="mt-1 block w-full rounded-lg border-[#e6f2ff] bg-white shadow-sm focus:border-[#0056b3] focus:ring-[#0056b3] sm:text-sm p-2.5 border text-[#2c3e50]"
                                    placeholder="Weekly Team Standup"
                                />
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={isCreating || !newMeetingName.trim()}
                                    className={`rounded-full border border-transparent py-2 px-5 text-sm font-medium text-white shadow-sm transition-colors
                                        ${isCreating || !newMeetingName.trim()
                                        ? 'bg-[#b3d9ff] cursor-not-allowed'
                                        : 'bg-[#0056b3] hover:bg-[#003d82]'}`}
                                >
                                    {isCreating ? 'Creating...' : 'Create Meeting'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-[#e6f2ff] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#e6f2ff]">
                        <h2 className="text-lg font-medium text-[#131F3D]">{userName}'s Meetings</h2>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-[#2c3e50]">
                            <div
                                className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#0056b3] mb-2"></div>
                            <p>Loading meetings...</p>
                        </div>
                    ) : meetings.length === 0 ? (
                        <div className="text-center py-10 px-6">
                            <p className="text-[#2c3e50] mb-4">You don't have any meetings yet.</p>
                            <div
                                className="w-16 h-16 mx-auto border-2 border-[#e6f2ff] rounded-full flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                     strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-[#0056b3]">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                </svg>
                            </div>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#e6f2ff]">
                            {meetings.map((meeting) => (
                                <li key={meeting.id} className="relative">
                                    <Link href={`/meetings/${meeting.id}`}>
                                        <div className="block hover:bg-[#f0f7ff] transition-colors px-6 py-4">
                                            <div className="flex items-center justify-between">
                                                <p className="text-base font-medium text-[#2c3e50]">{meeting.name}</p>
                                                <div className="ml-2 flex-shrink-0 flex items-center space-x-2">
                                                    <p className={`px-3 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                                                        meeting.is_active ? 'bg-[#e6f0e9] text-[#0f5132]' : 'bg-[#e6f2ff] text-[#2c3e50]'
                                                    }`}>
                                                        {meeting.is_active ? 'Active' : 'Closed'}
                                                    </p>
                                                    <button
                                                        onClick={(e) => handleDeleteMeeting(meeting.id, e)}
                                                        disabled={isDeleting === meeting.id}
                                                        className="p-1.5 text-[#dc3545] hover:text-[#bd2130] transition-colors rounded-full hover:bg-[#fdf0f2] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#dc3545]"
                                                        aria-label={`Delete ${meeting.name}`}
                                                    >
                                                        {isDeleting === meeting.id ? (
                                                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-[#dc3545] border-t-transparent"></div>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-2">
                                                <p className="flex items-center text-sm text-[#2c3e50]">
                                                    Created
                                                    on {new Date(meeting.created_at).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </main>
        </div>
    );
}