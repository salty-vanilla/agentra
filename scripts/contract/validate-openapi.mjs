import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const openApiUrl = new URL(
  '../../docs/openapi/agentra-bff.openapi.yaml',
  import.meta.url,
);
const openApiPath = fileURLToPath(openApiUrl);

await SwaggerParser.validate(openApiPath);

console.log(`OpenAPI contract is valid: ${openApiPath}`);
