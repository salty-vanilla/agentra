/**
 * StrategyRegistry — stores and queries StrategyManifests.
 *
 * Phase 8A provides simple filtering. Phase 8C will add scored selection.
 */

import type { StrategyManifest } from "#src/strategy/manifest.js";
import type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";

export type StrategyQuery = {
  audience?: AudienceType;
  genre?: PresentationGenre;
  intent?: CommunicationIntent;
  contentKind?: ContentKind;
  density?: DensityLevel;
};

export class StrategyRegistry {
  private readonly manifests = new Map<string, StrategyManifest>();

  register(manifest: StrategyManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  getStrategyManifest(id: string): StrategyManifest | undefined {
    return this.manifests.get(id);
  }

  listStrategyManifests(): StrategyManifest[] {
    return [...this.manifests.values()];
  }

  findStrategyManifests(query: StrategyQuery): StrategyManifest[] {
    return this.listStrategyManifests().filter((m) => {
      if (query.audience && !m.audiences.includes(query.audience)) return false;
      if (query.genre && !m.suitableFor.includes(query.genre)) return false;
      if (query.intent && !m.intents.includes(query.intent)) return false;
      if (query.contentKind && !m.contentKinds.includes(query.contentKind)) return false;
      if (query.density && m.density !== query.density) return false;
      return true;
    });
  }
}
