// Runs the visual suite in the official Playwright image, the one CI runs in, so screenshots match
// CI's on any OS. Arguments go to `playwright test`:
//
//   npm run test:visual:docker                     compare against the baselines
//   npm run test:visual:update                     write new baselines (--update-snapshots)
//   npm run test:visual:docker -- --grep focus     any other playwright test options
//
// The image's tag follows @playwright/test in package.json, so the two can't drift apart.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { devDependencies } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const version = devDependencies["@playwright/test"];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`@playwright/test must be pinned to an exact version to pick its Docker image, not "${version}".`);
}
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

// Files the run writes (baselines, reports) go back to their owner on hosts where Docker runs as root.
const owner = typeof process.getuid === "function" ? `${process.getuid()}:${process.getgid()}` : "";
const script = [
  "npm ci --no-audit --no-fund --loglevel=error",
  'npx playwright test "$@"',
  "status=$?",
  owner ? `chown -R ${owner} tests/visual test-results playwright-report 2>/dev/null` : ":",
  "exit $status"
].join("; ");

const result = spawnSync(
  "docker",
  [
    "run", "--rm", "--init", "--ipc=host",
    // The repo, with node_modules hidden behind the container's own: the host's are built for its OS.
    "-v", `${process.cwd()}:/work`,
    "-v", "/work/node_modules",
    // npm's download cache survives between runs.
    "-v", "expressive-charts-npm-cache:/root/.npm",
    "-w", "/work",
    "-e", "CI",
    image,
    "/bin/sh", "-c", script, "sh", ...process.argv.slice(2)
  ],
  { stdio: "inherit" }
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
