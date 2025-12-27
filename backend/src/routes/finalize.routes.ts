import { Router } from 'express';
import { FinalizeService } from '../services/FinalizeService';
import { serializeBuiltTx } from './serialize';
import { validateAddress } from '../utils/validation';

const router = Router();
const service = new FinalizeService();

router.post('/campaign/:id/finalize', async (req, res) => {
  try {
    const beneficiaryAddress = validateAddress(
      req.body.beneficiaryAddress as string,
      'beneficiaryAddress'
    );
    const tx = await service.createFinalizeTx(req.params.id, beneficiaryAddress);
    res.json(serializeBuiltTx(tx));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
