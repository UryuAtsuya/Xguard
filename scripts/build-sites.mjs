import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/client", { recursive: true });
await cp("dist/frontend", "dist/client", { recursive: true });

await mkdir("dist/server", { recursive: true });
await cp("sites/worker.mjs", "dist/server/index.js");
