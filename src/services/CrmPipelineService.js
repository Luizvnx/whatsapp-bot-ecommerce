const DatabaseService = require('./DatabaseService');
const CrmClienteService = require('./CrmClienteService');
const SocketService = require('./SocketService');

const ETAPAS_FUNIL = [
    { id: 'novo_lead', titulo: 'Novo Lead', cor: 'stone', badge: 'bg-stone-100 text-stone-700 border-stone-300' },
    { id: 'qualificacao', titulo: 'Qualificação / Dúvida', cor: 'blue', badge: 'bg-blue-50 text-blue-700 border-blue-300' },
    { id: 'carrinho_aberto', titulo: 'Carrinho Aberto', cor: 'amber', badge: 'bg-amber-50 text-amber-700 border-amber-300' },
    { id: 'aguardando_pagamento', titulo: 'Aguardando Pagamento', cor: 'purple', badge: 'bg-purple-50 text-purple-700 border-purple-300' },
    { id: 'pedido_fechado', titulo: 'Pedido Fechado', cor: 'emerald', badge: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { id: 'pos_venda', titulo: 'Pós-Venda', cor: 'cyan', badge: 'bg-cyan-50 text-cyan-700 border-cyan-300' }
];

const MAPA_BOT_PARA_ETAPA = {
    'inicio': 'novo_lead',
    'menu_principal': 'qualificacao',
    'conversando_com_ia': 'qualificacao',
    'consultoria_aguardando': 'qualificacao',
    'resgate_aguardando': 'qualificacao',
    'em_atendimento_humano': 'qualificacao',
    'aguardando_categoria': 'carrinho_aberto',
    'aguardando_produto': 'carrinho_aberto',
    'aguardando_quantidade': 'carrinho_aberto',
    'carrinho_opcoes': 'carrinho_aberto',
    'aguardando_dados_entrega': 'aguardando_pagamento',
    'pedido_fechado': 'pedido_fechado',
    'pos_venda': 'pos_venda'
};

const ORDEM_ETAPAS = {
    'novo_lead': 1,
    'qualificacao': 2,
    'carrinho_aberto': 3,
    'aguardando_pagamento': 4,
    'pedido_fechado': 5,
    'pos_venda': 6
};

class CrmPipelineService {

    static obterEtapas() {
        return ETAPAS_FUNIL;
    }

    /**
     * Lista todas as oportunidades organizadas por coluna do Kanban com filtros e métricas
     */
    static async listarKanban(filtros = {}) {
        const { busca, status, tag, responsavel_id } = filtros;

        let sql = `
            SELECT 
                o.id,
                o.cliente_id,
                o.id_cliente,
                o.titulo,
                o.valor_estimado,
                o.etapa,
                o.status,
                o.motivo_perda,
                o.responsavel_id,
                o.origem,
                o.dados_extras,
                o.data_fechamento,
                o.criado_em,
                o.atualizado_em,
                c.nome AS cliente_nome,
                c.telefone AS cliente_telefone,
                c.email AS cliente_email,
                c.tags AS cliente_tags,
                c.endereco AS cliente_endereco,
                c.ltv AS cliente_ltv,
                c.total_pedidos AS cliente_total_pedidos,
                s.ultima_msg AS cliente_ultima_msg
            FROM tb_crm_oportunidades o
            JOIN tb_crm_clientes c ON o.cliente_id = c.id
            LEFT JOIN tb_bot_sessoes s ON s.id_cliente = o.id_cliente
            WHERE 1=1
        `;

        const params = [];

        if (busca && busca.trim()) {
            params.push(`%${busca.trim()}%`);
            sql += ` AND (o.titulo ILIKE $${params.length} OR c.nome ILIKE $${params.length} OR c.telefone ILIKE $${params.length})`;
        }

        if (status && status !== 'todos') {
            params.push(status);
            sql += ` AND o.status = $${params.length}`;
        }

        if (tag && tag.trim()) {
            params.push(tag.trim());
            sql += ` AND $${params.length} = ANY(c.tags)`;
        }

        if (responsavel_id) {
            params.push(responsavel_id);
            sql += ` AND o.responsavel_id = $${params.length}`;
        }

        sql += ` ORDER BY o.atualizado_em DESC`;

        try {
            const res = await DatabaseService.executar(sql, params);

            // Inicializa estrutura de colunas do Kanban
            const colunas = {};
            ETAPAS_FUNIL.forEach(etapa => {
                colunas[etapa.id] = {
                    info: etapa,
                    cards: [],
                    totalCards: 0,
                    totalValor: 0.00
                };
            });

            let totalOportunidades = 0;
            let totalValorFunil = 0.00;
            let valorGanho = 0.00;
            let totalGanhos = 0;
            let totalPerdidos = 0;

            for (const row of res.rows) {
                const etapaKey = colunas[row.etapa] ? row.etapa : 'novo_lead';
                let valor = parseFloat(row.valor_estimado) || 0.00;

                // Se a oportunidade foi fechada/ganha mas o valor estava 0, tenta fallback no LTV do cliente
                const isEtapaGanha = (row.etapa === 'pedido_fechado' || row.etapa === 'pos_venda');
                if (valor <= 0 && (isEtapaGanha || row.status === 'ganho') && parseFloat(row.cliente_ltv || 0) > 0) {
                    valor = parseFloat(row.cliente_ltv);
                }

                const statusEfetivo = isEtapaGanha ? 'ganho' : row.status;

                const card = {
                    id: row.id,
                    cliente_id: row.cliente_id,
                    id_cliente: row.id_cliente,
                    numero_limpo: CrmClienteService.extrairDigitos(row.id_cliente),
                    titulo: row.titulo,
                    valor_estimado: valor,
                    valor_formatado: valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    etapa: row.etapa,
                    status: statusEfetivo,
                    motivo_perda: row.motivo_perda,
                    origem: row.origem,
                    dados_extras: row.dados_extras || {},
                    criado_em: row.criado_em,
                    atualizado_em: row.atualizado_em,
                    cliente: {
                        nome: row.cliente_nome || 'Cliente',
                        telefone: row.cliente_telefone,
                        email: row.cliente_email,
                        tags: row.cliente_tags || [],
                        endereco: row.cliente_endereco,
                        ltv: parseFloat(row.cliente_ltv || 0.00),
                        total_pedidos: parseInt(row.cliente_total_pedidos || 0, 10),
                        ultima_msg: row.cliente_ultima_msg
                    }
                };

                colunas[etapaKey].cards.push(card);
                colunas[etapaKey].totalCards++;
                colunas[etapaKey].totalValor += valor;

                totalOportunidades++;
                if (statusEfetivo === 'ganho') {
                    valorGanho += valor;
                    totalGanhos++;
                } else if (statusEfetivo === 'perdido') {
                    totalPerdidos++;
                } else {
                    totalValorFunil += valor;
                }
            }

            // Formata valores totais das colunas
            Object.keys(colunas).forEach(key => {
                colunas[key].totalValorFormatado = colunas[key].totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            });

            // Se nenhum filtro restritivo foi aplicado, as métricas da lista são as globais.
            // Se um filtro de status ou busca foi aplicado, busca métricas globais para que os cards
            // executivos de KPI no topo (Vendas Concluídas, etc.) nunca zerem falsamente por causa do filtro da tabela!
            let metricasGeraisRetorno;
            if (!busca && (!status || status === 'todos') && !tag && !responsavel_id) {
                const taxaConversao = (totalGanhos + totalPerdidos) > 0 
                    ? ((totalGanhos / (totalGanhos + totalPerdidos)) * 100).toFixed(1)
                    : '0.0';

                metricasGeraisRetorno = {
                    totalOportunidades,
                    totalValorFunil: totalValorFunil.toFixed(2),
                    totalValorFunilFormatado: totalValorFunil.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    valorGanho: valorGanho.toFixed(2),
                    valorGanhoFormatado: valorGanho.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    totalGanhos,
                    totalPerdidos,
                    taxaConversao
                };
            } else {
                try {
                    const globais = await this.obterMetricasPipeline();
                    metricasGeraisRetorno = {
                        totalOportunidades: globais.totalOportunidades,
                        totalValorFunil: globais.valorAberto,
                        totalValorFunilFormatado: parseFloat(globais.valorAberto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        valorGanho: globais.valorGanho,
                        valorGanhoFormatado: parseFloat(globais.valorGanho || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        totalGanhos: globais.totalGanhas,
                        totalPerdidos: globais.totalPerdidas,
                        taxaConversao: globais.taxaConversao
                    };
                } catch (_) {
                    const taxaConversao = (totalGanhos + totalPerdidos) > 0 
                        ? ((totalGanhos / (totalGanhos + totalPerdidos)) * 100).toFixed(1)
                        : '0.0';

                    metricasGeraisRetorno = {
                        totalOportunidades,
                        totalValorFunil: totalValorFunil.toFixed(2),
                        totalValorFunilFormatado: totalValorFunil.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        valorGanho: valorGanho.toFixed(2),
                        valorGanhoFormatado: valorGanho.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        totalGanhos,
                        totalPerdidos,
                        taxaConversao
                    };
                }
            }

            return {
                etapas: ETAPAS_FUNIL,
                colunas,
                metricasGerais: metricasGeraisRetorno
            };
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao listar Kanban:', err.message);
            throw err;
        }
    }

    /**
     * Obtém uma oportunidade específica pelo ID com detalhes completos do cliente
     */
    static async obterPorId(id) {
        try {
            const sql = `
                SELECT 
                    o.*,
                    c.nome AS cliente_nome,
                    c.telefone AS cliente_telefone,
                    c.email AS cliente_email,
                    c.tags AS cliente_tags,
                    c.endereco AS cliente_endereco,
                    c.ltv AS cliente_ltv,
                    c.total_pedidos AS cliente_total_pedidos
                FROM tb_crm_oportunidades o
                JOIN tb_crm_clientes c ON o.cliente_id = c.id
                WHERE o.id = $1
            `;
            const res = await DatabaseService.executar(sql, [id]);
            return res.rows[0] || null;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao obter oportunidade:', err.message);
            throw err;
        }
    }

    /**
     * Cria uma nova oportunidade de negócio no CRM
     */
    static async criarOportunidade(dados) {
        const {
            id_cliente,
            cliente_id,
            titulo,
            valor_estimado = 0.00,
            etapa = 'novo_lead',
            status = 'aberto',
            responsavel_id = null,
            origem = 'manual',
            dados_extras = {}
        } = dados;

        let clienteFinal = null;

        if (cliente_id) {
            const busca = await DatabaseService.executar('SELECT * FROM tb_crm_clientes WHERE id = $1', [cliente_id]);
            clienteFinal = busca.rows[0];
        } else if (id_cliente) {
            clienteFinal = await CrmClienteService.obterOuCriar(id_cliente, dados.nome || null);
            if (dados.nome && dados.nome.trim() && clienteFinal && clienteFinal.nome !== dados.nome.trim()) {
                await CrmClienteService.atualizar(clienteFinal.id_cliente, { nome: dados.nome.trim() });
                clienteFinal.nome = dados.nome.trim();
            }
        }

        if (!clienteFinal) {
            throw new Error('Cliente obrigatório para criar a oportunidade no funil');
        }

        const tituloFinal = titulo && titulo.trim() ? titulo.trim() : `Negociação - ${clienteFinal.nome || 'Cliente'}`;
        const etapaValida = ETAPAS_FUNIL.some(e => e.id === etapa) ? etapa : 'novo_lead';
        const valorNum = parseFloat(valor_estimado) || 0.00;

        try {
            const sql = `
                INSERT INTO tb_crm_oportunidades (
                    cliente_id, id_cliente, titulo, valor_estimado, etapa, status, responsavel_id, origem, dados_extras
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *;
            `;
            const res = await DatabaseService.executar(sql, [
                clienteFinal.id,
                clienteFinal.id_cliente,
                tituloFinal,
                valorNum,
                etapaValida,
                status,
                responsavel_id,
                origem,
                JSON.stringify(dados_extras)
            ]);

            const oportunidade = res.rows[0];

            // Sincroniza a etapa do cliente no CRM
            await DatabaseService.executar(
                'UPDATE tb_crm_clientes SET etapa_funil = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2',
                [etapaValida, clienteFinal.id]
            );

            // Emite notificação de realtime
            try {
                SocketService.emitirPipelineAtualizado({
                    acao: 'criada',
                    oportunidade
                });
            } catch (_) {}

            return oportunidade;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao criar oportunidade:', err.message);
            throw err;
        }
    }

    /**
     * Atualiza a etapa do funil (Drag & Drop no Kanban ou avanço automático)
     */
    static async atualizarEtapa(idOportunidade, novaEtapa, motivoPerda = null, valorFinal = null) {
        if (!ETAPAS_FUNIL.some(e => e.id === novaEtapa)) {
            throw new Error(`Etapa de funil inválida: ${novaEtapa}`);
        }

        try {
            const busca = await DatabaseService.executar('SELECT * FROM tb_crm_oportunidades WHERE id = $1', [idOportunidade]);
            if (busca.rows.length === 0) {
                throw new Error('Oportunidade não encontrada');
            }

            const op = busca.rows[0];
            let novoStatus = op.status;
            let dataFechamento = op.data_fechamento;
            let valorNum = (valorFinal !== null && !isNaN(parseFloat(valorFinal)) && parseFloat(valorFinal) > 0)
                ? parseFloat(valorFinal)
                : (parseFloat(op.valor_estimado) || 0.00);

            if (novaEtapa === 'pedido_fechado' || novaEtapa === 'pos_venda') {
                novoStatus = 'ganho';
                dataFechamento = new Date();

                // Se o valor estiver zerado ao fechar venda, tenta auto-recuperar de cobrança Pix pendente ou pedido
                if (valorNum <= 0) {
                    try {
                        const buscaCob = await DatabaseService.executar(
                            `SELECT valor FROM tb_cobrancas_pix WHERE id_cliente = $1 ORDER BY criado_em DESC LIMIT 1`,
                            [op.id_cliente]
                        );
                        if (buscaCob.rows.length > 0 && parseFloat(buscaCob.rows[0].valor) > 0) {
                            valorNum = parseFloat(buscaCob.rows[0].valor);
                        } else {
                            const buscaPed = await DatabaseService.executar(
                                `SELECT valor_total FROM tb_pedidos WHERE id_cliente = $1 ORDER BY id DESC LIMIT 1`,
                                [op.id_cliente]
                            );
                            if (buscaPed.rows.length > 0 && parseFloat(buscaPed.rows[0].valor_total) > 0) {
                                valorNum = parseFloat(buscaPed.rows[0].valor_total);
                            }
                        }
                    } catch (_) {}
                }
            } else if (motivoPerda && motivoPerda.trim()) {
                novoStatus = 'perdido';
                dataFechamento = new Date();
            } else if (novoStatus === 'perdido' && !motivoPerda) {
                novoStatus = 'aberto';
                dataFechamento = null;
            } else if (novoStatus === 'ganho' && novaEtapa !== 'pedido_fechado' && novaEtapa !== 'pos_venda') {
                novoStatus = 'aberto';
                dataFechamento = null;
            }

            const sql = `
                UPDATE tb_crm_oportunidades 
                SET etapa = $1, 
                    status = $2, 
                    motivo_perda = $3, 
                    data_fechamento = $4, 
                    valor_estimado = CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE valor_estimado END,
                    atualizado_em = CURRENT_TIMESTAMP
                WHERE id = $6
                RETURNING *;
            `;
            const res = await DatabaseService.executar(sql, [
                novaEtapa,
                novoStatus,
                motivoPerda ? motivoPerda.trim() : null,
                dataFechamento,
                valorNum,
                idOportunidade
            ]);

            const atualizada = res.rows[0];

            // Atualiza etapa correspondente no perfil 360 do cliente
            await DatabaseService.executar(
                'UPDATE tb_crm_clientes SET etapa_funil = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2',
                [novaEtapa, op.cliente_id]
            );

            if (novoStatus === 'ganho') {
                await DatabaseService.executar(
                    `UPDATE tb_crm_clientes SET status = 'cliente' WHERE id = $1`,
                    [op.cliente_id]
                );

                // Se a oportunidade acabou de ser ganha/fechada, consolida a compra no LTV do cliente
                if (op.status !== 'ganho') {
                    try {
                        const valorCompra = parseFloat(atualizada.valor_estimado) || 0.00;
                        if (valorCompra > 0) {
                            await CrmClienteService.registrarCompra(
                                op.id_cliente, 
                                valorCompra, 
                                atualizada.dados_extras
                            );
                        }
                        await CrmClienteService.adicionarTag(op.id_cliente, 'pedido_realizado');
                        await CrmClienteService.removerTag(op.id_cliente, 'aguardando_pix');
                    } catch (errCompra) {
                        console.warn('[CrmPipelineService] Aviso ao consolidar compra no LTV:', errCompra.message);
                    }
                }
            }

            // Emite notificação de realtime para o Kanban em todos os navegadores abertos
            try {
                SocketService.emitirPipelineAtualizado({
                    acao: 'etapa_movida',
                    id: atualizada.id,
                    etapa: novaEtapa,
                    status: novoStatus,
                    atualizada
                });
            } catch (_) {}

            return atualizada;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao atualizar etapa da oportunidade:', err.message);
            throw err;
        }
    }

    /**
     * Atualização completa de campos da oportunidade
     */
    static async atualizar(idOportunidade, dados) {
        const { titulo, valor_estimado, etapa, status, motivo_perda, responsavel_id } = dados;

        try {
            const updates = [];
            const params = [];

            if (titulo !== undefined) {
                params.push(titulo);
                updates.push(`titulo = $${params.length}`);
            }

            if (valor_estimado !== undefined) {
                params.push(parseFloat(valor_estimado) || 0.00);
                updates.push(`valor_estimado = $${params.length}`);
            }

            if (etapa !== undefined && ETAPAS_FUNIL.some(e => e.id === etapa)) {
                params.push(etapa);
                updates.push(`etapa = $${params.length}`);

                // Se selecionou Pedido Fechado ou Pós-venda e o status não é explicitamente 'perdido',
                // sincroniza obrigatoriamente para 'ganho' para não deixar venda concluída com status 'aberto'
                if ((etapa === 'pedido_fechado' || etapa === 'pos_venda') && status !== 'perdido') {
                    status = 'ganho';
                }
            }

            if (status !== undefined) {
                params.push(status);
                updates.push(`status = $${params.length}`);
                if (status === 'ganho' || status === 'perdido') {
                    updates.push(`data_fechamento = CURRENT_TIMESTAMP`);
                } else if (status === 'aberto') {
                    updates.push(`data_fechamento = NULL`);
                }
            }

            if (motivo_perda !== undefined) {
                params.push(motivo_perda);
                updates.push(`motivo_perda = $${params.length}`);
            }

            if (responsavel_id !== undefined) {
                params.push(responsavel_id);
                updates.push(`responsavel_id = $${params.length}`);
            }

            updates.push(`atualizado_em = CURRENT_TIMESTAMP`);
            params.push(idOportunidade);

            const sql = `
                UPDATE tb_crm_oportunidades 
                SET ${updates.join(', ')} 
                WHERE id = $${params.length} 
                RETURNING *;
            `;

            const res = await DatabaseService.executar(sql, params);
            const atualizada = res.rows[0];

            if (atualizada && etapa) {
                await DatabaseService.executar(
                    'UPDATE tb_crm_clientes SET etapa_funil = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2',
                    [etapa, atualizada.cliente_id]
                );
            }

            // Se a oportunidade foi marcada como ganha/concluída, sincroniza perfil do cliente
            if (atualizada && atualizada.status === 'ganho') {
                try {
                    await DatabaseService.executar(
                        `UPDATE tb_crm_clientes SET status = 'cliente' WHERE id = $1`,
                        [atualizada.cliente_id]
                    );
                    const vCompra = parseFloat(atualizada.valor_estimado) || 0.00;
                    if (vCompra > 0) {
                        await CrmClienteService.registrarCompra(atualizada.id_cliente, vCompra);
                        await CrmClienteService.adicionarTag(atualizada.id_cliente, 'pedido_realizado');
                        await CrmClienteService.removerTag(atualizada.id_cliente, 'aguardando_pix');
                    }
                } catch (eGanho) {
                    console.warn('[CrmPipelineService] Aviso ao consolidar cliente ganho:', eGanho.message);
                }
            }

            try {
                SocketService.emitirPipelineAtualizado({
                    acao: 'atualizada',
                    oportunidade: atualizada
                });
            } catch (_) {}

            return atualizada;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao atualizar oportunidade:', err.message);
            throw err;
        }
    }

    /**
     * Exclui uma oportunidade
     */
    static async excluir(idOportunidade) {
        try {
            await DatabaseService.executar('DELETE FROM tb_crm_oportunidades WHERE id = $1', [idOportunidade]);
            try {
                SocketService.emitirPipelineAtualizado({
                    acao: 'excluida',
                    id: idOportunidade
                });
            } catch (_) {}
            return true;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao excluir oportunidade:', err.message);
            throw err;
        }
    }

    /**
     * Sincronização automática do funil com as etapas da conversa do bot WhatsApp
     * Chamado transparentemente a cada interação do cliente.
     */
    static async sincronizarEtapaComBot(idCanonico, stageBot, dadosContexto = {}) {
        if (!idCanonico) return null;

        const novaEtapa = MAPA_BOT_PARA_ETAPA[stageBot] || null;
        if (!novaEtapa) return null;

        try {
            // Garante que o cliente existe no CRM
            const cliente = await CrmClienteService.obterOuCriar(idCanonico);
            if (!cliente) return null;

            // Busca oportunidade ativa (aberta) do cliente
            const buscaOp = await DatabaseService.executar(
                `SELECT * FROM tb_crm_oportunidades 
                 WHERE cliente_id = $1 AND status = 'aberto' 
                 ORDER BY atualizado_em DESC LIMIT 1`,
                [cliente.id]
            );

            let opAtiva = buscaOp.rows[0];

            // Calcula valor estimado do carrinho se disponível no contexto
            let valorEstimado = null;
            if (dadosContexto.carrinho && Array.isArray(dadosContexto.carrinho)) {
                valorEstimado = dadosContexto.carrinho.reduce((acc, item) => {
                    const preco = parseFloat(item.preco) || 0;
                    const qtd = parseInt(item.quantidade, 10) || 1;
                    return acc + (preco * qtd);
                }, 0.00);
            } else if (dadosContexto.totalPedido || dadosContexto.valor) {
                valorEstimado = parseFloat(dadosContexto.totalPedido || dadosContexto.valor) || null;
            }

            if (opAtiva) {
                const ordemAtual = ORDEM_ETAPAS[opAtiva.etapa] || 1;
                const ordemNova = ORDEM_ETAPAS[novaEtapa] || 1;

                // Não retrocede oportunidade que já estava em etapa de checkout para lead genérico
                // a menos que tenha finalizado
                const podeAtualizar = ordemNova >= ordemAtual || novaEtapa === 'pedido_fechado';

                if (podeAtualizar && opAtiva.etapa !== novaEtapa) {
                    const statusFinal = (novaEtapa === 'pedido_fechado' || novaEtapa === 'pos_venda') ? 'ganho' : 'aberto';
                    const dataFechamento = statusFinal === 'ganho' ? new Date() : null;

                    const updates = [
                        `etapa = $1`,
                        `status = $2`,
                        `data_fechamento = $3`,
                        `atualizado_em = CURRENT_TIMESTAMP`
                    ];
                    const params = [novaEtapa, statusFinal, dataFechamento];

                    if (valorEstimado !== null && valorEstimado > 0) {
                        params.push(valorEstimado);
                        updates.push(`valor_estimado = $${params.length}`);
                    }

                    params.push(opAtiva.id);
                    const sqlUpdate = `
                        UPDATE tb_crm_oportunidades 
                        SET ${updates.join(', ')} 
                        WHERE id = $${params.length} 
                        RETURNING *;
                    `;

                    const res = await DatabaseService.executar(sqlUpdate, params);
                    opAtiva = res.rows[0];

                    await DatabaseService.executar(
                        'UPDATE tb_crm_clientes SET etapa_funil = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2',
                        [novaEtapa, cliente.id]
                    );

                    try {
                        SocketService.emitirPipelineAtualizado({
                            acao: 'etapa_movida',
                            id: opAtiva.id,
                            etapa: novaEtapa,
                            status: statusFinal,
                            atualizada: opAtiva
                        });
                    } catch (_) {}
                }
            } else {
                // Se não há oportunidade aberta e o cliente interagiu, cria nova oportunidade
                const titulo = `Atendimento - ${cliente.nome || 'Cliente'}`;
                const statusInicial = (novaEtapa === 'pedido_fechado' || novaEtapa === 'pos_venda') ? 'ganho' : 'aberto';

                const sqlInsert = `
                    INSERT INTO tb_crm_oportunidades (
                        cliente_id, id_cliente, titulo, valor_estimado, etapa, status, origem
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp_bot')
                    RETURNING *;
                `;
                const res = await DatabaseService.executar(sqlInsert, [
                    cliente.id,
                    cliente.id_cliente,
                    titulo,
                    valorEstimado || 0.00,
                    novaEtapa,
                    statusInicial
                ]);
                opAtiva = res.rows[0];

                try {
                    SocketService.emitirPipelineAtualizado({
                        acao: 'criada',
                        oportunidade: opAtiva
                    });
                } catch (_) {}
            }

            return opAtiva;
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao sincronizar etapa com o bot:', err.message);
            return null;
        }
    }

    /**
     * Métricas consolidadas do pipeline
     */
    static async obterMetricasPipeline() {
        try {
            const sql = `
                SELECT 
                    count(*) as total_oportunidades,
                    count(*) FILTER (WHERE o.status = 'aberto' AND o.etapa NOT IN ('pedido_fechado', 'pos_venda')) as total_abertas,
                    count(*) FILTER (WHERE o.status = 'ganho' OR o.etapa IN ('pedido_fechado', 'pos_venda')) as total_ganhas,
                    count(*) FILTER (WHERE o.status = 'perdido') as total_perdidas,
                    COALESCE(SUM(o.valor_estimado) FILTER (WHERE o.status = 'aberto' AND o.etapa NOT IN ('pedido_fechado', 'pos_venda')), 0) as valor_aberto,
                    COALESCE(SUM(CASE 
                        WHEN o.valor_estimado > 0 THEN o.valor_estimado 
                        WHEN c.ltv > 0 THEN c.ltv 
                        ELSE 0 
                    END) FILTER (WHERE o.status = 'ganho' OR o.etapa IN ('pedido_fechado', 'pos_venda')), 0) as valor_ganho
                FROM tb_crm_oportunidades o
                LEFT JOIN tb_crm_clientes c ON o.cliente_id = c.id;
            `;
            const res = await DatabaseService.executar(sql);
            const r = res.rows[0];

            const totalGanhos = parseInt(r.total_ganhas, 10);
            const totalPerdidos = parseInt(r.total_perdidas, 10);
            const totalFechadas = totalGanhos + totalPerdidos;

            const taxaConversao = totalFechadas > 0 
                ? ((totalGanhos / totalFechadas) * 100).toFixed(1)
                : '0.0';

            return {
                totalOportunidades: parseInt(r.total_oportunidades, 10),
                totalAbertas: parseInt(r.total_abertas, 10),
                totalGanhas: totalGanhos,
                totalPerdidas: totalPerdidos,
                valorAberto: parseFloat(r.valor_aberto).toFixed(2),
                valorGanho: parseFloat(r.valor_ganho).toFixed(2),
                taxaConversao
            };
        } catch (err) {
            console.error('[CrmPipelineService] Erro ao obter métricas do pipeline:', err.message);
            return {
                totalOportunidades: 0,
                totalAbertas: 0,
                totalGanhas: 0,
                totalPerdidas: 0,
                valorAberto: '0.00',
                valorGanho: '0.00',
                taxaConversao: '0.0'
            };
        }
    }
}

module.exports = CrmPipelineService;
