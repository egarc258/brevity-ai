// app/page.tsx
import Link from 'next/link';
import Image from 'next/image';

export default function LandingPage() {
    return (
        <div className="bg-white min-h-screen flex flex-col font-sans">
            <div className="relative isolate px-6 lg:px-8 flex-grow">
                {/* Subtle texture overlays */}
                <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
                    <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#e6f2ff] to-[#b3d9ff] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"></div>
                </div>

                <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-3 sm:gap-4">
                            <h1 className="text-6xl sm:text-7xl md:text-8xl font-medium tracking-tight" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                                <span className="text-[#203568]">BrevityAI</span>
                            </h1>
                            {/* Sound wave icon from public folder */}
                            <Image
                                src="/soundwave-icon.svg"
                                alt="Sound wave"
                                width={90}  // Increased to 90
                                height={90} // Increased to 90
                                className="h-16 w-16 sm:h-20 sm:w-20 md:h-32 md:w-32" // Larger sizes
                            />
                        </div>
                        <p className="mt-6 text-lg leading-8 text-[#2c3e50]">
                            Transform your meetings, interviews, and lectures with our powerful real-time transcription tool.
                            Never miss a word again.
                        </p>
                        <div className="mt-10 flex items-center justify-center gap-x-6">
                            <Link
                                href="/sign-up"
                                className="rounded-full bg-[#0056b3] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#003d82] transition-colors"
                            >
                                Get started
                            </Link>
                            <Link href="/sign-in" className="text-sm font-medium leading-6 text-[#0056b3] hover:text-[#003d82] transition-colors">
                                Sign in <span aria-hidden="true">→</span>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-6 lg:px-8 pb-24">
                    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                        <div className="p-6 bg-white rounded-xl shadow-sm border border-[#e6f2ff]">
                            <div className="h-12 w-12 rounded-full bg-[#e6f2ff] flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#007bff]">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-medium text-[#0056b3] mb-2">Real-Time Transcription</h2>
                            <p className="text-[#2c3e50]">Our advanced speech recognition technology transcribes conversations as they happen with high accuracy.</p>
                        </div>

                        <div className="p-6 bg-white rounded-xl shadow-sm border border-[#e6f2ff]">
                            <div className="h-12 w-12 rounded-full bg-[#e6f2ff] flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#007bff]">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-medium text-[#0056b3] mb-2">Searchable Archives</h2>
                            <p className="text-[#2c3e50]">All your transcriptions are automatically saved and searchable, making it easy to find important information later.</p>
                        </div>

                        <div className="p-6 bg-white rounded-xl shadow-sm border border-[#e6f2ff]">
                            <div className="h-12 w-12 rounded-full bg-[#e6f2ff] flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#007bff]">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-medium text-[#0056b3] mb-2">Easy Collaboration</h2>
                            <p className="text-[#2c3e50]">Share meeting transcripts with team members to ensure everyone stays on the same page, even if they couldn't attend.</p>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="bg-[#f8f9fa] border-t border-[#e6f2ff]">
                <div className="max-w-5xl mx-auto px-6 py-8">
                    <div className="text-center">
                        <span className="text-[#2c3e50]">© 2025 BrevityAI. All rights reserved.</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}