import type { NextFunction, Request, Response } from 'express';

export const asyncHandler =
  <TRequest extends Request = Request>(
    fn: (req: TRequest, res: Response, next: NextFunction) => Promise<unknown>
  ) =>
  (req: TRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
