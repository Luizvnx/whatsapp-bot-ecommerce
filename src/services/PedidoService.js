const DatabaseService = require('./DatabaseService');
const EvolutionService = require('./EvolutionService');
const SocketService = require('./SocketService');
const config = require('../config');
const crypto = require('crypto');

class PedidoService {
    static pedidosEmMemoria = [];
    /**
     * Gera um código legível de pedido (ex: FD-8392)
     */
    static gerarCodigoPedido() {
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(10 + Math.random() * 90);
        return `FD-${timestamp}${random}`;
    }

    /**
     * Gera um token criptograficamente seguro para URL de rastreio exclusivo
     */
    static gerarTokenAcesso() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Cria e processa um novo pedido vindo do catálogo web
     */
    static async criarPedidoWeb({
        cliente_nome,
        cliente_telefone,
        tipo_entrega = 'entrega',
        endereco = {},
        forma_pagamento = 'pix',
        troco_para = '',
        observacoes = '',
        itens = [],
        subtotal = 0,
        taxa_entrega = 0,
        total = 0
    }) {
        if (!cliente_nome || !cliente_telefone) {
            throw new Error('Nome e WhatsApp do cliente são obrigatórios.');
        }

        if (!Array.isArray(itens) || itens.length === 0) {
            throw new Error('O carrinho não pode estar vazio.');
        }

        const codigo_pedido = this.gerarCodigoPedido();
        const token_acesso = this.gerarTokenAcesso();
        const telefoneLimpo = cliente_telefone.replace(/\D/g, '');
        const id_cliente = `${telefoneLimpo}@s.whatsapp.net`;

        // 1. Salva o pedido no banco de dados com token de segurança
        const sqlPedido = `
            INSERT INTO tb_pedidos (
                codigo_pedido, token_acesso, cliente_nome, cliente_telefone, tipo_entrega,
                endereco, forma_pagamento, troco_para, observacoes,
                itens, subtotal, taxa_entrega, total, status, origem
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'novo', 'catalogo_web')
            RETURNING *;
        `;

        let pedidoSalvo = {
            codigo_pedido,
            token_acesso,
            cliente_nome: cliente_nome.trim(),
            cliente_telefone: telefoneLimpo,
            tipo_entrega,
            endereco,
            forma_pagamento,
            troco_para: troco_para ? String(troco_para).trim() : null,
            observacoes: observacoes ? String(observacoes).trim() : null,
            itens,
            subtotal: parseFloat(subtotal) || 0,
            taxa_entrega: parseFloat(taxa_entrega) || 0,
            total: parseFloat(total) || 0,
            status: 'novo',
            origem: 'catalogo_web',
            criado_em: new Date().toISOString()
        };

        try {
            const resPedido = await DatabaseService.executar(sqlPedido, [
                codigo_pedido,
                token_acesso,
                cliente_nome.trim(),
                telefoneLimpo,
                tipo_entrega,
                JSON.stringify(endereco || {}),
                forma_pagamento,
                troco_para ? String(troco_para).trim() : null,
                observacoes ? String(observacoes).trim() : null,
                JSON.stringify(itens),
                parseFloat(subtotal) || 0,
                parseFloat(taxa_entrega) || 0,
                parseFloat(total) || 0
            ]);
            if (resPedido && resPedido.rows && resPedido.rows.length > 0) {
                pedidoSalvo = resPedido.rows[0];
            }
        } catch (dbErr) {
            console.warn('⚠️ [PEDIDO] DB offline, mantendo pedido salvo em memória para o painel:', dbErr.message);
            PedidoService.pedidosEmMemoria.unshift(pedidoSalvo);
        }

        // 2. Integração com CRM: Cadastra ou atualiza o cliente
        try {
            await DatabaseService.executar(`
                INSERT INTO tb_crm_clientes (
                    id_cliente, telefone, nome, status, etapa_funil, tags, endereco, total_pedidos, ltv, ultima_compra_em
                ) VALUES ($1, $2, $3, 'cliente', 'aguardando_pagamento', ARRAY['catalogo_web', 'pedido_site'], $4, 1, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (id_cliente) DO UPDATE SET
                    nome = COALESCE(EXCLUDED.nome, tb_crm_clientes.nome),
                    endereco = EXCLUDED.endereco,
                    total_pedidos = tb_crm_clientes.total_pedidos + 1,
                    ltv = tb_crm_clientes.ltv + EXCLUDED.ltv,
                    ultima_compra_em = CURRENT_TIMESTAMP,
                    etapa_funil = 'aguardando_pagamento';
            `, [
                id_cliente,
                telefoneLimpo,
                cliente_nome.trim(),
                JSON.stringify(endereco || {}),
                parseFloat(total) || 0
            ]);

            // Cria oportunidade no CRM Kanban
            const tituloOportunidade = `Pedido Site #${codigo_pedido} - ${cliente_nome.trim()}`;
            await DatabaseService.executar(`
                INSERT INTO tb_crm_oportunidades (
                    cliente_id, id_cliente, titulo, valor_estimado, etapa, status, origem, dados_extras
                ) VALUES (
                    (SELECT id FROM tb_crm_clientes WHERE id_cliente = $1 LIMIT 1),
                    $1, $2, $3, 'aguardando_pagamento', 'aberto', 'catalogo_web', $4
                );
            `, [
                id_cliente,
                tituloOportunidade,
                parseFloat(total) || 0,
                JSON.stringify({ codigo_pedido, token_acesso, itens, forma_pagamento, tipo_entrega })
            ]);
        } catch (crmErr) {
            console.error('⚠️ [PEDIDO] Erro ao sincronizar CRM (não impeditivo):', crmErr.message);
        }

        // 3. Monta o texto resumido do pedido
        const linhasItens = itens.map(i => {
            const nomeItem = i.nome || 'Produto';
            const qtd = i.quantidade || 1;
            const precoUnit = parseFloat(i.preco || 0).toFixed(2).replace('.', ',');
            const sub = (qtd * parseFloat(i.preco || 0)).toFixed(2).replace('.', ',');
            return `🍯 ${qtd}x *${nomeItem}* (R$ ${precoUnit} un) = R$ ${sub}`;
        }).join('\n');

        let textoEndereco = '';
        if (tipo_entrega === 'entrega' && endereco) {
            const rua = endereco.rua ? `${endereco.rua}` : '';
            const num = endereco.numero ? `, nº ${endereco.numero}` : '';
            const bairro = endereco.bairro ? ` - ${endereco.bairro}` : '';
            const cidade = endereco.cidade ? ` - ${endereco.cidade}` : '';
            const comp = endereco.complemento ? ` (${endereco.complemento})` : '';
            textoEndereco = `📍 *Endereço de Entrega:* ${rua}${num}${bairro}${cidade}${comp}`;
        } else {
            textoEndereco = `🏪 *Modalidade:* Retirada no Apiário Favo de Mel`;
        }

        let textoPagamento = '';
        if (forma_pagamento === 'pix') {
            textoPagamento = `💳 *Forma de Pagamento:* PIX (Chave: 79988125726)`;
        } else if (forma_pagamento === 'cartao') {
            textoPagamento = `💳 *Forma de Pagamento:* Cartão na Entrega`;
        } else if (forma_pagamento === 'dinheiro') {
            const trocoMsg = troco_para ? ` (Troco para R$ ${troco_para})` : ' (Não precisa de troco)';
            textoPagamento = `💵 *Forma de Pagamento:* Dinheiro${trocoMsg}`;
        } else {
            textoPagamento = `💳 *Forma de Pagamento:* ${forma_pagamento}`;
        }

        const textoObs = observacoes ? `\n📝 *Observações:* ${observacoes}` : '';
        const totalFormatado = parseFloat(total).toFixed(2).replace('.', ',');
        const subtotalFormatado = parseFloat(subtotal).toFixed(2).replace('.', ',');

        // URL personalizada de rastreamento do cliente
        const siteBase = (config.store?.siteUrl || 'https://apiariofavodemel.com.br').replace(/\/$/, '');
        const urlRastreio = `${siteBase}/pedido.html?codigo=${codigo_pedido}&token=${token_acesso}`;

        const mensagemResumoVendedor = 
`🍯 *NOVO PEDIDO DO SITE - APIÁRIO FAVO DE MEL* 🐝
📦 *Pedido:* #${codigo_pedido}
👤 *Cliente:* ${cliente_nome}
📱 *WhatsApp:* ${cliente_telefone}

${textoEndereco}
${textoPagamento}${textoObs}

🛒 *Itens do Pedido:*
${linhasItens}

💰 *Subtotal:* R$ ${subtotalFormatado}
🛵 *Taxa de Entrega:* A combinar
⭐ *TOTAL:* R$ ${totalFormatado}

🔗 *Link de Rastreio do Cliente:*
${urlRastreio}

_Gerencie e despache este pedido no Painel Trem Delivery do Apiário._`;

        // 4. Dispara a notificação para o WhatsApp do vendedor (NUMERO_DA_LOJA)
        const numeroVendedor = process.env.NUMERO_DA_LOJA || config.store?.number || '557988125726';
        let vendedorNotificado = false;

        try {
            console.log(`📦 Enviando notificação de novo pedido #${codigo_pedido} para vendedor ${numeroVendedor}...`);
            const respVend = await EvolutionService.enviarMensagemText(numeroVendedor, mensagemResumoVendedor);
            if (respVend?.key?.id) {
                try {
                    const WebhookController = require('../controllers/WebhookController');
                    WebhookController.registrarMensagemEnviadaPeloSistema(respVend.key.id);
                } catch (_) {}
            }
            vendedorNotificado = true;
            console.log(`✅ Vendedor notificado com sucesso via WhatsApp!`);
        } catch (notifErr) {
            console.warn(`⚠️ Não foi possível disparar aviso automático ao vendedor via API: ${notifErr.message}`);
        }

        // 5. Emite evento em tempo real via WebSocket para o Painel Trem Delivery
        try {
            SocketService.emitirNovoPedido({
                ...pedidoSalvo,
                token_acesso,
                tracking_url: urlRastreio
            });
        } catch (sockErr) {
            console.warn('⚠️ Erro ao emitir socket novo_pedido:', sockErr.message);
        }

        // 6. Monta a URL direta do WhatsApp (wa.me) para o cliente abrir com o pedido já digitado
        const numeroDestinoLink = numeroVendedor.replace(/\D/g, '');
        const mensagemCliente = `Olá! Acabei de fazer o pedido *#${codigo_pedido}* pelo site do Apiário Favo de Mel:\n\n${mensagemResumoVendedor}`;
        const whatsappUrl = `https://wa.me/${numeroDestinoLink}?text=${encodeURIComponent(mensagemCliente)}`;

        return {
            sucesso: true,
            codigo_pedido,
            token_acesso,
            tracking_url: urlRastreio,
            pedido: pedidoSalvo,
            vendedor_notificado: vendedorNotificado,
            whatsapp_url: whatsappUrl,
            chave_pix: '79988125726'
        };
    }

    /**
     * Retorna todos os pedidos para o painel de atendimento (Trem Delivery)
     */
    static async listarPedidos(limite = 100) {
        const sql = `
            SELECT * FROM tb_pedidos 
            ORDER BY criado_em DESC 
            LIMIT $1;
        `;
        try {
            const res = await DatabaseService.executar(sql, [limite]);
            return res.rows;
        } catch (dbErr) {
            console.warn('⚠️ [PEDIDO] DB offline ao listar pedidos, retornando memória:', dbErr.message);
            return PedidoService.pedidosEmMemoria || [];
        }
    }

    /**
     * Retorna um pedido específico por código
     */
    static async obterPedidoPorCodigo(codigo) {
        const sql = `SELECT * FROM tb_pedidos WHERE codigo_pedido = $1`;
        try {
            const res = await DatabaseService.executar(sql, [codigo]);
            if (res.rows && res.rows[0]) return res.rows[0];
        } catch (dbErr) {
            console.warn('⚠️ [PEDIDO] DB offline ao buscar pedido, checando memória:', dbErr.message);
        }
        return (PedidoService.pedidosEmMemoria || []).find(p => p.codigo_pedido === codigo) || null;
    }

    /**
     * Atualiza o status de um pedido e notifica cliente e painéis em tempo real
     */
    static async atualizarStatusPedido(codigo, status, { notificar_cliente = true, motivo_cancelamento = '' } = {}) {
        const sql = `
            UPDATE tb_pedidos 
            SET status = $1, atualizado_em = CURRENT_TIMESTAMP 
            WHERE codigo_pedido = $2
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [status, codigo]);
        const pedidoAtualizado = res.rows[0];

        if (!pedidoAtualizado) {
            throw new Error(`Pedido #${codigo} não encontrado.`);
        }

        // 1. Atualiza oportunidade no CRM Kanban se existir
        try {
            const etapaMap = {
                'novo': 'aguardando_pagamento',
                'em_preparo': 'aguardando_pagamento',
                'saiu_entrega': 'aguardando_pagamento',
                'pronto': 'aguardando_pagamento',
                'entregue': 'fechamento',
                'cancelado': 'fechamento'
            };
            const statusKanban = status === 'entregue' ? 'ganho' : (status === 'cancelado' ? 'perdido' : 'aberto');
            await DatabaseService.executar(`
                UPDATE tb_crm_oportunidades 
                SET etapa = COALESCE($1, etapa), status = $2, atualizado_em = CURRENT_TIMESTAMP
                WHERE dados_extras->>'codigo_pedido' = $3;
            `, [etapaMap[status], statusKanban, codigo]);
        } catch (crmErr) {
            console.warn('⚠️ Erro ao atualizar oportunidade Kanban do pedido:', crmErr.message);
        }

        // 2. Emite WebSocket para o Painel Trem Delivery e tela do Cliente
        try {
            SocketService.emitirStatusPedidoAtualizado(pedidoAtualizado);
        } catch (sockErr) {
            console.warn('⚠️ Erro ao emitir socket pedido_status_atualizado:', sockErr.message);
        }

        // 3. Notifica o cliente via WhatsApp se habilitado
        if (notificar_cliente && pedidoAtualizado.cliente_telefone) {
            try {
                const siteBase = (config.store?.siteUrl || 'https://apiariofavodemel.com.br').replace(/\/$/, '');
                const urlRastreio = `${siteBase}/pedido.html?codigo=${codigo}&token=${pedidoAtualizado.token_acesso || ''}`;
                const primeiroNome = (pedidoAtualizado.cliente_nome || 'Cliente').split(' ')[0];

                let textoMsg = '';
                if (status === 'em_preparo') {
                    textoMsg = `🍯 *Apiário Favo de Mel*\n\nOlá, *${primeiroNome}*! Seu pedido *#${codigo}* foi confirmado e já está sendo preparado com todo o carinho e pureza!\n\n🔗 *Acompanhe seu pedido:*\n${urlRastreio}`;
                } else if (status === 'saiu_entrega') {
                    textoMsg = `🛵 *Apiário Favo de Mel*\n\nÓtima notícia, *${primeiroNome}*! Seu pedido *#${codigo}* acabou de sair para entrega e logo chegará até você!\n\n🔗 *Acompanhe a rota:*\n${urlRastreio}`;
                } else if (status === 'pronto') {
                    textoMsg = `🏪 *Apiário Favo de Mel*\n\n*${primeiroNome}*, seu pedido *#${codigo}* já está embalado e prontinho para retirada no Apiário Favo de Mel!\n\n🔗 *Ver detalhes:*\n${urlRastreio}`;
                } else if (status === 'entregue') {
                    textoMsg = `🐝 *Apiário Favo de Mel*\n\nPedido *#${codigo}* entregue com sucesso!\nEsperamos que desfrute de todo o sabor e benefícios dos nossos méis e produtos naturais.\n\nMuito obrigado pela confiança! Se precisar de algo mais, estamos à disposição por aqui. 🍯`;
                } else if (status === 'cancelado') {
                    const motivo = motivo_cancelamento ? ` Motivo: ${motivo_cancelamento}.` : '';
                    textoMsg = `⚠️ *Apiário Favo de Mel*\n\nOlá, *${primeiroNome}*. Seu pedido *#${codigo}* foi cancelado.${motivo} Se tiver dúvidas, estamos à disposição.`;
                }

                if (textoMsg) {
                    const respNotif = await EvolutionService.enviarMensagemText(pedidoAtualizado.cliente_telefone, textoMsg);
                    const msgIdNotif = respNotif?.key?.id || null;
                    if (msgIdNotif) {
                        try {
                            const WebhookController = require('../controllers/WebhookController');
                            WebhookController.registrarMensagemEnviadaPeloSistema(msgIdNotif);
                        } catch (_) {}
                    }
                    try {
                        const SessionService = require('./SessionService');
                        await SessionService.adicionarMensagem(pedidoAtualizado.cliente_telefone, 'atendente', textoMsg, null, {
                            tipo: 'texto',
                            atendenteNome: 'Bot Favo de Mel',
                            messageId: msgIdNotif,
                            whatsappMessageId: msgIdNotif
                        });
                    } catch (_) {}
                }
            } catch (waErr) {
                console.warn('⚠️ Erro ao disparar notificação de status para o cliente:', waErr.message);
            }
        }

        return pedidoAtualizado;
    }
}

module.exports = PedidoService;
