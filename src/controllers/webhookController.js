const PedidoRepository = require('../repositories/pedidoRepository');

class WebhookController {
    static async processarNotificacaoPix(req, res) {
        const payload = req.body;
        const transacaoId = payload.id;
        const statusTransacao = payload.status;
        console.log(`[Webhook] Notificação recebida. ID: ${transacaoId} | Status: ${statusTransacao}`);

        if (statusTransacao === 'approved') {
            try {
                const atualizado = await PedidoRepository.atualizarStatusPagamento(transacaoId, 'pago');
                if (atualizado) {
                    console.log('✅ Banco de dados atualizado: Pedido pago!');
                }
                else {
                    console.warn('⚠️ Transação recebida, mas nenhum pedido correspondente encontrado no banco.');
                }
            } catch (erro) {
                console.error('❌ Erro de banco de dados:', erro);
                return res.status(500).send('Erro interno');
            }
        }
        res.status(200).send('Notificação recebida com sucesso');
    }
}

module.exports = WebhookController;