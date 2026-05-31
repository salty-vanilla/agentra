import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  transpilePackages: ['@agentra/shared'],
  webpack(config) {
    // Locate the existing rule that Next.js uses for static assets (incl. SVG).
    const fileLoaderRule = config.module.rules.find(
      (
        rule: unknown,
      ): rule is {
        exclude?: RegExp;
        issuer?: unknown;
        test: RegExp;
      } =>
        typeof rule === 'object' &&
        rule !== null &&
        'test' in rule &&
        rule.test instanceof RegExp &&
        rule.test.test('.svg'),
    );

    if (!fileLoaderRule || typeof fileLoaderRule !== 'object') {
      return config;
    }

    config.module.rules.push(
      // `*.svg?url` keeps the legacy URL import behaviour.
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/,
      },
      // Everything else imports the SVG as a React component via SVGR.
      // `__next_metadata__` is excluded so Next.js can still treat
      // `app/icon.svg` as a favicon via its metadata image loader.
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [/url/, /__next_metadata__/] },
        use: ['@svgr/webpack'],
      },
    );

    // Stop the default file loader from also handling `.svg`.
    fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },
};

export default nextConfig;
