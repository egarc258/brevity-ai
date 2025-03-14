// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Ensure these environment variables are set in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Ensure proper types for Meeting
export type Meeting = {
    id: string;
    name: string;
    created_at: string;
    user_id: string;
    is_active: boolean;
};

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
    global: {
        headers: {
            'x-clerk-user-id': typeof localStorage !== 'undefined' ? localStorage.getItem('clerk-user-id') || '' : '',
        },
    },
});

// Test Supabase connection
export const testSupabaseConnection = async () => {
    try {
        // A simple query that should work if the connection is valid
        const { data, error } = await supabase.from('meetings').select('count', { count: 'exact', head: true });

        if (error) {
            return { success: false, error };
        }

        return { success: true, data };
    } catch (error) {
        return { success: false, error };
    }
};