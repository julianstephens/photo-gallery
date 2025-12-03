import { z } from "zod";

/**
 * Schema for health check configuration in a Coolify resource.
 */
export const healthCheckSchema = z.object({
  path: z.string().min(1).describe("Health check endpoint path"),
  port: z.string().regex(/^\d+$/, "Port must be a numeric string"),
});

/**
 * Schema for a single resource/application definition in the manifest.
 */
export const resourceSchema = z.object({
  /** Unique name for this application in Coolify */
  name: z.string().min(1).describe("Application name in Coolify"),
  /** Human-readable description */
  description: z.string().default(""),
  /** Docker image name (without tag), e.g., "ghcr.io/owner/repo/service" */
  dockerImageName: z.string().min(1).describe("Docker image name without tag"),
  /** Domain(s) for the application, comma-separated if multiple */
  domains: z.string().default(""),
  /** Port(s) to expose, comma-separated if multiple */
  portsExposes: z.string().regex(/^\d+(,\d+)*$/, "Ports must be comma-separated numbers"),
  /** Health check configuration */
  healthCheck: healthCheckSchema.optional(),
});

/**
 * Schema for the complete Coolify manifest file.
 */
export const manifestSchema = z.object({
  /** Coolify Project UUID */
  projectId: z.string().min(1).describe("Coolify Project UUID"),
  /** Coolify Destination UUID (Docker Engine) */
  destinationId: z.string().min(1).describe("Coolify Destination UUID"),
  /** Target environment name */
  environmentName: z.string().min(1).default("production"),
  /** Name of the GitHub secret containing the .env file */
  envFileSecretName: z.string().min(1).default("PRODUCTION_ENV_FILE"),
  /** Server UUID for Coolify */
  serverUuid: z.string().min(1).optional().describe("Coolify Server UUID"),
  /** Array of resource definitions */
  resources: z.array(resourceSchema).min(1, "At least one resource must be defined"),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

/**
 * Parses and validates a manifest object.
 * @throws {z.ZodError} if validation fails
 */
export function parseManifest(data: unknown): Manifest {
  return manifestSchema.parse(data);
}

/**
 * Safely parses a manifest, returning success/error result.
 */
export function safeParseManifest(data: unknown) {
  return manifestSchema.safeParse(data);
}
