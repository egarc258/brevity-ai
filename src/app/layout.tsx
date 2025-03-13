// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
import './basic.css'
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Navbar from './components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'BrevityAI',
    description: 'Real-time transcription for meetings, interviews, and more',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },

        ],

    },
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <ClerkProvider>
            <html lang="en">
            <body className={inter.className}>
            <Navbar />
            {children}
            </body>
            </html>
        </ClerkProvider>
    );
}