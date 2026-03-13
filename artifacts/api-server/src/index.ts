import { createServer } from "http";
import app from "./app";
import { seedRolesAndPermissions } from "./lib/seedRoles";
import { setupCollaborationWebSocket } from "./lib/collaboration";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedRolesAndPermissions().catch((err) =>
  console.error("[Seed] Failed to seed roles:", err)
);

const server = createServer(app);

setupCollaborationWebSocket(server);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
