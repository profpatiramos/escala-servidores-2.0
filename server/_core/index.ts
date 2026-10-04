import "dotenv/config";
import express from "express";
import { configureApp } from "./app";
import { createServer } from "http";
import net from "net";





import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  configureApp(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

  const preferredPort = parseInt(process.env.PORT || "3000");
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) throw new Error("PORT inválida.");
  const port = process.env.NODE_ENV === "production" ? preferredPort : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error => { console.error(error instanceof Error ? error.message : "Falha ao iniciar."); process.exitCode = 1; });
