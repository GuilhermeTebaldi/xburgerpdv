import type { Request, Response } from 'express';

import { prisma } from '../db/prisma.js';
import { toFrontSale } from '../services/mappers.service.js';
import { SaleService } from '../services/sale.service.js';
import { refundCreateSchema, saleCreateSchema } from '../validators/sale.validator.js';

const saleService = new SaleService();

export const saleController = {
  list: async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const includeRefunded = req.query.includeRefunded === 'true';
    const onlyRefunded = req.query.onlyRefunded === 'true';

    const sales = await saleService.list({
      sessionId,
      includeRefunded,
      onlyRefunded,
    });

    res.status(200).json(sales.map(toFrontSale));
  },

  getById: async (req: Request, res: Response) => {
    const sale = await saleService.getById(req.params.id);
    res.status(200).json({
      summary: toFrontSale(sale),
      details: sale,
    });
  },

  create: async (req: Request, res: Response) => {
    const payload = saleCreateSchema.parse(req.body);

    const created = await saleService.create(
      {
        externalId: payload.externalId,
        sessionId: payload.sessionId,
        note: payload.note,
        items: payload.items,
      },
      req.context
    );

    res.status(201).json({
      summary: toFrontSale(created),
      details: created,
    });
  },

  refund: async (req: Request, res: Response) => {
    const payload = refundCreateSchema.parse(req.body || {});

    const refund = await saleService.createRefund(
      req.params.id,
      {
        type: payload.type,
        reason: payload.reason,
        items: payload.items,
      },
      req.context
    );

    const sale = await saleService.getById(req.params.id);

    res.status(201).json({
      refund,
      sale: {
        summary: toFrontSale(sale),
        details: sale,
      },
    });
  },

  undoLast: async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;

    const refund = await saleService.undoLastSale(sessionId, req.context);

    const sale = await prisma.sale.findUnique({
      where: { id: refund.saleId },
      include: {
        items: {
          include: { ingredients: true },
        },
      },
    });

    res.status(201).json({
      refund,
      refundedSale: sale ? toFrontSale(sale) : null,
    });
  },
};
