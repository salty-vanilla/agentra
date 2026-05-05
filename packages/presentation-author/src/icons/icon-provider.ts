import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IconManifest,
  IconManifestIcon,
  IconProvider,
  IconProviderId,
  IconResolveRequest,
  ResolvedIcon,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_ROOT = join(__dirname, '..', '..', 'assets', 'icons');

export function loadIconManifest(providerId: IconProviderId): IconManifest {
  const providerDir = providerId === 'lucide-local' ? 'lucide' : providerId;
  const manifestPath = join(ASSETS_ROOT, providerDir, 'manifest.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as IconManifest;
}

export function getIconAssetDir(providerId: IconProviderId): string {
  const providerDir = providerId === 'lucide-local' ? 'lucide' : providerId;
  return join(ASSETS_ROOT, providerDir);
}

export function createDefaultLocalIconProvider(
  providerId: IconProviderId = 'lucide-local',
): IconProvider {
  return new LocalIconProvider(providerId);
}

export class LocalIconProvider implements IconProvider {
  readonly id: IconProviderId;
  private manifest: IconManifest;
  private assetDir: string;

  constructor(providerId: IconProviderId = 'lucide-local') {
    this.id = providerId;
    this.manifest = loadIconManifest(providerId);
    this.assetDir = getIconAssetDir(providerId);
  }

  search(request: IconResolveRequest): ResolvedIcon[] {
    const query = request.query.toLowerCase();
    const maxResults = request.maxResults ?? 5;
    const scored: ResolvedIcon[] = [];

    for (const icon of this.manifest.icons) {
      const score = scoreIcon(icon, query);
      if (score > 0) {
        scored.push({
          id: icon.id,
          label: icon.label,
          path: join(this.assetDir, icon.path),
          score,
          provider: this.id,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  resolve(id: string): ResolvedIcon | null {
    const icon = this.manifest.icons.find((i) => i.id === id);
    if (!icon) return null;
    return {
      id: icon.id,
      label: icon.label,
      path: join(this.assetDir, icon.path),
      score: 100,
      provider: this.id,
    };
  }

  getAllIds(): string[] {
    return this.manifest.icons.map((i) => i.id);
  }

  getManifest(): IconManifest {
    return this.manifest;
  }
}

function scoreIcon(icon: IconManifestIcon, query: string): number {
  let score = 0;

  // Exact ID match
  if (icon.id === query) {
    score += 100;
  }

  // Exact keyword match
  for (const kw of icon.keywords) {
    if (kw.toLowerCase() === query) {
      score += 50;
      break;
    }
  }

  // Label substring
  if (icon.label.toLowerCase().includes(query)) {
    score += 20;
  }

  // ID substring
  if (icon.id.includes(query)) {
    score += 15;
  }

  // Keyword substring
  for (const kw of icon.keywords) {
    if (kw.toLowerCase().includes(query) || query.includes(kw.toLowerCase())) {
      score += 10;
      break;
    }
  }

  return score;
}
