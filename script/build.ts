import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// Deps to bundle into the server binary
const allowlist = [
  "express",
  "pg",
  "web-push",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("building cron script...");
  await esbuild({
    entryPoints: ["scripts/cron-refresh.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "scripts/cron-refresh.cjs",
    minify: false,
    external: [],
    logLevel: "info",
  });

  console.log("build complete → dist/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
