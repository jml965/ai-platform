import type { User } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      teamRole?: string;
    }
  }
}
