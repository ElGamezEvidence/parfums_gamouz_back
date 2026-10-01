import { Router } from 'express';
import { contentController } from '../controllers/contentController.js';
import {
  contactNewsletterController,
  contactSchema,
  newsletterSchema,
} from '../controllers/contactNewsletterController.js';
import { reviewController, createReviewSchema } from '../controllers/reviewController.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Editorial & public settings
router.get('/home', contentController.getHomeContent);
router.get('/settings/public', contentController.getPublicSettings);

// Contact & Newsletter
router.post('/contact', validateBody(contactSchema), contactNewsletterController.submitContact);
router.post('/newsletter/subscribe', validateBody(newsletterSchema), contactNewsletterController.subscribeNewsletter);

// Reviews
router.post('/reviews', validateBody(createReviewSchema), reviewController.submitReview);

export default router;
