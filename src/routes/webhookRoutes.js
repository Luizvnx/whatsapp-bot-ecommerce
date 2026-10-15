const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');
const PaymentService = require('../services/payment/PaymentService');

// Webhook da Evolution API (mensagens, conexão, qrcode)
router.post([
    '/evolution',
    '/evolution/messages-upsert',
    '/evolution/connection-update',
    '/evolution/qrcode-updated'
], WebhookController.handleEvolutionWebhook);

// Webhook universal para gateways de pagamento (Mercado Pago, Asaas, EFI, etc.)
router.post('/pagamento/:provedor', async (req, res) => {
    try {
        const { provedor } = req.params;
        const resultado = await PaymentService.processarWebhook(provedor, req.body, req.headers);
        res.status(200).json({ success: true, ...resultado });
    } catch (err) {
        console.error(`❌ Erro no webhook de pagamento [${req.params.provedor}]:`, err.message);
        res.status(200).json({ success: false, message: err.message });
    }
});

module.exports = router;