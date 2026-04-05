import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "fs/promises";

// Deps bundled into server binaries (everything else is external)
const bundled = new Set(["express", "pg", "web-push", "zod"]);

async function externals(): Promise<string[]> {
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].filter((dep) => !bundled.has(dep));
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  const ext = await externals();

  const serverEntries: Record<string, string> = {
    "dist/index":       "server/index.ts",
    "dist/bin/migrate": "bin/migrate.ts",
    "dist/bin/cron":    "bin/cron-refresh.ts",
  };

  for (const [outfile, entry] of Object.entries(serverEntries)) {
    console.log(`building ${entry}...`);
    await esbuild({
      entryPoints: [entry],
      platform: "node",
      bundle: true,
      format: "cjs",
      outfile: `${outfile}.cjs`,
      external: ext,
      minify: outfile === "dist/index",
      logLevel: "info",
      define: { "import.meta.dirname": "__dirname" },
    });
  }

  // SSR server bundle: React + react-dom/server bundled in so the Node process
  // can renderToString without needing the client node_modules layout.
  console.log("building SSR server bundle...");
  await esbuild({
    entryPoints: ["client/src/entry-server.tsx"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/public/ssr-server.cjs",
    // React and react-dom/server must be bundled (they're ESM-first in v19);
    // external only deps that will be available in the Node runtime.
    external: ["pg", "web-push", "express"],
    logLevel: "info",
    jsx: "automatic",
    define: { "import.meta.dirname": "__dirname" },
  });

  console.log("copying migrations...");
  await cp("migrations", "dist/migrations", { recursive: true });

  console.log("build complete → dist/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
