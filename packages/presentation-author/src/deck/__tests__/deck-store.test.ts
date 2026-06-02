import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { persistDeck } from '../deck-store.js';
import {
  buildDeckWorkspace,
  type DeckComposeArtifacts,
  type DeckMeta,
} from '../workspace.js';

const meta: DeckMeta = { deckId: 'deck-1', name: 'Demo', language: 'ja' };

let tmp: string;
let compose: DeckComposeArtifacts;

/** A real client so offline getSignedUrl can sign; network send() is stubbed per test. */
function makeClient(): S3Client {
  return new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'deck-store-test-'));
  await writeFile(join(tmp, 'defs.json'), '{"version":1,"defs":"<defs/>"}');
  await writeFile(join(tmp, 'intro.compose.json'), '{"version":1}');
  await writeFile(join(tmp, 'intro.webp'), 'webpbytes');
  await writeFile(join(tmp, 'deck.pptx'), 'pptxbytes');
  compose = {
    defsPath: join(tmp, 'defs.json'),
    pptxPath: join(tmp, 'deck.pptx'),
    pptxEpoch: 1700000000000,
    slides: [
      {
        slug: 'intro',
        index: 1,
        composePath: join(tmp, 'intro.compose.json'),
        previewPath: join(tmp, 'intro.webp'),
      },
    ],
  };
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('persistDeck', () => {
  it('uploads every workspace item to the deck prefix and presigns URLs', async () => {
    const client = makeClient();
    const sent: string[] = [];
    vi.spyOn(client, 'send').mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) sent.push(String(cmd.input.Key));
      return {} as never;
    });

    const ws = buildDeckWorkspace(meta, compose);
    const { deck, warnings } = await persistDeck(
      { workspace: ws, meta, bucketName: 'my-bucket' },
      { s3Client: client },
    );

    // All items uploaded under decks/deck-1/.
    expect(sent).toContain('decks/deck-1/preview/defs.json');
    expect(sent).toContain('decks/deck-1/slides/intro.compose.json');
    expect(sent).toContain('decks/deck-1/preview/intro.webp');
    expect(sent).toContain('decks/deck-1/pptx/1700000000000.pptx');
    expect(sent).toContain('decks/deck-1/specs/outline.md');
    expect(warnings).toEqual([]);

    // DeckResult presigned URLs reference the right keys.
    expect(deck.deckId).toBe('deck-1');
    expect(deck.slideOrder).toEqual(['intro']);
    expect(deck.defsUrl).toContain('preview/defs.json');
    expect(deck.pptxDownloadUrl).toContain('pptx/1700000000000.pptx');
    expect(deck.specs.outlineUrl).toContain('specs/outline.md');
    expect(deck.specs.briefUrl).toBeNull();
    expect(deck.slides[0]?.previewUrl).toContain('preview/intro.webp');
    expect(deck.slides[0]?.composeUrl).toContain('slides/intro.compose.json');
    expect(deck.version).toBe(1);
    // Presigned (signature query present).
    expect(deck.defsUrl).toContain('X-Amz-Signature');
  });

  it('degrades: a failed upload leaves that URL null and records a warning', async () => {
    const client = makeClient();
    vi.spyOn(client, 'send').mockImplementation(async (cmd: unknown) => {
      if (
        cmd instanceof PutObjectCommand &&
        String(cmd.input.Key).endsWith('intro.compose.json')
      ) {
        throw new Error('access denied');
      }
      return {} as never;
    });

    const ws = buildDeckWorkspace(meta, compose);
    const { deck, warnings } = await persistDeck(
      { workspace: ws, meta, bucketName: 'my-bucket' },
      { s3Client: client },
    );

    expect(deck.slides[0]?.composeUrl).toBeNull(); // failed upload → not presigned
    expect(deck.slides[0]?.previewUrl).toContain('preview/intro.webp'); // sibling still ok
    expect(warnings.join(' ')).toContain('intro.compose.json');
    expect(warnings.join(' ')).toContain('access denied');
  });
});
