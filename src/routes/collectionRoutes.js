import { Router } from 'express';
import { collectionController } from '../controllers/collectionController.js';

const router = Router();
router.get('/', collectionController.getCollections);

export default router;
