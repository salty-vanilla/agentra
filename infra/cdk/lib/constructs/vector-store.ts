import type { CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import type { Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface VectorStoreProps {
  /** Deployment stage (e.g. "dev", "prod"). */
  readonly stage: string;
  /**
   * IAM role that will be assumed by the Bedrock Knowledge Base.
   * The construct grants this role the permissions it needs to access the vector store.
   */
  readonly kbRole: Role;
}

/**
 * Base class for vector store constructs used by a Bedrock Knowledge Base.
 * Subclasses provision the backing store and expose the storage configuration
 * that CfnKnowledgeBase expects.
 */
export abstract class VectorStore extends Construct {
  abstract readonly storageConfiguration: CfnKnowledgeBase.StorageConfigurationProperty;
}
