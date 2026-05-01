export type OperationHandlerResult =
  | { status: "applied" }
  | {
      status: "skipped";
      reason:
        | "slide_not_found"
        | "element_not_found"
        | "region_not_found"
        | "unsupported_operation";
    };
