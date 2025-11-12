import type { AuthSessionData } from "./types.ts";

declare module "express-session" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SessionData extends AuthSessionData {}
}
