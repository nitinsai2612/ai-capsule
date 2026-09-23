import { Router } from 'express';

const router = Router();

// Public, so the deployed backend can be checked without logging in.
router.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
