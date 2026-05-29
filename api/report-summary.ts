import serverModule from "../dist/server.cjs";

const app = (serverModule as any).default ?? (serverModule as any).app ?? serverModule;

export default function handler(req: any, res: any) {
  if (typeof req.url === "string" && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? req.url : `/${req.url}`}`;
  }

  return app(req, res);
}
