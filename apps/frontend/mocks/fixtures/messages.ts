export const messageFixtures = {
  shortText: 'How can I help you today?',
  longMarkdown: `# Analysis Result

## Key Findings

- Finding one: performance improvements in the rendering pipeline
- Finding two: memory usage reduced by extracting shared utilities
- Finding three: test coverage increased to 82%

## Recommendations

Consider adopting the new component patterns to align with the Storybook-driven approach. This will improve testability and reduce runtime dependencies.

## Summary

The overall assessment shows three areas of improvement that can be addressed incrementally without disrupting production behavior.`,
  codeBlockLang: 'typescript',
  codeBlockCode: `const greet = (name: string): string => \`Hello, \${name}!\`;

const message = greet('World');
console.log(message);`,
  errorText: 'Connection timeout. The model failed to respond within the allowed time.',
  userShort: 'What is the capital of France?',
  userWithSlideText: 'TypeScriptについての5枚スライドを作成してください',
};
