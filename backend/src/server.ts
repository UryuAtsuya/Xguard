import "dotenv/config";
import { createApp } from "./app.js";
import { createRuntimeConfig } from "./config/runtimeConfig.js";

const config = createRuntimeConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`XGuard API prototype listening on http://localhost:${config.port}`);
});
