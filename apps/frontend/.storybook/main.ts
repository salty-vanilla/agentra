import type { StorybookConfig } from '@storybook/nextjs-vite';
import type { Plugin } from 'vite';
import svgr from 'vite-plugin-svgr';

/**
 * Stop Storybook's bundled next-image emulation
 * (`vite-plugin-storybook-nextjs-image`) from claiming `*.svg` imports so that
 * vite-plugin-svgr (component) and Vite's default asset handling (`?url`) can
 * take them instead — matching the webpack SVGR rule in `next.config.ts`.
 *
 * The image plugin auto-defers SVG only when it detects vite-plugin-svgr in the
 * resolved config, but that detection misses the instance we inject via
 * `viteFinal`. It also strips the resource query during path-alias resolution,
 * so a `@/app/icon.svg` import reaches the plugin as a bare `.svg` and gets read
 * as a static image (the BrandMark stories then fail with React error #130).
 * Wrapping `resolveId` to defer every `.svg` is the robust fix.
 */
function deferSvgToSvgr(plugins: unknown[]): void {
  for (const plugin of plugins.flat(Number.POSITIVE_INFINITY)) {
    if (
      !plugin ||
      typeof plugin !== 'object' ||
      (plugin as Plugin).name !== 'vite-plugin-storybook-nextjs-image'
    ) {
      continue;
    }
    const imagePlugin = plugin as Plugin;
    const originalResolveId = imagePlugin.resolveId;
    if (typeof originalResolveId !== 'function') {
      continue;
    }
    imagePlugin.resolveId = function resolveId(this: unknown, id, importer, options) {
      const [path] = id.split('?');
      if (path.endsWith('.svg')) {
        return null;
      }
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the original Rollup hook
      return (originalResolveId as any).call(this, id, importer, options);
    };
  }
}

const config: StorybookConfig = {
  stories: [
    '../components/**/*.stories.@(ts|tsx|mdx)',
    '../features/**/*.stories.@(ts|tsx|mdx)',
    '../app/**/*.stories.@(ts|tsx|mdx)',
    '../lib/**/*.stories.@(ts|tsx|mdx)',
    '../hooks/**/*.stories.@(ts|tsx|mdx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    'msw-storybook-addon',
  ],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  // The Vite builder does not see next.config.ts's webpack SVGR rule, so wire
  // vite-plugin-svgr up here too: every `*.svg` except `?url` becomes a React
  // component, mirroring the webpack side. `deferSvgToSvgr` keeps Storybook's
  // next-image emulation from intercepting those imports first.
  viteFinal: async (config) => {
    config.plugins ??= [];
    config.plugins.unshift(svgr({ include: '**/*.svg', exclude: '**/*.svg?url' }));
    deferSvgToSvgr(config.plugins);
    return config;
  },
  staticDirs: ['../public'],
};

export default config;
