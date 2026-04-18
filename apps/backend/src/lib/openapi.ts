import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import addFormatsModule from 'ajv-formats';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { OpenAPIBackend } from 'openapi-backend';

const addFormats = addFormatsModule.default ?? addFormatsModule;

function resolveDefinitionPath() {
  const candidates = [
    resolve(process.cwd(), 'docs/openapi/agentra-bff.openapi.yaml'),
    resolve(process.cwd(), '../docs/openapi/agentra-bff.openapi.yaml'),
    resolve(process.cwd(), '../../docs/openapi/agentra-bff.openapi.yaml'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const definitionPath = resolveDefinitionPath();

const api = definitionPath
  ? new OpenAPIBackend({
      definition: definitionPath,
      customizeAjv: (ajv) => {
        addFormats(ajv, { mode: 'fast', formats: ['date-time', 'uri', 'uuid'] });
        return ajv;
      },
    })
  : null;

const apiReady = api ? api.init() : Promise.resolve();
const jsonBodyCache = new WeakMap<Request, unknown>();

export async function readJsonBody(context: Context) {
  const rawRequest = context.req.raw;
  const cachedBody = jsonBodyCache.get(rawRequest);
  if (cachedBody !== undefined) {
    return cachedBody;
  }

  const contentType = rawRequest.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    jsonBodyCache.set(rawRequest, null);
    return null;
  }

  const payload = await rawRequest
    .clone()
    .json()
    .catch(() => null);

  jsonBodyCache.set(rawRequest, payload);
  return payload;
}

export async function validateRequest(context: Context, operationId: string) {
  await apiReady;
  if (!api) {
    return null;
  }

  const payload = await readJsonBody(context);
  const validation = api.validateRequest(
    {
      method: context.req.method,
      path: context.req.path,
      headers: Object.fromEntries(context.req.raw.headers.entries()),
      query: buildQuery(context.req.url) as { [key: string]: string | string[] },
      ...(payload !== null ? { body: payload } : {}),
    },
    operationId,
  );

  if (validation.errors) {
    return context.json(
      {
        error: 'Request validation failed against OpenAPI contract.',
        details: validation.errors,
      },
      400,
    );
  }

  return null;
}

export async function jsonWithValidation(
  context: Context,
  operationId: string,
  status: ContentfulStatusCode,
  payload: unknown,
) {
  await apiReady;
  if (!api) {
    return context.json(payload, status);
  }

  const validation = api.validateResponse(payload, operationId, status);
  if (validation.errors) {
    console.error('OpenAPI response validation failed.', {
      operationId,
      status,
      errors: validation.errors,
    });

    return context.json(
      {
        error: 'Response validation failed against OpenAPI contract.',
        details: validation.errors,
      },
      502,
    );
  }

  return context.json(payload, status);
}

function buildQuery(url: string) {
  const searchParams = new URL(url).searchParams;
  const query = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    const existing = query.get(key);
    if (existing) {
      existing.push(value);
      continue;
    }

    query.set(key, [value]);
  }

  return Object.fromEntries(
    Array.from(query.entries(), ([key, values]) => [key, values.length === 1 ? values[0] : values]),
  );
}
