/**
 * Manifest Generation Script for Coolify Deployments
 *
 * This script scans the monorepo and generates a coolify.manifest.json file
 * containing all deployable resources (packages with Dockerfiles).
 *
 * Usage:
 *   pnpm tsx ./scripts/generate-manifest.ts
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

// --- Types ---

type PnpmWorkspace = {
  name: string;
  path: string;
};

type CoolifyResource = {
  name: string;
  description: string;
  dockerImageName: string;
  domains: string;
  portsExposes: string;
  healthCheck: {
    path: string;
    port: string;
  };
};

type CoolifyManifest = {
  projectId: string;
  destinationId: string;
  serverUuid: string;
  environmentName: string;
  envFileSecretName: string;
  resources: CoolifyResource[];
};

// --- Helper Functions ---

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[SUCCESS] ${msg}`),
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function getExposedPort(dockerfilePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(dockerfilePath, "utf-8");
    const exposeMatch = content.match(/^EXPOSE\s+(\d+)/m);
    return exposeMatch ? exposeMatch[1] : null;
  } catch {
    return null;
  }
}

function getRepoInfo(): { owner: string; name: string } | null {
  try {
    const remoteUrl = execSync("git config --get remote.origin.url").toString().trim();
    const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)(\.git)?/);
    if (match && match[1] && match[2]) {
      return { owner: match[1], name: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

function getPnpmWorkspaces(): PnpmWorkspace[] {
  try {
    const output = execSync("pnpm list -r --json --depth -1").toString();
    const workspaces = JSON.parse(output) as PnpmWorkspace[];
    return workspaces.filter((w) => w.name && w.path);
  } catch (err) {
    log.error("Failed to get pnpm workspaces. Is pnpm installed and are you in a monorepo?");
    console.error(err);
    return [];
  }
}

// --- Main Script Logic ---

/**
 * Creates a resource definition object for a single workspace if it's eligible.
 * @returns A CoolifyResource object or null if the workspace is not eligible.
 */
async function createResourceForWorkspace(
  workspace: PnpmWorkspace,
  repoInfo: { owner: string; name: string },
): Promise<CoolifyResource | null> {
  const { path: absolutePath, name: pkgName } = workspace;
  const dockerfilePath = path.join(absolutePath, "Dockerfile");

  if (!(await pathExists(dockerfilePath))) {
    return null; // Not an eligible resource
  }

  log.info(`Processing "${pkgName}"...`);
  const packageJsonPath = path.join(absolutePath, "package.json");

  let pkg: { description?: string };
  try {
    const pkgContent = await fs.readFile(packageJsonPath, "utf-8");
    pkg = JSON.parse(pkgContent);
  } catch {
    log.error(`Could not read package.json for "${pkgName}". Skipping.`);
    return null;
  }

  const exposedPort = await getExposedPort(dockerfilePath);
  if (!exposedPort) {
    log.warn(`No EXPOSE instruction found in Dockerfile for "${pkgName}". Defaulting to 8080.`);
  }

  const resourceNameSuffix = pkgName.split("/")[1] || pkgName;

  return {
    name: `${repoInfo.name}-${resourceNameSuffix}`,
    description: pkg.description || `The ${resourceNameSuffix} service.`,
    dockerImageName: `ghcr.io/${repoInfo.owner}/${repoInfo.name}/${resourceNameSuffix}`,
    domains: "app.example.com", // <-- USER MUST REPLACE
    portsExposes: exposedPort || "8080",
    healthCheck: {
      path: "/health",
      port: exposedPort || "8080",
    },
  };
}

async function main() {
  log.info("Scanning monorepo to generate a root coolify.manifest.json...");

  const repoInfo = getRepoInfo();
  if (!repoInfo) {
    log.error("Could not determine GitHub repository from git remote.");
    process.exit(1);
  }

  const allWorkspaces = getPnpmWorkspaces();
  if (allWorkspaces.length === 0) {
    log.warn("No pnpm workspaces found.");
    process.exit(0);
  }

  // --- Build the list of resources ---
  const allResources: CoolifyResource[] = [];
  for (const workspace of allWorkspaces) {
    const resource = await createResourceForWorkspace(workspace, repoInfo);
    if (resource) {
      allResources.push(resource);
    }
  }

  if (allResources.length === 0) {
    log.warn("Scan complete. No workspaces with a Dockerfile were found. No manifest generated.");
    process.exit(0);
  }

  // --- Construct the final root manifest ---
  const rootManifest: CoolifyManifest = {
    projectId: "clv4321dc0000g21b5c1a1a1a", // <-- USER MUST REPLACE
    destinationId: "clt1234ab0000g21b5c1a1b1b", // <-- USER MUST REPLACE
    serverUuid: "clx9876ef0000g21b5c1a1c1c", // <-- USER MUST REPLACE
    environmentName: "production",
    envFileSecretName: "PRODUCTION_ENV_FILE",
    resources: allResources,
  };

  const rootManifestPath = path.resolve(process.cwd(), "coolify.manifest.json");
  await fs.writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2));

  log.info("--------------------------------------------------");
  log.success(`Scan complete. Generated root manifest with ${allResources.length} resource(s).`);
  log.success(`File created at: ${rootManifestPath}`);
  log.warn("ACTION REQUIRED: Open coolify.manifest.json and replace placeholder values.");
}

main().catch((err) => {
  log.error("An unexpected error occurred during manifest generation:");
  console.error(err);
  process.exit(1);
});
