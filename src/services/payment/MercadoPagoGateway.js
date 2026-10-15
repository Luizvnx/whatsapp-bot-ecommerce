const PaymentGatewayInterface = require('./PaymentGatewayInterface');

/**
 * Provedor Automático de Pagamento Pix - Mercado Pago
 * Totalmente estruturado e pronto para uso assim que o usuário
 * configurar MERCADOPAGO_ACCESS_TOKEN no .env.
 */
class MercadoPagoGateway extends PaymentGatewayInterface {
    constructor() {
        super('mercadopago');
        this.baseUrl = 'https://api.mercadopago.com';
    }

    getAccessToken() {
        return process.env.MERCADOPAGO_ACCESS_TOKEN || null;
    }

    /**
     * Gera uma cobrança Pix dinâmica com QR Code e Copia e Cola no Mercado Pago
     */
    async gerarCobrancaPix({ idCliente, valor, descricao, expiracaoMinutos = 60, dadosExtras = {} }) {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('Token do Mercado Pago (MERCADOPAGO_ACCESS_TOKEN) não configurado no .env');
        }

        const emailCliente = dadosExtras.email || `${idCliente.split('@')[0]}@cliente.whatsapp`;
        const nomeCliente = dadosExtras.nome || 'Cliente WhatsApp';

        const body = {
            transaction_amount: Number(parseFloat(valor).toFixed(2)),
            description: descricao || 'Pedido Apiário Favo de Mel',
            payment_method_id: 'pix',
            payer: {
                email: emailCliente,
                first_name: nomeCliente
            },
            date_of_expiration: new Date(Date.now() + (expiracaoMinutos * 60 * 1000)).toISOString()
        };

        const res = await fetch(`${this.baseUrl}/v1/payments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': `pix_${idCliente}_${Date.now()}`
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('[MercadoPagoGateway] Erro na API:', data);
            throw new Error(data.message || 'Falha ao gerar Pix no Mercado Pago');
        }

        const pointOfInteraction = data.point_of_interaction?.transaction_data;
        const copiaECola = pointOfInteraction?.qr_code || '';
        const qrCodeBase64 = pointOfInteraction?.qr_code_base64 || '';
        const ticketUrl = pointOfInteraction?.ticket_url || '';

        const instrucoes = 
            `🍯 *Seu Pix foi gerado com sucesso!*\n\n` +
            `💰 *Valor:* R$ ${parseFloat(valor).toFixed(2)}\n\n` +
            `👇 *Copie o código abaixo e pague no seu banco:*\n\n` +
            `\`${copiaECola}\`\n\n` +
            `⚡ *Assim que você pagar, nosso sistema identificará automaticamente em poucos segundos!*`;

        return {
            sucesso: true,
            idExterno: String(data.id),
            provedor: 'mercadopago',
            status: data.status === 'approved' ? 'pago' : 'pendente',
            copiaECola,
            qrCodeBase64,
            linkPagamento: ticketUrl,
            instrucoes,
            expiraEm: new Date(data.date_of_expiration),
            dadosBrutos: data
        };
    }

    /**
     * Consulta o status do pagamento no Mercado Pago
     */
    async consultarCobranca(idExterno) {
        const token = this.getAccessToken();
        if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');

        const res = await fetch(`${this.baseUrl}/v1/payments/${idExterno}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Erro ao consultar pagamento no Mercado Pago');

        let statusFinal = 'pendente';
        if (data.status === 'approved') statusFinal = 'pago';
        else if (data.status === 'cancelled' || data.status === 'rejected') statusFinal = 'cancelado';

        return {
            sucesso: true,
            idExterno: String(data.id),
            provedor: 'mercadopago',
            status: statusFinal,
            valor: data.transaction_amount,
            pagoEm: data.date_approved ? new Date(data.date_approved) : null,
            dadosBrutos: data
        };
    }

    /**
     * Processa webhook oficial do Mercado Pago
     */
    async processarWebhook(payload, headers = {}) {
        const token = this.getAccessToken();
        if (!token) return { processado: false, motivo: 'MERCADOPAGO_ACCESS_TOKEN ausente' };

        // Mercado Pago envia { type: 'payment', data: { id: '...' } } ou { action: 'payment.updated', data: { id: '...' } }
        const paymentId = payload?.data?.id || payload?.id;
        if (!paymentId) {
            return { processado: false, motivo: 'ID de pagamento não encontrado no webhook' };
        }

        const info = await this.consultarCobranca(paymentId);
        return {
            processado: true,
            idExterno: String(paymentId),
            provedor: 'mercadopago',
            status: info.status,
            valor: info.valor,
            pagoEm: info.pagoEm,
            dados: info.dadosBrutos
        };
    }
}

module.exports = MercadoPagoGateway;
