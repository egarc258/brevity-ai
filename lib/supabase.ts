// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a single supabase client for browser-side usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
    global: {
        headers: {
            // We're not using Supabase Auth, so we provide a custom header
            // This will be used in your RLS policies
            'x-clerk-user-id': typeof window !== 'undefined' ?
                localStorage.getItem('clerk-user-id') || '' : '',
        },
    },
});

// Types for our database tables
export type Meeting = {
    id: string;
    name: string;
    created_at: string;
    user_id: string;
    is_active: boolean;
};

export type Transcription = {
    id: string;
    meeting_id: string;
    text: string;
    timestamp: string;
    speaker: string;
    confidence?: number;
};