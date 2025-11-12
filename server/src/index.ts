import env from "./schemas/env.ts";
import { createApp, printRegisteredRoutes } from "./server.ts";

// Start server if run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = createApp();

  console.log("Registered Routes:");
  printRegisteredRoutes(app.router.stack);
  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close((err?: Error) => {
      if (err) {
        console.error("Error during server close:", err);
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
