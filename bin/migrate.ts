import { migrate } from "../server/migrate.js";
import { pool } from "../server/db.js";

migrate(pool)
  .then(() => {
    console.info("[migrate] done");
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
