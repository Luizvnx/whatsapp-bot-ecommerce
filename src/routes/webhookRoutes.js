const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');

router.post(['/evolution', '/evolution/messages-upsert'], WebhookController.handleEvolutionWebhook);

module.exports = router;