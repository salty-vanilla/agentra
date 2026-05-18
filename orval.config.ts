import { defineConfig } from 'orval';

export default defineConfig({
  agentraClient: {
    input: {
      target: './docs/openapi/agentra-bff.openapi.yaml',
    },
    output: {
      target: './apps/frontend/lib/generated/agentra.ts',
      schemas: './apps/frontend/lib/generated/model',
      client: 'fetch',
      mode: 'single',
      clean: true,
      baseUrl: {
        runtime: "process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787'",
      },
      override: {
        mutator: {
          path: './apps/frontend/lib/api-error.ts',
          name: 'fetchMutator',
        },
        operations: {
          // /chat lives on the Streaming API, not the REST API base used by
          // every other route. Route postChat through a dedicated mutator so
          // the generated client targets the correct backend.
          postChat: {
            mutator: {
              path: './apps/frontend/lib/api-error.ts',
              name: 'chatFetchMutator',
            },
          },
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
  agentraMock: {
    input: {
      target: './docs/openapi/agentra-bff.openapi.yaml',
    },
    output: {
      target: './apps/frontend/mocks/generated/agentra.msw.ts',
      schemas: './apps/frontend/mocks/generated/model',
      client: 'fetch',
      mode: 'single',
      clean: true,
      mock: {
        type: 'msw',
        delay: 200,
      },
    },
  },
  agentraSharedZod: {
    input: {
      target: './docs/openapi/agentra-bff.openapi.yaml',
    },
    output: {
      target: './packages/shared/src/generated/openapi-zod.ts',
      client: 'zod',
      mode: 'single',
      clean: true,
    },
  },
});
