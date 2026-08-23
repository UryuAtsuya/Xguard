#!/usr/bin/env node

import { spawn } from "node:child_process";

const commandSets = {
  all: [
    ["backend", "dev:api"],
    ["customer", "dev:web:customer"],
    ["admin", "dev:web:admin"],
  ],
  frontend: [
    ["customer", "dev:web:customer"],
    ["admin", "dev:web:admin"],
  ],
  backend: [["backend", "dev:api"]],
  customer: [["customer", "dev:web:customer"]],
  admin: [["admin", "dev:web:admin"]],
};

const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const target = args[dryRun ? 1 : 0];
const commands = commandSets[target];

if (!commands || args.length !== (dryRun ? 2 : 1)) {
  process.stderr.write(
    "usage: node scripts/dev-processes.mjs [--dry-run] <all|frontend|backend|customer|admin>\n",
  );
  process.exitCode = 1;
} else if (dryRun) {
  for (const [name, npmScript] of commands) {
    process.stdout.write(`${name}\tnpm run ${npmScript}\n`);
  }
} else {
  runDevelopmentProcesses(commands);
}

function runDevelopmentProcesses(processes) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const useProcessGroups = process.platform !== "win32";
  const children = [];
  let remaining = processes.length;
  let shuttingDown = false;
  let requestedExitCode = 0;
  let forceKillTimer;

  for (const [name, npmScript] of processes) {
    process.stdout.write(`[dev] starting ${name}: npm run ${npmScript}\n`);
    const child = spawn(npmCommand, ["run", npmScript], {
      detached: useProcessGroups,
      env: process.env,
      stdio: "inherit",
    });
    children.push(child);

    child.once("error", () => {
      process.stderr.write(`[dev] ${name} failed to start\n`);
      beginShutdown(1, "SIGTERM");
    });

    child.once("close", (code, signal) => {
      remaining -= 1;
      if (!shuttingDown) {
        const exitCode = typeof code === "number" ? code : 1;
        process.stderr.write(
          `[dev] ${name} stopped${signal ? ` by ${signal}` : ` with code ${exitCode}`}\n`,
        );
        beginShutdown(exitCode, "SIGTERM");
      }
      finishWhenStopped();
    });
  }

  process.once("SIGINT", () => beginShutdown(130, "SIGINT"));
  process.once("SIGTERM", () => beginShutdown(143, "SIGTERM"));
  process.once("SIGHUP", () => beginShutdown(129, "SIGHUP"));

  function beginShutdown(exitCode, signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    requestedExitCode = exitCode;

    for (const child of children) {
      signalChild(child, signal, useProcessGroups);
    }

    forceKillTimer = setTimeout(() => {
      for (const child of children) {
        signalChild(child, "SIGKILL", useProcessGroups);
      }
    }, 5_000);
    forceKillTimer.unref();
  }

  function finishWhenStopped() {
    if (remaining !== 0) {
      return;
    }
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    process.exitCode = requestedExitCode;
  }
}

function signalChild(child, signal, useProcessGroups) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (useProcessGroups) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ESRCH") {
      throw error;
    }
  }
}
