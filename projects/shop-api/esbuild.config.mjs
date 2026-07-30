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
    "src/aggregator-handler.ts",
    "src/brand-cluster-handler.ts",
    "src/brand-apply-handler.ts",
    "src/color-cluster-handler.ts",
    "src/color-apply-handler.ts",
    "src/description-cluster-handler.ts",
    "src/description-apply-handler.ts",
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
execSync(
  `cd ${outdir} && zip -j aggregator-handler.zip aggregator-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j brand-cluster-handler.zip brand-cluster-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j brand-apply-handler.zip brand-apply-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j color-cluster-handler.zip color-cluster-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j color-apply-handler.zip color-apply-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j description-cluster-handler.zip description-cluster-handler.js`,
  {
    stdio: "inherit",
  },
);
execSync(
  `cd ${outdir} && zip -j description-apply-handler.zip description-apply-handler.js`,
  {
    stdio: "inherit",
  },
);

console.log(
  "Build complete: dist/handler.zip, dist/authorizer.zip, dist/import-handler.zip, dist/stream-handler.zip, and dist/aggregator-handler.zip",
);
