import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverModule = require("../../dist/server.cjs") as { default?: any; app?: any };
const app = serverModule.default || serverModule.app;

export default function handler(req: any, res: any) {
  if (typeof req.url === "string" && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? req.url : `/${req.url}`}`;
  }
  return app(req, res);
}
