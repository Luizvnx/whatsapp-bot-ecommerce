const DatabaseService = require('./DatabaseService');
const EvolutionService = require('./EvolutionService');
const config = require('../config');

class PedidoService {
    /**
     * Gera um código legível de pedido (ex: FD-8392)
     */
    static gerarCodigoPedido() {
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(10 + Math.random() * 90);
        return `FD-${timestamp}${random}`;
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
        const telefoneLimpo = cliente_telefone.replace(/\D/g, '');
        const id_cliente = `${telefoneLimpo}@s.whatsapp.net`;

        // 1. Salva o pedido no banco de dados
        const sqlPedido = `
            INSERT INTO tb_pedidos (
                codigo_pedido, cliente_nome, cliente_telefone, tipo_entrega,
                endereco, forma_pagamento, troco_para, observacoes,
                itens, subtotal, taxa_entrega, total, status, origem
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'novo', 'catalogo_web')
            RETURNING *;
        `;

        const resPedido = await DatabaseService.executar(sqlPedido, [
            codigo_pedido,
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

        const pedidoSalvo = resPedido.rows[0];

        // 2. Integração com CRM: Cadastra ou atualiza o cliente
        try {
            await DatabaseService.executar(`
                INSERT INTO tb_crm_clientes (
                    id_cliente, telefone, nome, status, etapa_funil, tags, endereco, total_pedidos, ltv, ultima_compra_em
                ) VALUES ($1, $2, $3, 'cliente', 'fechamento', ARRAY['catalogo_web', 'pedido_site'], $4, 1, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (id_cliente) DO UPDATE SET
                    nome = COALESCE(EXCLUDED.nome, tb_crm_clientes.nome),
                    endereco = EXCLUDED.endereco,
                    total_pedidos = tb_crm_clientes.total_pedidos + 1,
                    ltv = tb_crm_clientes.ltv + EXCLUDED.ltv,
                    ultima_compra_em = CURRENT_TIMESTAMP,
                    etapa_funil = 'fechamento';
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
                JSON.stringify({ codigo_pedido, itens, forma_pagamento, tipo_entrega })
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
            return `• ${qtd}x *${nomeItem}* (R$ ${precoUnit} un) = R$ ${sub}`;
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
            textoEndereco = `📍 *Modalidade:* 🏪 Retirada no Apiário Favo de Mel`;
        }

        let textoPagamento = '';
        if (forma_pagamento === 'pix') {
            textoPagamento = `💳 *Forma de Pagamento:* PIX`;
        } else if (forma_pagamento === 'cartao') {
            textoPagamento = `💳 *Forma de Pagamento:* Cartão na Entrega`;
        } else if (forma_pagamento === 'dinheiro') {
            const trocoMsg = troco_para ? ` (Troco para R$ ${troco_para})` : ' (Não precisa de troco)';
            textoPagamento = `💳 *Forma de Pagamento:* Dinheiro${trocoMsg}`;
        } else {
            textoPagamento = `💳 *Forma de Pagamento:* ${forma_pagamento}`;
        }

        const textoObs = observacoes ? `\n📝 *Observações:* ${observacoes}` : '';

        const totalFormatado = parseFloat(total).toFixed(2).replace('.', ',');
        const subtotalFormatado = parseFloat(subtotal).toFixed(2).replace('.', ',');

        const mensagemResumo = 
`🍯 *NOVO PEDIDO DO SITE - APIÁRIO FAVO DE MEL* 🐝
📋 *Pedido:* #${codigo_pedido}
👤 *Cliente:* ${cliente_nome}
📱 *WhatsApp:* ${cliente_telefone}

${textoEndereco}
${textoPagamento}${textoObs}

🛒 *Itens do Pedido:*
${linhasItens}

💰 *Subtotal:* R$ ${subtotalFormatado}
🚚 *Taxa de Entrega:* A combinar
✨ *TOTAL:* R$ ${totalFormatado}

_Aguardando confirmação e atendimento da equipe Favo de Mel._`;

        // 4. Dispara a notificação para o WhatsApp do vendedor (NUMERO_DA_LOJA)
        const numeroVendedor = process.env.NUMERO_DA_LOJA || config.store?.number || '557988125726';
        let vendedorNotificado = false;

        try {
            console.log(`📤 Enviando notificação de novo pedido #${codigo_pedido} para vendedor ${numeroVendedor}...`);
            await EvolutionService.enviarMensagemText(numeroVendedor, mensagemResumo);
            vendedorNotificado = true;
            console.log(`✅ Vendedor notificado com sucesso via WhatsApp!`);
        } catch (notifErr) {
            console.warn(`⚠️ Não foi possível disparar aviso automático ao vendedor via API: ${notifErr.message}`);
        }

        // 5. Monta a URL direta do WhatsApp (wa.me) para o cliente abrir com o pedido já digitado
        const numeroDestinoLink = numeroVendedor.replace(/\D/g, '');
        const mensagemCliente = `Olá! Acabei de fazer o pedido *#${codigo_pedido}* pelo site do Apiário Favo de Mel:\n\n${mensagemResumo}`;
        const whatsappUrl = `https://wa.me/${numeroDestinoLink}?text=${encodeURIComponent(mensagemCliente)}`;

        return {
            sucesso: true,
            codigo_pedido,
            pedido: pedidoSalvo,
            vendedor_notificado: vendedorNotificado,
            whatsapp_url: whatsappUrl,
            chave_pix: '79988125726' // Chave PIX padrão (telefone do Apiário)
        };
    }

    /**
     * Retorna todos os pedidos para o painel de atendimento
     */
    static async listarPedidos(limite = 50) {
        const sql = `
            SELECT * FROM tb_pedidos 
            ORDER BY criado_em DESC 
            LIMIT $1
        `;
        const res = await DatabaseService.executar(sql, [limite]);
        return res.rows;
    }

    /**
     * Retorna um pedido específico por código
     */
    static async obterPedidoPorCodigo(codigo) {
        const sql = `SELECT * FROM tb_pedidos WHERE codigo_pedido = $1`;
        const res = await DatabaseService.executar(sql, [codigo]);
        return res.rows[0] || null;
    }

    /**
     * Atualiza o status de um pedido
     */
    static async atualizarStatusPedido(codigo, status) {
        const sql = `
            UPDATE tb_pedidos 
            SET status = $1, atualizado_em = CURRENT_TIMESTAMP 
            WHERE codigo_pedido = $2
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [status, codigo]);
        return res.rows[0] || null;
    }
}

module.exports = PedidoService;
