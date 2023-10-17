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

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const response = {
    messsage: "Welcome to the integration API",
  };
  res.status(200).send(response);
});

// For fetching device list
router.get("/devices", (req: Request, res: Response) => {});

// For assigning device
router.post("/devices/assign", (req: Request, res: Response) => {});

// For setting device alarm
router.post("/alarms", (req: Request, res: Response) => {});

// For fetching device events
router.get("/events", (req: Request, res: Response) => {});

export default router;
