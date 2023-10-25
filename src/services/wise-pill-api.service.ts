import { Router, Request, Response, NextFunction } from "express";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const secretKey =
    req.headers["x-api-key"] || req.query.apiKey || req.body.apiKey;

  if (secretKey && secretKey === process.env.SECRET_KEY) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid secret key" });
  }
}

const wisePillRoutesr = Router();

export default wisePillRoutesr;
