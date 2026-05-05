export type IconProviderId = 'lucide-local';

export type IconManifestIcon = {
  id: string;
  label: string;
  path: string;
  keywords: string[];
};

export type IconManifest = {
  provider: string;
  version: string;
  style: 'line' | 'filled' | string;
  license?: string | undefined;
  icons: IconManifestIcon[];
};

export type IconResolveRequest = {
  query: string;
  preferredIds?: string[] | undefined;
  maxResults?: number | undefined;
};

export type ResolvedIcon = {
  id: string;
  label: string;
  path: string;
  workspacePath?: string | undefined;
  score: number;
  provider: IconProviderId;
};

export interface IconProvider {
  id: IconProviderId;
  search(request: IconResolveRequest): ResolvedIcon[];
  resolve(id: string): ResolvedIcon | null;
  getAllIds(): string[];
  getManifest(): IconManifest;
}

export type IconConfig = {
  enabled?: boolean | undefined;
  providerId?: IconProviderId | undefined;
  preferredIconIds?: string[] | undefined;
};

export type IconCopyResult = {
  copiedIcons: ResolvedIcon[];
  workspaceIconDir: string;
  manifestPath: string;
  warnings: string[];
};

export type IconResultMetadata = {
  enabled: boolean;
  providerId?: string | undefined;
  copiedIconIds?: string[] | undefined;
  warnings?: string[] | undefined;
};
