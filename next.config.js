/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/', destination: '/crm', permanent: false },
    ]
  },
}

module.exports = nextConfig
