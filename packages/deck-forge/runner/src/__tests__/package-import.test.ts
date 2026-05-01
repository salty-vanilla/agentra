import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("package import smoke", () => {
  it("imports the built runner package entrypoint", async () => {
    const entrypoint = join(process.cwd(), "packages/runner/dist/index.js");
    if (!existsSync(entrypoint)) {
      return;
    }

    const mod = await import(entrypoint);
    expect(mod).toHaveProperty("DeckForgeRunner");
  });
});
