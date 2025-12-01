import { Router } from 'express';
import { FinalizeService } from '../services/FinalizeService.js';
import { serializeBuiltTx } from './serialize.js';

const router = Router();
const service = new FinalizeService();

router.post('/campaign/:id/finalize', async (req, res) => {
  try {
    const beneficiaryAddress = req.body.beneficiaryAddress as string;
    const tx = await service.createFinalizeTx(req.params.id, beneficiaryAddress);
    res.json(serializeBuiltTx(tx));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
