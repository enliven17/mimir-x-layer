/**
 * Compile contracts/Mimir.sol with solc and write the bytecode to
 * artifacts/Mimir.bin so deploy/deploy.ts can pick it up.
 *
 * Run: npx tsx scripts/compile-contract.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import * as path from "path";
// solc is a CJS module with synchronous loader semantics; ts/esm shims work.
// @ts-ignore — no types
import solc from "solc";

const SRC_PATH = path.resolve(process.cwd(), "contracts/Mimir.sol");
const OUT_DIR = path.resolve(process.cwd(), "artifacts");
const OUT_BIN = path.join(OUT_DIR, "Mimir.bin");
const OUT_ABI = path.join(OUT_DIR, "Mimir.abi.json");

const source = readFileSync(SRC_PATH, "utf-8");

const input = {
  language: "Solidity",
  sources: { "Mimir.sol": { content: source } },
  settings: {
    // viaIR is required because createClaim() has too many locals for the
    // legacy code generator. The IR pipeline + optimizer keep the bytecode
    // small enough for X Layer's 24KB contract size limit.
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input))) as any;

if (out.errors) {
  const fatal = (out.errors as any[]).filter((e) => e.severity === "error");
  for (const err of out.errors) {
    console[err.severity === "error" ? "error" : "warn"](err.formattedMessage);
  }
  if (fatal.length > 0) {
    console.error("\nCompilation failed.");
    process.exit(1);
  }
}

const contract = out.contracts?.["Mimir.sol"]?.["Mimir"];
if (!contract) {
  console.error("Mimir contract not found in solc output.");
  process.exit(1);
}

const bytecode = contract.evm.bytecode.object as string;
const abi = contract.abi;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_BIN, bytecode);
writeFileSync(OUT_ABI, JSON.stringify(abi, null, 2));

console.log(`✓ Compiled Mimir.sol`);
console.log(`  bytecode: ${OUT_BIN} (${bytecode.length / 2} bytes)`);
console.log(`  abi     : ${OUT_ABI}`);
