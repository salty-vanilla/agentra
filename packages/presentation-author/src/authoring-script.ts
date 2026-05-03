import { writeFile } from 'node:fs/promises';

const FENCED_CODE_RE = /```(?:javascript|js|node)?\s*\n([\s\S]*?)```/;

const DANGEROUS_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bchild_process\b/, label: 'child_process' },
  { pattern: /\bexec\s*\(/, label: 'exec()' },
  { pattern: /\bspawn\s*\(/, label: 'spawn()' },
  { pattern: /\bfs\.rm\b/, label: 'fs.rm' },
  { pattern: /\bfs\.unlink\b/, label: 'fs.unlink' },
  { pattern: /\bfs\.rmdir\b/, label: 'fs.rmdir' },
  { pattern: /rm\s+-rf\b/, label: 'rm -rf' },
  { pattern: /\bcurl\s+/, label: 'curl' },
  { pattern: /\bwget\s+/, label: 'wget' },
];

export function extractJavaScriptFromLlmOutput(text: string): {
  code: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let code: string;

  const fenced = FENCED_CODE_RE.exec(text);
  if (fenced?.[1]) {
    code = fenced[1].trim();
    const allFences = text.match(/```/g);
    if (allFences && allFences.length > 2) {
      warnings.push('Multiple code fences detected; using first fenced block.');
    }
  } else {
    code = text.trim();
    if (/^#|^\*\*|^>/.test(code)) {
      warnings.push(
        'Response appears to contain markdown/prose; treating entire response as code.',
      );
    }
  }

  if (code.length === 0) {
    warnings.push('Extracted code is empty.');
  }

  return { code, warnings };
}

export function validateAuthoringScript(code: string): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!code.includes('pptxgenjs')) {
    errors.push('Script does not reference pptxgenjs.');
  }
  if (!code.includes('deck.pptx')) {
    errors.push('Script does not reference deck.pptx output filename.');
  }

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(`Script contains forbidden pattern: ${label}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export async function writeAuthoringScript(input: {
  sourceJsPath: string;
  code: string;
}): Promise<void> {
  await writeFile(input.sourceJsPath, input.code, 'utf-8');
}
