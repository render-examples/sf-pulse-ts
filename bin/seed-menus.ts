/**
 * One-shot script: run menu discovery for all opened restaurants that have
 * no menu_checked_at, then write results directly to the DB.
 *
 * Run with:
 *   DATABASE_URL=... node --import tsx/esm bin/seed-menus.ts
 */
import { Pool } from "pg";
import { discoverMenu } from "./cron-refresh.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM restaurants
     WHERE opened_date NOT ILIKE '%upcoming%'
       AND menu_checked_at IS NULL
     ORDER BY id`
  );

  console.log(`[seed-menus] ${rows.length} restaurants to check`);

  for (const r of rows) {
    process.stdout.write(`  ${r.name} … `);
    try {
      const { menuUrl, dietaryFlags } = await discoverMenu(r.name);
      await pool.query(
        `UPDATE restaurants
         SET menu_url = $1,
             dietary_flags = $2,
             menu_checked_at = NOW()
         WHERE id = $3`,
        [menuUrl, dietaryFlags ? JSON.stringify(dietaryFlags) : null, r.id]
      );
      const flags = [];
      if (dietaryFlags?.gluten_free.available) flags.push(`GF(${dietaryFlags.gluten_free.confidence[0]})`);
      if (dietaryFlags?.vegan.available)       flags.push(`VG(${dietaryFlags.vegan.confidence[0]})`);
      if (dietaryFlags?.vegetarian.available)  flags.push(`V(${dietaryFlags.vegetarian.confidence[0]})`);
      console.log(menuUrl ? `✓ ${menuUrl.slice(0, 60)}${flags.length ? " [" + flags.join(" ") + "]" : ""}` : "no menu found");
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
    // Small delay between searches to avoid rate-limiting
    await new Promise((res) => setTimeout(res, 1500));
  }

  await pool.end();
  console.log("[seed-menus] done");
}

run().catch((err) => { console.error(err); process.exit(1); });
