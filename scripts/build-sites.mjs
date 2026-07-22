import { cp, mkdir, rm } from "node:fs/promises";

const target = process.argv[2];

if (target !== "customer" && target !== "admin") {
  throw new Error("usage: node scripts/build-sites.mjs <customer|admin>");
}

const outputRoot = target === "customer" ? "dist" : "sites/admin/dist";
const frontendOutput = target === "customer" ? "dist/frontend-customer" : "dist/frontend-admin";
const workerEntry = target === "customer" ? "sites/customer-worker.mjs" : "sites/admin/worker.mjs";

await rm(`${outputRoot}/client`, { recursive: true, force: true });
await rm(`${outputRoot}/server`, { recursive: true, force: true });
await mkdir(`${outputRoot}/client`, { recursive: true });
await cp(frontendOutput, `${outputRoot}/client`, { recursive: true });
await mkdir(`${outputRoot}/server`, { recursive: true });
await cp(workerEntry, `${outputRoot}/server/index.js`);
