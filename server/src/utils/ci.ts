/**
 * CI environment detection utility.
 * Detects if code is running in a CI/CD environment based on common environment variables.
 */

/**
 * List of environment variables that indicate CI/CD environment.
 * Covers: GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, Azure Pipelines, etc.
 */
const CI_ENV_VARS = [
  "CI", // Generic CI flag (GitHub Actions, GitLab CI, CircleCI, Travis, Azure)
  "CONTINUOUS_INTEGRATION", // Travis CI and others
  "BUILD_ID", // Jenkins
  "RUN_ID", // GitHub Actions
  "GITHUB_ACTIONS", // GitHub Actions specific
  "GITLAB_CI", // GitLab CI specific
  "CIRCLECI", // CircleCI specific
  "BUILDKITE", // Buildkite specific
  "DRONE", // Drone CI specific
];

/**
 * Check if code is running in a CI/CD environment.
 * @returns True if running in CI/CD, false if running locally.
 */
export function isCI(): boolean {
  return CI_ENV_VARS.some((envVar) => process.env[envVar] !== undefined);
}

/**
 * Get the detected CI platform name, or undefined if not in CI.
 * @returns The CI platform name or undefined.
 */
export function getCIPlatform(): string | undefined {
  if (process.env.GITHUB_ACTIONS) return "github-actions";
  if (process.env.GITLAB_CI) return "gitlab-ci";
  if (process.env.CIRCLECI) return "circleci";
  if (process.env.BUILDKITE) return "buildkite";
  if (process.env.DRONE) return "drone";
  if (process.env.JENKINS_HOME) return "jenkins";
  if (process.env.TRAVIS) return "travis-ci";
  if (process.env.AZURE_PIPELINES) return "azure-pipelines";
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) return "generic-ci";
  return undefined;
}
