import express, { type Express } from "express";
import session from "express-session";
import { csrfSync } from "csrf-sync";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

/**
 * Tests for CSRF protection middleware.
 * These tests verify that:
 * 1. GET requests work without tokens (safe method)
 * 2. POST/PUT/PATCH/DELETE requests are rejected without valid tokens
 * 3. Requests with valid tokens succeed
 * 4. The token endpoint is accessible without CSRF protection
 */
describe("CSRF Protection", () => {
  let app: Express;
  let csrfSynchronisedProtection: express.RequestHandler;
  let generateToken: (req: express.Request, force?: boolean) => string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Session middleware (required for CSRF token storage)
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
      }),
    );

    // Setup CSRF with same configuration as production
    const csrf = csrfSync({
      ignoredMethods: ["GET", "HEAD", "OPTIONS"],
      getTokenFromRequest: (req) => (req.headers["x-csrf-token"] as string) || req.body?._csrf,
      size: 32,
    });
    csrfSynchronisedProtection = csrf.csrfSynchronisedProtection;
    generateToken = csrf.generateToken;

    // CSRF token endpoint (intentionally before CSRF protection middleware)
    app.get("/api/csrf-token", (req, res) => {
      res.json({ token: generateToken(req, true) });
    });

    // Apply CSRF protection
    app.use(csrfSynchronisedProtection);

    // Test routes
    app.get("/api/test", (_req, res) => {
      res.json({ message: "GET success" });
    });

    app.post("/api/test", (_req, res) => {
      res.json({ message: "POST success" });
    });

    app.put("/api/test", (_req, res) => {
      res.json({ message: "PUT success" });
    });

    app.patch("/api/test", (_req, res) => {
      res.json({ message: "PATCH success" });
    });

    app.delete("/api/test", (_req, res) => {
      res.json({ message: "DELETE success" });
    });
  });

  describe("GET requests (safe method)", () => {
    it("should allow GET requests without a CSRF token", async () => {
      const response = await request(app).get("/api/test");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "GET success" });
    });

    it("should allow HEAD requests without a CSRF token", async () => {
      const response = await request(app).head("/api/test");
      expect(response.status).toBe(200);
    });

    // Note: OPTIONS test removed because Express doesn't automatically create OPTIONS handlers
    // unless CORS middleware is applied. OPTIONS is in ignoredMethods so it's safe by config.
  });

  describe("CSRF token endpoint", () => {
    it("should provide a CSRF token via GET /api/csrf-token", async () => {
      const response = await request(app).get("/api/csrf-token");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("token");
      expect(typeof response.body.token).toBe("string");
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it("should be accessible without an existing CSRF token", async () => {
      const response = await request(app).get("/api/csrf-token");
      expect(response.status).toBe(200);
    });
  });

  describe("POST/PUT/PATCH/DELETE requests without token", () => {
    it("should reject POST requests without a CSRF token", async () => {
      const response = await request(app).post("/api/test").send({ data: "test" });
      expect(response.status).toBe(403);
    });

    it("should reject PUT requests without a CSRF token", async () => {
      const response = await request(app).put("/api/test").send({ data: "test" });
      expect(response.status).toBe(403);
    });

    it("should reject PATCH requests without a CSRF token", async () => {
      const response = await request(app).patch("/api/test").send({ data: "test" });
      expect(response.status).toBe(403);
    });

    it("should reject DELETE requests without a CSRF token", async () => {
      const response = await request(app).delete("/api/test");
      expect(response.status).toBe(403);
    });
  });

  describe("requests with valid token", () => {
    it("should allow POST requests with a valid CSRF token in header", async () => {
      // First, get a CSRF token and session cookie
      const agent = request.agent(app);
      const tokenResponse = await agent.get("/api/csrf-token");
      expect(tokenResponse.status).toBe(200);
      const { token } = tokenResponse.body;

      // Then make a POST request with the token
      const response = await agent
        .post("/api/test")
        .set("x-csrf-token", token)
        .send({ data: "test" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "POST success" });
    });

    it("should allow PUT requests with a valid CSRF token in header", async () => {
      const agent = request.agent(app);
      const tokenResponse = await agent.get("/api/csrf-token");
      const { token } = tokenResponse.body;

      const response = await agent
        .put("/api/test")
        .set("x-csrf-token", token)
        .send({ data: "test" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "PUT success" });
    });

    it("should allow PATCH requests with a valid CSRF token in header", async () => {
      const agent = request.agent(app);
      const tokenResponse = await agent.get("/api/csrf-token");
      const { token } = tokenResponse.body;

      const response = await agent
        .patch("/api/test")
        .set("x-csrf-token", token)
        .send({ data: "test" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "PATCH success" });
    });

    it("should allow DELETE requests with a valid CSRF token in header", async () => {
      const agent = request.agent(app);
      const tokenResponse = await agent.get("/api/csrf-token");
      const { token } = tokenResponse.body;

      const response = await agent.delete("/api/test").set("x-csrf-token", token);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "DELETE success" });
    });

    it("should allow POST requests with a valid CSRF token in body", async () => {
      const agent = request.agent(app);
      const tokenResponse = await agent.get("/api/csrf-token");
      const { token } = tokenResponse.body;

      const response = await agent.post("/api/test").send({ _csrf: token, data: "test" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "POST success" });
    });
  });

  describe("requests with invalid token", () => {
    it("should reject POST requests with an invalid CSRF token", async () => {
      const agent = request.agent(app);
      // Get a valid session first
      await agent.get("/api/csrf-token");

      // Then make a request with an invalid token
      const response = await agent
        .post("/api/test")
        .set("x-csrf-token", "invalid-token")
        .send({ data: "test" });
      expect(response.status).toBe(403);
    });

    it("should reject requests with a token from a different session", async () => {
      // Get token from one session
      const agent1 = request.agent(app);
      const tokenResponse = await agent1.get("/api/csrf-token");
      const { token } = tokenResponse.body;

      // Try to use it in a different session
      const agent2 = request.agent(app);
      // Initialize session for agent2
      await agent2.get("/api/csrf-token");

      const response = await agent2
        .post("/api/test")
        .set("x-csrf-token", token)
        .send({ data: "test" });
      expect(response.status).toBe(403);
    });
  });

  describe("session expiry/regeneration", () => {
    it("should reject old tokens after session is regenerated", async () => {
      // Add a route that regenerates the session
      app.post("/api/regenerate-session", (req, res) => {
        const oldSessionId = req.session.id;
        req.session.regenerate((err) => {
          if (err) {
            return res.status(500).json({ error: "Session regeneration failed" });
          }
          res.json({ oldSessionId, newSessionId: req.session.id });
        });
      });

      const agent = request.agent(app);

      // Get initial CSRF token
      const tokenResponse = await agent.get("/api/csrf-token");
      expect(tokenResponse.status).toBe(200);
      const oldToken = tokenResponse.body.token;

      // Verify the old token works before regeneration
      const validResponse = await agent
        .post("/api/test")
        .set("x-csrf-token", oldToken)
        .send({ data: "test" });
      expect(validResponse.status).toBe(200);

      // Get a new token (to have CSRF protection on the regenerate endpoint)
      const newTokenResponse = await agent.get("/api/csrf-token");
      const newToken = newTokenResponse.body.token;

      // Regenerate the session
      const regenResponse = await agent
        .post("/api/regenerate-session")
        .set("x-csrf-token", newToken)
        .send({});
      expect(regenResponse.status).toBe(200);

      // Try to use the old token with the new session - should be rejected
      const invalidResponse = await agent
        .post("/api/test")
        .set("x-csrf-token", oldToken)
        .send({ data: "test" });
      expect(invalidResponse.status).toBe(403);
    });
  });
});
