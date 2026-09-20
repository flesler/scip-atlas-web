import { describe, expect, it } from "vitest"
import { extractLeafName, symbolDisplayName } from "../src/symbols.js"

describe("symbols", () => {
  it("extracts leaf names from SCIP symbol strings", () => {
    expect(extractLeafName("scip-typescript npm . . `backup-facts.ts`/exec().")).toBe("exec");
    expect(extractLeafName("scip-typescript npm . . `build-barrels.ts`/ModuleEntry#")).toBe("ModuleEntry");
    expect(extractLeafName("scip-typescript npm . . `simulate.ts`/getElapsed().")).toBe("getElapsed");
  });

  it("falls back to the symbol leaf when display_name is null", () => {
    expect(
      symbolDisplayName("scip-typescript npm . . `backup-facts.ts`/exec().", null),
    ).toBe("exec");
    expect(symbolDisplayName("scip-typescript npm . . `dir/`/", null)).toBeNull();
    expect(symbolDisplayName("scip-typescript npm . . `file.ts`/foo().", "Foo")).toBe("Foo");
  });
});
