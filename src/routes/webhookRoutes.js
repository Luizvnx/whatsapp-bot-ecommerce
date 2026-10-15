const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');

router.post(['/evolution', '/evolution/messages-upsert'], WebhookController.handleEvolutionWebhook);

router.post('/evolution/connection-update', (req, res) => {
    const status = req.body?.data?.state || 'desconhecido';
    console.log(`📡 Status da conexão do WhatsApp: ${status}`);
// Webhook universal para gateways de pagamento (Mercado Pago, Asaas, EFI, etc.)
router.post('/pagamento/:provedor', async (req, res) => {
    try {
        const { provedor } = req.params;
        const PaymentService = require('../services/payment/PaymentService');
        const resultado = await PaymentService.processarWebhook(provedor, req.body, req.headers);
        res.status(200).json({ success: true, ...resultado });
    } catch (err) {
        console.error(`❌ Erro no webhook de pagamento [${req.params.provedor}]:`, err.message);
        res.status(200).json({ success: false, message: err.message });
    }
});

module.exports = router;