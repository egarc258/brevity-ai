/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Tailwind CSS for now
  images: {
    domains: ['images.clerk.dev'],
  },
  // Disable TypeScript type checking during build for now
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
