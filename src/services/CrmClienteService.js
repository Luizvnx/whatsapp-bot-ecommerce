const DatabaseService = require('./DatabaseService');

class CrmClienteService {
    /**
     * Normaliza qualquer identificador para JID canônico (@s.whatsapp.net)
     */
    static normalizarId(id) {
        if (!id || typeof id !== 'string') return id;
        const limpo = id.trim();
        if (limpo.includes('@lid') || limpo.includes('@g.us')) return limpo;
        const numero = limpo.split('@')[0].split(':')[0].replace(/\D/g, '');
        return numero ? `${numero}@s.whatsapp.net` : limpo;
    }

    /**
     * Extrai apenas os dígitos do telefone
     */
    static extrairDigitos(idOuTelefone) {
        if (!idOuTelefone) return '';
        return String(idOuTelefone).split('@')[0].split(':')[0].replace(/\D/g, '');
    }

    /**
     * Obtém um cliente pelo JID ou cria caso não exista (Auto-registro de novos contatos)
     */
    static async obterOuCriar(idJid, nome = null, dadosIniciais = {}) {
        const idCanonico = this.normalizarId(idJid);
        const telefone = this.extrairDigitos(idCanonico);
        if (!telefone) return null;

        const nomeFinal = (nome && typeof nome === 'string' && nome.trim()) ? nome.trim() : null;

        try {
            // 1. Tenta buscar cliente existente
            const buscaSql = `SELECT * FROM tb_crm_clientes WHERE id_cliente = $1`;
            const res = await DatabaseService.executar(buscaSql, [idCanonico]);

            if (res.rows.length > 0) {
                const cliente = res.rows[0];
                // Se recebemos um nome legítimo e o cliente ainda não tinha ou tinha genérico, atualiza
                if (nomeFinal && (!cliente.nome || cliente.nome === 'Cliente' || cliente.nome.includes('('))) {
                    await this.atualizar(idCanonico, { nome: nomeFinal });
                    cliente.nome = nomeFinal;
                }
                return cliente;
            }

            // 2. Se não existir, cadastra como novo lead
            const insertSql = `
                INSERT INTO tb_crm_clientes (
                    id_cliente, telefone, nome, status, etapa_funil, origem, tags, endereco, criado_em, atualizado_em
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (id_cliente) DO UPDATE SET atualizado_em = CURRENT_TIMESTAMP
                RETURNING *;
            `;

            const status = dadosIniciais.status || 'lead';
            const etapa = dadosIniciais.etapa_funil || 'novo_contato';
            const origem = dadosIniciais.origem || 'whatsapp';
            const tags = Array.isArray(dadosIniciais.tags) ? dadosIniciais.tags : [];
            const endereco = dadosIniciais.endereco || {};

            const novo = await DatabaseService.executar(insertSql, [
                idCanonico,
                telefone,
                nomeFinal || 'Cliente',
                status,
                etapa,
                origem,
                tags,
                JSON.stringify(endereco)
            ]);

            return novo.rows[0];
        } catch (err) {
            console.error('[CrmClienteService] Erro ao obterOuCriar cliente:', err.message);
            throw err;
        }
    }

    /**
     * Busca cliente por ID numérico ou JID do WhatsApp
     */
    static async obterPorIdOuJid(idOuJid) {
        try {
            const isNumeroId = Number.isInteger(Number(idOuJid)) && !String(idOuJid).includes('@');
            const sql = isNumeroId
                ? `SELECT * FROM tb_crm_clientes WHERE id = $1`
                : `SELECT * FROM tb_crm_clientes WHERE id_cliente = $1`;

            const val = isNumeroId ? Number(idOuJid) : this.normalizarId(idOuJid);
            const res = await DatabaseService.executar(sql, [val]);
            return res.rows[0] || null;
        } catch (err) {
            console.error('[CrmClienteService] Erro ao obter cliente:', err.message);
            return null;
        }
    }

    /**
     * Lista clientes com filtros avançados, busca e paginação para o painel CRM
     */
    static async listar({ busca = '', status = '', etapa_funil = '', tag = '', limit = 50, offset = 0 } = {}) {
        try {
            const condicoes = [];
            const params = [];
            let pIdx = 1;

            if (busca && busca.trim()) {
                params.push(`%${busca.trim()}%`);
                condicoes.push(`(nome ILIKE $${pIdx} OR telefone ILIKE $${pIdx} OR email ILIKE $${pIdx})`);
                pIdx++;
            }

            if (status && status.trim()) {
                params.push(status.trim());
                condicoes.push(`status = $${pIdx}`);
                pIdx++;
            }

            if (etapa_funil && etapa_funil.trim()) {
                params.push(etapa_funil.trim());
                condicoes.push(`etapa_funil = $${pIdx}`);
                pIdx++;
            }

            if (tag && tag.trim()) {
                params.push(tag.trim());
                condicoes.push(`$${pIdx} = ANY(tags)`);
                pIdx++;
            }

            const whereSql = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

            // Contagem total
            const countSql = `SELECT count(*) FROM tb_crm_clientes ${whereSql}`;
            const countRes = await DatabaseService.executar(countSql, params);
            const total = parseInt(countRes.rows[0].count, 10);

            // Consulta paginada ordenada pelos mais recentes
            params.push(limit);
            const limitParam = `$${pIdx++}`;
            params.push(offset);
            const offsetParam = `$${pIdx++}`;

            const listSql = `
                SELECT * FROM tb_crm_clientes
                ${whereSql}
                ORDER BY atualizado_em DESC, id DESC
                LIMIT ${limitParam} OFFSET ${offsetParam}
            `;
            const listRes = await DatabaseService.executar(listSql, params);

            return {
                total,
                limit,
                offset,
                clientes: listRes.rows
            };
        } catch (err) {
            console.error('[CrmClienteService] Erro ao listar clientes:', err.message);
            return { total: 0, limit, offset, clientes: [] };
        }
    }

    /**
     * Atualiza dados cadastrais, status, etapa do funil e campos do cliente
     */
    static async atualizar(idOuJid, dados = {}) {
        try {
            const clienteAtual = await this.obterPorIdOuJid(idOuJid);
            if (!clienteAtual) throw new Error('Cliente não encontrado.');

            const camposPermitidos = [
                'nome', 'email', 'documento', 'origem', 'status', 'etapa_funil',
                'endereco', 'observacoes', 'campos_personalizados', 'responsavel_id'
            ];

            const updates = [];
            const params = [];
            let pIdx = 1;

            for (const campo of camposPermitidos) {
                if (dados[campo] !== undefined) {
                    let val = dados[campo];
                    if (campo === 'endereco' || campo === 'campos_personalizados') {
                        val = JSON.stringify(val);
                    }
                    updates.push(`${campo} = $${pIdx}`);
                    params.push(val);
                    pIdx++;
                }
            }

            if (updates.length === 0) return clienteAtual;

            updates.push(`atualizado_em = CURRENT_TIMESTAMP`);
            params.push(clienteAtual.id);

            const sql = `
                UPDATE tb_crm_clientes 
                SET ${updates.join(', ')} 
                WHERE id = $${pIdx} 
                RETURNING *;
            `;

            const res = await DatabaseService.executar(sql, params);
            return res.rows[0];
        } catch (err) {
            console.error('[CrmClienteService] Erro ao atualizar cliente:', err.message);
            throw err;
        }
    }

    /**
     * Adiciona uma tag ao cliente
     */
    static async adicionarTag(idOuJid, tag) {
        if (!tag || typeof tag !== 'string') return null;
        const tagLimpa = tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!tagLimpa) return null;

        const cliente = await this.obterPorIdOuJid(idOuJid);
        if (!cliente) return null;

        const sql = `
            UPDATE tb_crm_clientes 
            SET tags = array_append(array_remove(tags, $1), $1), atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [tagLimpa, cliente.id]);
        return res.rows[0];
    }

    /**
     * Remove uma tag do cliente
     */
    static async removerTag(idOuJid, tag) {
        if (!tag) return null;
        const cliente = await this.obterPorIdOuJid(idOuJid);
        if (!cliente) return null;

        const sql = `
            UPDATE tb_crm_clientes 
            SET tags = array_remove(tags, $1), atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [tag.trim().toLowerCase(), cliente.id]);
        return res.rows[0];
    }

    /**
     * Adiciona anotação interna de atendente sobre o cliente
     */
    static async adicionarNota(idOuJid, autorNome, texto) {
        if (!texto || !texto.trim()) throw new Error('O texto da nota não pode ser vazio.');
        const cliente = await this.obterPorIdOuJid(idOuJid);
        if (!cliente) throw new Error('Cliente não encontrado.');

        const sql = `
            INSERT INTO tb_crm_notas (cliente_id, autor_nome, texto, criado_em)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [cliente.id, autorNome || 'Atendente', texto.trim()]);
        return res.rows[0];
    }

    /**
     * Lista notas internas do cliente
     */
    static async obterNotas(idOuJid) {
        const cliente = await this.obterPorIdOuJid(idOuJid);
        if (!cliente) return [];

        const sql = `SELECT * FROM tb_crm_notas WHERE cliente_id = $1 ORDER BY criado_em DESC`;
        const res = await DatabaseService.executar(sql, [cliente.id]);
        return res.rows;
    }

    /**
     * Registra conclusão de compra, recalculando LTV, Ticket Médio e promovendo o Lead a Cliente
     */
    static async registrarCompra(idOuJid, valorCompra = 0, endereco = null) {
        try {
            const cliente = await this.obterPorIdOuJid(idOuJid);
            if (!cliente) return null;

            const valorNum = parseFloat(valorCompra) || 0;
            const novoLtv = (parseFloat(cliente.ltv) || 0) + valorNum;
            const novoTotalPedidos = (parseInt(cliente.total_pedidos, 10) || 0) + 1;
            const novoTicketMedio = novoTotalPedidos > 0 ? (novoLtv / novoTotalPedidos) : 0;

            const updates = [
                `ltv = $1`,
                `total_pedidos = $2`,
                `ticket_medio = $3`,
                `ultima_compra_em = CURRENT_TIMESTAMP`,
                `status = 'cliente'`,
                `etapa_funil = 'pos_venda'`,
                `atualizado_em = CURRENT_TIMESTAMP`
            ];
            const params = [novoLtv, novoTotalPedidos, novoTicketMedio];
            let pIdx = 4;

            if (!cliente.primeira_compra_em) {
                updates.push(`primeira_compra_em = CURRENT_TIMESTAMP`);
            }

            if (endereco) {
                updates.push(`endereco = $${pIdx}`);
                params.push(JSON.stringify(endereco));
                pIdx++;
            }

            params.push(cliente.id);

            const sql = `
                UPDATE tb_crm_clientes 
                SET ${updates.join(', ')} 
                WHERE id = $${pIdx} 
                RETURNING *;
            `;

            const res = await DatabaseService.executar(sql, params);
            return res.rows[0];
        } catch (err) {
            console.error('[CrmClienteService] Erro ao registrar compra:', err.message);
            throw err;
        }
    }

    /**
     * Métricas executivas gerais para o Dashboard do CRM
     */
    static async obterMetricas() {
        try {
            const sql = `
                SELECT 
                    count(*) as total_contatos,
                    count(*) FILTER (WHERE status = 'lead') as total_leads,
                    count(*) FILTER (WHERE status = 'cliente') as total_clientes,
                    COALESCE(SUM(ltv), 0) as ltv_acumulado,
                    COALESCE(AVG(ticket_medio) FILTER (WHERE total_pedidos > 0), 0) as ticket_medio_geral,
                    count(*) FILTER (WHERE criado_em >= CURRENT_DATE) as novos_hoje
                FROM tb_crm_clientes;
            `;
            const res = await DatabaseService.executar(sql);
            const r = res.rows[0];
            return {
                totalContatos: parseInt(r.total_contatos, 10),
                totalLeads: parseInt(r.total_leads, 10),
                totalClientes: parseInt(r.total_clientes, 10),
                ltvAcumulado: parseFloat(r.ltv_acumulado).toFixed(2),
                ticketMedioGeral: parseFloat(r.ticket_medio_geral).toFixed(2),
                novosHoje: parseInt(r.novos_hoje, 10)
            };
        } catch (err) {
            console.error('[CrmClienteService] Erro ao obter métricas:', err.message);
            return {
                totalContatos: 0,
                totalLeads: 0,
                totalClientes: 0,
                ltvAcumulado: '0.00',
                ticketMedioGeral: '0.00',
                novosHoje: 0
            };
        }
    }
}

module.exports = CrmClienteService;
