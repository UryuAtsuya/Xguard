import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

await verify("dist/frontend-customer", [
  "/api/admin",
  "AdminConsole",
  "admin_members",
  "管理画面へログイン",
  "magic linkを送信",
]);
await verify("dist/frontend-admin", [
  "/api/x/oauth/start",
  "CustomerPortal",
  "保全するXアカウント",
]);

console.log("frontend_bundle_separation_verified");

async function verify(directory, forbiddenValues) {
  const files = await listFiles(directory);
  const payload = (
    await Promise.all(
      files
        .filter((file) => /\.(?:html|css|js)$/.test(file))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");

  for (const forbidden of forbiddenValues) {
    if (payload.includes(forbidden)) {
      throw new Error(`bundle_boundary_violation:${directory}:${forbidden}`);
    }
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}
