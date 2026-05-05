/**
 * Build image tool guidance for the authoring LLM.
 * @param mode Which image tools are available: 'retrieve' (search only), 'generate' (generate only), 'auto' (both).
 */
export function buildImageToolGuidance(
  mode: 'retrieve' | 'generate' | 'auto' = 'auto',
): string {
  const canSearch = mode === 'retrieve' || mode === 'auto';
  const canGenerate = mode === 'generate' || mode === 'auto';

  const parts: string[] = ['Image Tools Available:', ''];

  if (canSearch && canGenerate) {
    parts.push(
      'You have two tools for acquiring images: search_image and generate_image.',
    );
  } else if (canSearch) {
    parts.push('You have one tool for acquiring images: search_image.');
    parts.push('Do NOT attempt to call generate_image — it is not available.');
  } else {
    parts.push('You have one tool for acquiring images: generate_image.');
    parts.push('Do NOT attempt to call search_image — it is not available.');
  }
  parts.push(
    'Call image tools BEFORE writing the addImage() code that references them.',
    'The tools return local file paths you can use directly in slide.addImage({ path: "..." }).',
    '',
  );

  if (canSearch) {
    parts.push(
      'When to use search_image:',
      '- Real-world subjects: people, places, objects, nature, events, buildings',
      '- Cultural content: festivals, food, traditional items, landmarks',
      '- Business scenes: meetings, offices, factories, logistics',
      '',
    );
  }

  if (canGenerate) {
    parts.push(
      'When to use generate_image:',
      '- Abstract concepts: AI, digital transformation, strategy, innovation',
      '- Custom illustrations: diagrams, conceptual art, unique visuals',
      '- When stock photos are unlikely to match the specific need',
      '',
    );
  }

  parts.push(
    'Image usage rules:',
    '- Use images on title slides, section dividers, hero blocks, or as supporting illustration.',
    '- Do not overload slides with images. Prefer at most 1-2 images per slide.',
    '- Respect the BrandFrame safe area. Do not overlap header/footer.',
    '- Write English queries/prompts for tools (translate Japanese topics to English keywords).',
    '- IMPORTANT: You MUST use the exact file path returned by the tool in your addImage() call.',
    '',
    'Example flow:',
  );

  if (canSearch) {
    parts.push(
      '  1. Call search_image({ query: "japanese carp streamers blue sky" })',
      '  2. Receive: { images: [{ path: "./assets/images/retrieved/xxx.jpg", description: "..." }] }',
      '  3. Use the EXACT returned path in code:',
      '     slide.addImage({ path: "./assets/images/retrieved/xxx.jpg", x: 0.5, y: 1.0, w: 4.0, h: 3.0 });',
      '     // or as background:',
      '     slide.background = { path: "./assets/images/retrieved/xxx.jpg" };',
    );
  } else {
    parts.push(
      '  1. Call generate_image({ prompt: "abstract digital transformation concept" })',
      '  2. Receive: { image: { path: "./assets/images/generated/xxx.png", description: "..." } }',
      '  3. Use the EXACT returned path in code:',
      '     slide.addImage({ path: "./assets/images/generated/xxx.png", x: 0.5, y: 1.0, w: 4.0, h: 3.0 });',
    );
  }

  return parts.join('\n');
}
