const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');

router.post(['/evolution', '/evolution/messages-upsert'], WebhookController.handleEvolutionWebhook);

router.post('/evolution/connection-update', (req, res) => {
    const status = req.body?.data?.state || 'desconhecido';
    console.log(`📡 Status da conexão do WhatsApp: ${status}`);
        res.status(200).send('OK');
});

module.exports = router;