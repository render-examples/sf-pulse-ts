import { build as esbuild } from "esbuild";
import { cp, readFile } from "fs/promises";
import { execFileSync } from "node:child_process";

// Deps bundled into server binaries (everything else is external)
const bundled = new Set(["pg", "web-push", "zod"]);

async function externals(): Promise<string[]> {
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].filter((dep) => !bundled.has(dep));
}

async function buildAll() {
  console.info("building Astro site...");
  execFileSync("node", ["--env-file-if-exists=.env.local", "./node_modules/astro/bin/astro.mjs", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
    },
  });

  const ext = await externals();

  const serverEntries: Record<string, string> = {
    "dist/bin/migrate": "bin/migrate.ts",
    "dist/bin/cron":    "bin/cron-refresh.ts",
  };

  for (const [outfile, entry] of Object.entries(serverEntries)) {
    console.info(`building ${entry}...`);
    await esbuild({
      entryPoints: [entry],
      platform: "node",
      bundle: true,
      format: "cjs",
      outfile: `${outfile}.cjs`,
      external: ext,
      logLevel: "info",
      define: { "import.meta.dirname": "__dirname" },
    });
  }

  console.info("copying migrations...");
  await cp("migrations", "dist/migrations", { recursive: true });

  console.info("build complete → dist/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
