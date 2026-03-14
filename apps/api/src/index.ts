import { createDatabase } from "./db/database.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";

const db = createDatabase();
const app = createApp(db);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

