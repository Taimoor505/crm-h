import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// PWA service worker (app/sw.ts → public/sw.js). Registered by components/providers/PwaRegister
// only when API mocks are off, because MSW needs the same scope.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  register: false,
  disable: process.env.NODE_ENV === 'development',
});

const hasDb = Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    // Lets the frontend pick its API mock mode (mocks/mode.ts) without exposing the URL.
    NEXT_PUBLIC_HAS_DB: hasDb ? 'true' : 'false',
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // Test artifacts written during e2e runs must not trigger dev recompiles/reloads.
    if (dev) {
      const prev = config.watchOptions?.ignored;
      const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [...list.filter((x: unknown) => typeof x === 'string' && x.length > 0), '**/node_modules/**', '**/.git/**', '**/test-results/**', '**/playwright-report/**'],
      };
    }
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default withSerwist(withNextIntl(nextConfig));
