import { migrate } from "../server/migrate.js";
import { pool } from "../server/db.js";

migrate()
  .then(() => {
    console.log("[migrate] done");
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
