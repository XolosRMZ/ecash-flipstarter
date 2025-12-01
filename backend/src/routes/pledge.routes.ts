import { Router } from 'express';
import { PledgeService } from '../services/PledgeService.js';
import { serializeBuiltTx } from './serialize.js';

const router = Router();
const service = new PledgeService();

router.post('/campaign/:id/pledge', async (req, res) => {
  try {
    const amount = BigInt(req.body.amount);
    const contributorAddress = req.body.contributorAddress as string;
    const tx = await service.createPledgeTx(req.params.id, contributorAddress, amount);
    res.json(serializeBuiltTx(tx));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
