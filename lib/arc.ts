/**
 * Compatibility shim — Mimir was originally built on Arc (Circle L1) and has
 * since been migrated to X Layer Testnet (OKX zkEVM). All chain configuration
 * lives in lib/xlayer.ts; this module re-exports the Arc-era names so existing
 * imports keep compiling without a project-wide rename.
 *
 * New code should import from "@/lib/xlayer" (or relative equivalent).
 */
export * from "./xlayer";
