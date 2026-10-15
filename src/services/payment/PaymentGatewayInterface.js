/**
 * Interface base para os provedores de Gateway de Pagamento (Pix).
 * Todos os gateways concretos (Manual, Mercado Pago, Asaas, EFI, etc.)
 * devem implementar estes métodos garantindo interoperabilidade plugável.
 */
class PaymentGatewayInterface {
    constructor(nomeProvedor) {
        this.nomeProvedor = nomeProvedor;
    }

    /**
     * Gera uma nova cobrança Pix
     * @param {Object} params
     * @param {string} params.idCliente JID ou telefone do cliente
     * @param {number} params.valor Valor em reais (ex: 120.00)
     * @param {string} params.descricao Descrição exibida no comprovante
     * @param {number} [params.expiracaoMinutos=60] Tempo de expiração do Pix
     * @param {Object} [params.dadosExtras={}] Metadados adicionais
     * @returns {Promise<{
     *   sucesso: boolean,
     *   idExterno: string,
     *   provedor: string,
     *   status: 'pendente' | 'pago' | 'falha',
     *   copiaECola?: string,
     *   qrCodeUrl?: string,
     *   chavePix?: string,
     *   instrucoes: string,
     *   expiraEm: Date,
     *   dadosBrutos?: Object
     * }>}
     */
    async gerarCobrancaPix(params) {
        throw new Error(`Método gerarCobrancaPix não implementado no provedor ${this.nomeProvedor}`);
    }

    /**
     * Consulta o status atual de uma cobrança junto ao provedor
     * @param {string} idExterno ID da cobrança no gateway
     * @returns {Promise<{ status: string, pagoEm?: Date, valor?: number }>}
     */
    async consultarCobranca(idExterno) {
        throw new Error(`Método consultarCobranca não implementado no provedor ${this.nomeProvedor}`);
    }

    /**
     * Processa a notificação (Webhook) recebida do gateway
     * @param {Object} payload Corpo da requisição recebida
     * @param {Object} headers Headers da requisição
     * @returns {Promise<{
     *   processado: boolean,
     *   idExterno: string,
     *   status: 'pago' | 'pendente' | 'cancelado',
     *   valor?: number,
     *   pagoEm?: Date
     * }>}
     */
    async processarWebhook(payload, headers = {}) {
        throw new Error(`Método processarWebhook não implementado no provedor ${this.nomeProvedor}`);
    }
}

module.exports = PaymentGatewayInterface;
