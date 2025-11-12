import type { NextFunction, Request, Response } from "express";

export const requiresAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

export const requiresAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  next();
};
