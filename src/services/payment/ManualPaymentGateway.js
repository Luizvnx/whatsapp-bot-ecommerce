const PaymentGatewayInterface = require('./PaymentGatewayInterface');

/**
 * Provedor Manual de Pagamento Pix
 * Utilizado para operações onde o atendente passa a chave Pix e confere o comprovante
 * diretamente no app do banco (sem taxas de intermediadoras).
 */
class ManualPaymentGateway extends PaymentGatewayInterface {
    constructor() {
        super('manual');
    }

    /**
     * Retorna a chave Pix manual configurada no sistema
     */
    getConfiguracaoManual() {
        return {
            chave: process.env.PIX_CHAVE_MANUAL || process.env.PIX_CHAVE || 'contato@favodemel.com.br',
            tipoChave: process.env.PIX_TIPO_CHAVE || 'E-mail / Telefone',
            beneficiario: process.env.PIX_BENEFICIARIO || 'Apiário Favo de Mel',
            banco: process.env.PIX_BANCO || 'Banco PJ'
        };
    }

    /**
     * Gera uma cobrança Pix manual com as informações da chave e instruções
     */
    async gerarCobrancaPix({ idCliente, valor, descricao, expiracaoMinutos = 1440, dadosExtras = {} }) {
        const config = this.getConfiguracaoManual();
        const idExterno = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const valorFormatado = (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const instrucoes = 
            `🍯 *Instruções para Pagamento via Pix:*\n\n` +
            `💰 *Valor Total:* ${valorFormatado}\n` +
            `🔑 *Chave Pix (${config.tipoChave}):* \`${config.chave}\`\n` +
            `👤 *Beneficiário:* ${config.beneficiario}\n` +
            (config.banco ? `🏦 *Instituição:* ${config.banco}\n\n` : '\n') +
            `📌 *Como concluir seu pedido:*\n` +
            `1. Copie a chave Pix acima e realize a transferência no app do seu banco.\n` +
            `2. Envie o *comprovante aqui nesta conversa*.\n` +
            `3. Nosso atendente já vai confirmar seu pagamento e liberar o despacho! 🐝`;

        const expiraEm = new Date(Date.now() + (expiracaoMinutos * 60 * 1000));

        return {
            sucesso: true,
            idExterno,
            provedor: 'manual',
            status: 'pendente',
            chavePix: config.chave,
            copiaECola: config.chave, // No manual, a chave Pix serve como copia e cola
            qrCodeUrl: null,
            instrucoes,
            expiraEm,
            dadosBrutos: {
                tipo: 'pix_manual',
                beneficiario: config.beneficiario,
                chave: config.chave,
                criadoEm: new Date().toISOString()
            }
        };
    }

    /**
     * No manual, a consulta direta ao banco físico não é possível via API
     */
    async consultarCobranca(idExterno) {
        return {
            idExterno,
            provedor: 'manual',
            status: 'pendente',
            mensagem: 'Pagamento manual deve ser conferido e confirmado pelo atendente no painel.'
        };
    }

    /**
     * No provedor manual, webhooks automáticos não são disparados por bancos convencionais
     */
    async processarWebhook(payload, headers = {}) {
        return {
            processado: false,
            mensagem: 'Provedor manual não utiliza webhook de bancos externos.'
        };
    }
}

module.exports = ManualPaymentGateway;
