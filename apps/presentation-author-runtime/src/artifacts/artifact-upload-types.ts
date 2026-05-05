export interface UploadedPresentationArtifact {
  kind:
    | 'pptx'
    | 'source-js'
    | 'contact-sheet'
    | 'rendered-slide'
    | 'diagnostics-json'
    | 'image-asset'
    | 'other';

  label: string;

  /** Local container path, useful for logs/debugging. */
  localPath: string;

  /** S3 bucket name. */
  bucket: string;

  /** S3 object key. */
  key: string;

  /** s3://bucket/key */
  s3Uri: string;

  /** Optional presigned GET URL. */
  downloadUrl?: string | undefined;

  /** Whether local file existed and upload was attempted. */
  uploaded: boolean;

  contentType?: string | undefined;
  sizeBytes?: number | undefined;
}

export interface ArtifactUploadResult {
  uploadedArtifacts: UploadedPresentationArtifact[];
  warnings: string[];
}
