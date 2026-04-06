import fs from "node:fs";

export function readFixture(name: string): string {
  return fs.readFileSync(
    new URL(`../fixtures/cron-refresh/${name}`, import.meta.url),
    "utf8",
  );
}
