import { Router } from 'express';
import { RefundService } from '../services/RefundService.js';
import { serializeBuiltTx } from './serialize.js';

const router = Router();
const service = new RefundService();

router.post('/campaign/:id/refund', async (req, res) => {
  try {
    const refundAddress = req.body.refundAddress as string;
    const refundAmount = BigInt(req.body.refundAmount);
    const tx = await service.createRefundTx(req.params.id, refundAddress, refundAmount);
    res.json(serializeBuiltTx(tx));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
