// A plain `*.svg` import is SVGR-transformed into a React component; the
// `*.svg?url` variant keeps the legacy URL string import. Wiring lives in
// `next.config.ts` (webpack) and `.storybook/main.ts` (Vite).
declare module '*.svg' {
  import type { ComponentType, SVGProps } from 'react';

  const ReactComponent: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;

  export default ReactComponent;
}

declare module '*.svg?url' {
  const url: string;

  export default url;
}
