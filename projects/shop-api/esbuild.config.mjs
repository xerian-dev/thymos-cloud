import { build } from "esbuild";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const outdir = "dist";

// Clean output directory
rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: ["src/handler.ts", "src/authorizer.ts", "src/import-handler.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir,
  external: ["@aws-sdk/*"],
});

execSync(`cd ${outdir} && zip -j handler.zip handler.js`, { stdio: "inherit" });
execSync(`cd ${outdir} && zip -j authorizer.zip authorizer.js`, {
  stdio: "inherit",
});
execSync(`cd ${outdir} && zip -j import-handler.zip import-handler.js`, {
  stdio: "inherit",
});

console.log(
  "Build complete: dist/handler.zip, dist/authorizer.zip, and dist/import-handler.zip",
);
