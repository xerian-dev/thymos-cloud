import { build } from "esbuild";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const outdir = "dist";
const buildTimestamp = new Date().toISOString();

// Clean output directory
rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: [
    "src/handler.ts",
    "src/authorizer.ts",
    "src/import-handler.ts",
    "src/stream-handler.ts",
  ],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir,
  external: ["@aws-sdk/*"],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
});

execSync(`cd ${outdir} && zip -j handler.zip handler.js`, { stdio: "inherit" });
execSync(`cd ${outdir} && zip -j authorizer.zip authorizer.js`, {
  stdio: "inherit",
});
execSync(`cd ${outdir} && zip -j import-handler.zip import-handler.js`, {
  stdio: "inherit",
});
execSync(`cd ${outdir} && zip -j stream-handler.zip stream-handler.js`, {
  stdio: "inherit",
});

console.log(
  "Build complete: dist/handler.zip, dist/authorizer.zip, dist/import-handler.zip, and dist/stream-handler.zip",
);
