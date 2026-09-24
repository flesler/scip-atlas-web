import { describe, expect, it } from "vitest"
import {
  constructorClassDisplayName,
  extractLeafName,
  isConstructorParameterSymbol,
  moduleFileDisplayName,
  shouldPackDisplayName,
  symbolDisplayName,
} from "../src/symbols.js"

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
    expect(symbolDisplayName("scip-typescript npm . . `file.ts`/foo().", "Foo")).toBe("Foo");
  });

  it("parses module file names but keeps module symbols out of display_name", () => {
    expect(
      moduleFileDisplayName(
        "scip-typescript npm pkg 1.0.0 entrypoints/server/controllers/ai/`index.ts`/",
      ),
    ).toBe("index.ts")
    expect(symbolDisplayName("scip-typescript npm . . `index.js`/", null)).toBeNull()
  });

  it("skips display names that start with underscore", () => {
    expect(shouldPackDisplayName("greet")).toBe(true)
    expect(shouldPackDisplayName("_private")).toBe(false)
    expect(shouldPackDisplayName("__v")).toBe(false)
  })

  it("names constructors after their class", () => {
    const symbol =
      "scip-typescript npm pkg 1.0.0 src/`types.ts`/MigrationWriteError#`<constructor>`()."
    expect(constructorClassDisplayName(symbol)).toBe("MigrationWriteError")
    expect(symbolDisplayName(symbol, null)).toBe("MigrationWriteError")
    expect(isConstructorParameterSymbol(`${symbol}(message).`)).toBe(true)
  })

  it("parses type-literal field symbols ending with a colon", () => {
    expect(
      symbolDisplayName(
        "scip-typescript npm pkg HEAD src/`plan-details.ts`/OwnerCapabilities#typeLiteral85:",
        null,
      ),
    ).toBe("typeLiteral85")
  })
});
