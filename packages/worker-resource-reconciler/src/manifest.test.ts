import { describe, it, expect } from "vitest";
import { parseManifest, safeParseManifest, manifestSchema, resourceSchema } from "./manifest.js";

describe("Manifest Schema", () => {
  describe("resourceSchema", () => {
    it("should validate a valid resource", () => {
      const resource = {
        name: "my-app",
        description: "My application",
        dockerImageName: "ghcr.io/owner/repo/app",
        domains: "app.example.com",
        portsExposes: "3000",
        healthCheck: {
          path: "/health",
          port: "3000",
        },
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });

    it("should validate resource without optional fields", () => {
      const resource = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        portsExposes: "3000",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });

    it("should reject resource with empty name", () => {
      const resource = {
        name: "",
        dockerImageName: "ghcr.io/owner/repo/app",
        portsExposes: "3000",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(false);
    });

    it("should reject resource with invalid ports", () => {
      const resource = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        portsExposes: "invalid",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(false);
    });

    it("should accept multiple ports", () => {
      const resource = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        portsExposes: "3000,4000,5000",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });
  });

  describe("manifestSchema", () => {
    it("should validate a complete manifest", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        environmentName: "production",
        envFileSecretName: "PRODUCTION_ENV_FILE",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            portsExposes: "3000",
          },
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it("should use defaults for optional fields", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            portsExposes: "3000",
          },
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.environmentName).toBe("production");
        expect(result.data.envFileSecretName).toBe("PRODUCTION_ENV_FILE");
      }
    });

    it("should reject manifest without resources", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("should reject manifest without projectId", () => {
      const manifest = {
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            portsExposes: "3000",
          },
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("parseManifest", () => {
    it("should parse a valid manifest", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            portsExposes: "3000",
          },
        ],
      };

      const result = parseManifest(manifest);
      expect(result.projectId).toBe("project-uuid");
      expect(result.resources).toHaveLength(1);
    });

    it("should throw for invalid manifest", () => {
      const manifest = {
        projectId: "",
        destinationId: "destination-uuid",
        resources: [],
      };

      expect(() => parseManifest(manifest)).toThrow();
    });
  });

  describe("safeParseManifest", () => {
    it("should return success for valid manifest", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            portsExposes: "3000",
          },
        ],
      };

      const result = safeParseManifest(manifest);
      expect(result.success).toBe(true);
    });

    it("should return error for invalid manifest", () => {
      const manifest = {
        projectId: "",
        resources: [],
      };

      const result = safeParseManifest(manifest);
      expect(result.success).toBe(false);
    });
  });
});
