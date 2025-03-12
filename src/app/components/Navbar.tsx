// app/components/Navbar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';

export default function Navbar() {
    const { user, isLoaded } = useUser();
    const pathname = usePathname();

    // Don't show navbar on auth pages or landing page
    if (
        pathname === '/' ||
        pathname?.startsWith('/sign-in') ||
        pathname?.startsWith('/sign-up')
    ) {
        return null;
    }

    return (
        <header className="bg-[#314F9A] border-b border-[#314F9A] shadow-sm">
            <div className="max-w-5xl mx-auto px-6">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <Link href="/dashboard" className="flex-shrink-0 flex items-center">
                            <span className="text-xl font-medium text-white">BrevityAI</span>
                        </Link>
                        <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                            <Link
                                href="/dashboard"
                                className={`${
                                    pathname === '/dashboard'
                                        ? 'border-[#0056b3] text-white'
                                        : 'border-transparent text-white hover:border-[#b3d9ff] hover:text-[#003d82]'
                                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                            >
                                Dashboard
                            </Link>
                        </div>
                    </div>
                    {isLoaded && user && (
                        <div className="flex items-center">
                            <div className="mr-3 text-sm text-[#e6f2ff]">
                                {user.emailAddresses[0].emailAddress}
                            </div>
                            <UserButton afterSignOutUrl="/" />
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}