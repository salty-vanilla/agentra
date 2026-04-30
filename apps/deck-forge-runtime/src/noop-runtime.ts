type PresentationRuntime = {
  create(input: unknown): Promise<any>;
  applyOperations(presentation: unknown, operations: unknown[]): Promise<any>;
  inspect(presentation: unknown, query: unknown): Promise<any>;
  validate(presentation: unknown, options?: unknown): Promise<any>;
  export(presentation: unknown, options: unknown): Promise<any>;
};

export function createNoopPresentationRuntime(): PresentationRuntime {
  return {
    async create() {
      throw new Error('NoopPresentationRuntime does not implement create().');
    },

    async applyOperations() {
      throw new Error('NoopPresentationRuntime does not implement applyOperations().');
    },

    async inspect() {
      throw new Error('NoopPresentationRuntime does not implement inspect().');
    },

    async validate() {
      throw new Error('NoopPresentationRuntime does not implement validate().');
    },

    async export() {
      throw new Error('NoopPresentationRuntime does not implement export().');
    },
  };
}
