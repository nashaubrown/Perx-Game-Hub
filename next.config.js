/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'www.gutenberg.org' }],
  },
};

module.exports = nextConfig;
