const DatabaseService = require('../DatabaseService');
const CrmClienteService = require('../CrmClienteService');
const CrmPipelineService = require('../CrmPipelineService');
const SocketService = require('../SocketService');
const EvolutionService = require('../EvolutionService');

const ManualPaymentGateway = require('./ManualPaymentGateway');
const MercadoPagoGateway = require('./MercadoPagoGateway');

class PaymentService {
    static gateways = {
        'manual': new ManualPaymentGateway(),
        'mercadopago': new MercadoPagoGateway()
    };

    /**
     * Retorna a instância do gateway de pagamento ativo
     */
    static getGateway(provedor = null) {
        const prov = provedor || process.env.PAYMENT_PROVIDER || 'manual';
        return this.gateways[prov] || this.gateways['manual'];
    }

    /**
     * Gera uma cobrança Pix (manual ou automática) vinculada a um cliente e oportunidade no funil
     */
    static async gerarCobrancaPix({ idCliente, valor, descricao, oportunidadeId = null, dadosExtras = {} }) {
        const gateway = this.getGateway();
        const idCanonico = CrmClienteService.normalizarId(idCliente);
        const valorNum = parseFloat(valor) || 0.00;

        try {
            // 1. Gera a cobrança no gateway selecionado
            const resultado = await gateway.gerarCobrancaPix({
                idCliente: idCanonico,
                valor: valorNum,
                descricao: descricao || 'Pedido Apiário Favo de Mel',
                dadosExtras
            });

            // 2. Registra a cobrança na tabela tb_cobrancas_pix
            const sql = `
                INSERT INTO tb_cobrancas_pix (
                    id_cliente, oportunidade_id, provedor, id_externo, valor, status, chave_pix, copia_e_cola, qr_code_url, dados_brutos
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;

            const res = await DatabaseService.executar(sql, [
                idCanonico,
                oportunidadeId,
                resultado.provedor || 'manual',
                resultado.idExterno,
                valorNum,
                resultado.status || 'pendente',
                resultado.chavePix || null,
                resultado.copiaECola || null,
                resultado.linkPagamento || null,
                JSON.stringify(resultado.dadosBrutos || {})
            ]);

            const cobranca = res.rows[0];

            return {
                sucesso: true,
                cobrancaId: cobranca.id,
                ...resultado
            };
        } catch (err) {
            console.error('[PaymentService] Erro ao gerar cobrança Pix:', err.message);
            throw err;
        }
    }

    /**
     * Confirmação MANUAL de pagamento por um atendente no painel/chat
     */
    static async confirmarPagamentoManual(idOportunidadeOuCliente, atendenteNome = 'Atendente') {
        try {
            let oportunidade = null;
            let idClienteFinal = null;
            let valorFinal = 0.00;
            let opId = null;

            // Se for número (ID da oportunidade)
            if (Number.isInteger(Number(idOportunidadeOuCliente)) && !String(idOportunidadeOuCliente).includes('@')) {
                oportunidade = await CrmPipelineService.obterPorId(Number(idOportunidadeOuCliente));
                if (oportunidade) {
                    idClienteFinal = oportunidade.id_cliente;
                    valorFinal = parseFloat(oportunidade.valor_estimado) || 0.00;
                    opId = oportunidade.id;
                }
            } else {
                idClienteFinal = CrmClienteService.normalizarId(idOportunidadeOuCliente);
                const cliente = await CrmClienteService.obterPorIdOuJid(idClienteFinal);
                if (cliente) {
                    // Busca oportunidade aberta mais recente
                    const buscaOp = await DatabaseService.executar(
                        `SELECT * FROM tb_crm_oportunidades WHERE cliente_id = $1 ORDER BY (status = 'aberto') DESC, atualizado_em DESC LIMIT 1`,
                        [cliente.id]
                    );
                    if (buscaOp.rows.length > 0) {
                        oportunidade = buscaOp.rows[0];
                        opId = oportunidade.id;
                        valorFinal = parseFloat(oportunidade.valor_estimado) || 0.00;
                    }
                }
            }

            if (!idClienteFinal) {
                throw new Error('Identificador de cliente ou oportunidade não localizado.');
            }

            // Se o valor estimado da oportunidade for 0, tenta buscar na última cobrança pendente
            if (valorFinal <= 0) {
                const buscaCob = await DatabaseService.executar(
                    `SELECT valor FROM tb_cobrancas_pix WHERE id_cliente = $1 AND status = 'pendente' ORDER BY criado_em DESC LIMIT 1`,
                    [idClienteFinal]
                );
                if (buscaCob.rows.length > 0) {
                    valorFinal = parseFloat(buscaCob.rows[0].valor) || 0.00;
                }
            }

            // 1. Finaliza a venda no CRM e Pipeline
            const resultado = await this.finalizarVendaNoCrm({
                idCliente: idClienteFinal,
                valor: valorFinal,
                oportunidadeId: opId,
                confirmadoPor: atendenteNome,
                provedor: 'manual'
            });

            // 2. Dispara mensagem de confirmação para o WhatsApp do cliente
            const numeroEnvio = idClienteFinal.split('@')[0];
            const valorFmt = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            const textoConfirmacao = 
                `🍯 *Pagamento Confirmado com Sucesso!*\n\n` +
                `Recebemos a confirmação do seu Pix no valor de *${valorFmt}*.\n` +
                `Seu pedido já entrou em separação com nossa equipe e logo estará a caminho! 🐝✨\n\n` +
                `Agradecemos muito pela preferência e confiança no *Apiário Favo de Mel*!`;

            try {
                await EvolutionService.enviarMensagemText(numeroEnvio, textoConfirmacao);
            } catch (wppErr) {
                console.warn('⚠️ [PaymentService] Aviso ao enviar confirmação no WhatsApp:', wppErr.message);
            }

            return resultado;
        } catch (err) {
            console.error('[PaymentService] Erro na confirmação manual de pagamento:', err.message);
            throw err;
        }
    }

    /**
     * Processa webhook oficial disparado por gateways automáticos (Mercado Pago, Asaas, EFI, etc.)
     */
    static async processarWebhook(provedor, payload, headers = {}) {
        const gateway = this.getGateway(provedor);
        if (!gateway) {
            return { processado: false, motivo: `Provedor ${provedor} não suportado.` };
        }

        try {
            const resultado = await gateway.processarWebhook(payload, headers);

            if (resultado.processado && resultado.status === 'pago') {
                // Localiza a cobrança pelo id_externo
                const busca = await DatabaseService.executar(
                    'SELECT * FROM tb_cobrancas_pix WHERE id_externo = $1 LIMIT 1',
                    [resultado.idExterno]
                );

                if (busca.rows.length > 0) {
                    const cobranca = busca.rows[0];
                    if (cobranca.status !== 'pago') {
                        await this.finalizarVendaNoCrm({
                            idCliente: cobranca.id_cliente,
                            valor: parseFloat(cobranca.valor),
                            oportunidadeId: cobranca.oportunidade_id,
                            cobrancaId: cobranca.id,
                            confirmadoPor: `webhook_${provedor}`,
                            provedor
                        });

                        // Notifica cliente no WhatsApp
                        const numeroEnvio = cobranca.id_cliente.split('@')[0];
                        const valorFmt = parseFloat(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                        const msgAuto = 
                            `⚡ *Pix Recebido com Sucesso!*\n\n` +
                            `Identificamos automaticamente o seu pagamento de *${valorFmt}*.\n` +
                            `Nosso apiário já está embalando o seu pedido! 🐝🍯`;

                        EvolutionService.enviarMensagemText(numeroEnvio, msgAuto).catch(console.warn);
                    }
                }
            }

            return resultado;
        } catch (err) {
            console.error(`[PaymentService] Erro ao processar webhook do ${provedor}:`, err.message);
            throw err;
        }
    }

    /**
     * Consolidação central da venda no CRM, LTV e Funil
     */
    static async finalizarVendaNoCrm({ idCliente, valor, oportunidadeId = null, cobrancaId = null, confirmadoPor = 'Atendente', provedor = 'manual' }) {
        const idCanonico = CrmClienteService.normalizarId(idCliente);
        const valorNum = parseFloat(valor) || 0.00;

        // 1. Atualiza registro na tabela de cobranças
        if (cobrancaId) {
            await DatabaseService.executar(`
                UPDATE tb_cobrancas_pix 
                SET status = 'pago', pago_em = CURRENT_TIMESTAMP, confirmado_por = $1, atualizado_em = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [confirmadoPor, cobrancaId]);
        } else if (oportunidadeId) {
            await DatabaseService.executar(`
                UPDATE tb_cobrancas_pix 
                SET status = 'pago', pago_em = CURRENT_TIMESTAMP, confirmado_por = $1, atualizado_em = CURRENT_TIMESTAMP
                WHERE oportunidade_id = $2 AND status = 'pendente'
            `, [confirmadoPor, oportunidadeId]);
        }

        // 2. Move a oportunidade para 'pedido_fechado' / 'ganho'
        if (oportunidadeId) {
            await CrmPipelineService.atualizarEtapa(oportunidadeId, 'pedido_fechado');
        } else {
            await CrmPipelineService.sincronizarEtapaComBot(idCanonico, 'pedido_fechado', { valor: valorNum });
        }

        // 3. Registra a compra e LTV no perfil do cliente
        const clienteAtualizado = await CrmClienteService.registrarCompra(idCanonico, valorNum);
        await CrmClienteService.adicionarTag(idCanonico, 'pedido_realizado');
        await CrmClienteService.removerTag(idCanonico, 'aguardando_pix');

        // 4. Notifica o painel em tempo real via WebSocket
        try {
            SocketService.emitirPipelineAtualizado({
                acao: 'pagamento_confirmado',
                idCliente: idCanonico,
                valor: valorNum,
                confirmadoPor
            });
        } catch (_) {}

        return {
            sucesso: true,
            idCliente: idCanonico,
            valor: valorNum,
            cliente: clienteAtualizado
        };
    }
}

module.exports = PaymentService;
