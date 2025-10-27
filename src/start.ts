import { build } from "./server";

// This file boots the application in production. It is separate from
// server.ts so that tests can import the build() function without
// automatically starting a listener.

(async () => {
  try {
    const app = await build();
    const port = app.config?.PORT ?? 8080;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Fastify Camunda worker listening on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
