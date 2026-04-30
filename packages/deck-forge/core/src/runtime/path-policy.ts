import path from "node:path";

export const PATH_OUTSIDE_WORKSPACE = "PATH_OUTSIDE_WORKSPACE";

export type RuntimeSafetyOptions = {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
};

export type PathPolicyContext = {
  action: "export" | "generate-image";
  kind: "file" | "dir";
};

export function resolveSafetyOptions(
  options?: RuntimeSafetyOptions,
): Required<RuntimeSafetyOptions> {
  return {
    workspaceRoot: path.resolve(options?.workspaceRoot ?? process.cwd()),
    allowOutsideWorkspace: options?.allowOutsideWorkspace ?? false,
  };
}

export function assertPathAllowed(
  targetPath: string,
  options?: RuntimeSafetyOptions,
  context?: PathPolicyContext,
): string {
  const resolvedTarget = path.resolve(targetPath);
  if (!options) {
    return resolvedTarget;
  }
  const safety = resolveSafetyOptions(options);

  if (safety.allowOutsideWorkspace) {
    return resolvedTarget;
  }

  const relative = path.relative(safety.workspaceRoot, resolvedTarget);
  const outside = relative === ".." || relative.startsWith(`..${path.sep}`);

  if (outside) {
    const action = context?.action ?? "write";
    const kind = context?.kind ?? "path";
    throw new Error(
      `${PATH_OUTSIDE_WORKSPACE}: blocked ${action} ${kind} outside workspace root: ${resolvedTarget} (workspaceRoot=${safety.workspaceRoot})`,
    );
  }

  return resolvedTarget;
}
