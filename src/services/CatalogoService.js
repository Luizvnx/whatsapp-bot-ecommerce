const DatabaseService = require('./DatabaseService');
const catalogoFallback = require('../data/catalogo.json');

class CatalogoService {
    static cacheCatalogo = null;
    static cacheTimestamp = 0;
    static CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache em memória

    /**
     * Invalida o cache para que a próxima requisição leia do banco de dados imediatamente
     */
    static invalidarCache() {
        this.cacheCatalogo = null;
        this.cacheTimestamp = 0;
    }

    /**
     * Retorna a árvore completa de catálogo estruturada para os estágios do Bot
     * Estrutura compatível com CategoriaStage e ProdutoStage
     */
    static async obterCatalogo() {
        const agora = Date.now();
        if (this.cacheCatalogo && (agora - this.cacheTimestamp < this.CACHE_TTL_MS)) {
            return this.cacheCatalogo;
        }

        try {
            const sqlCat = `SELECT id, nome, descricao, icone, ordem FROM tb_categorias WHERE ativo = true ORDER BY ordem ASC, id ASC`;
            const sqlProd = `SELECT id, categoria_id, nome, preco, descricao, estoque, foto FROM tb_produtos WHERE ativo = true ORDER BY id ASC`;

            const [resCat, resProd] = await Promise.all([
                DatabaseService.executar(sqlCat),
                DatabaseService.executar(sqlProd)
            ]);

            if (resCat.rows.length === 0) {
                console.warn('⚠️ [CATALOGO] Nenhuma categoria ativa no banco. Usando fallback JSON.');
                return catalogoFallback;
            }

            const catalogoFormatado = { categorias: {} };

            // Monta as categorias
            for (const cat of resCat.rows) {
                catalogoFormatado.categorias[cat.id] = {
                    id: cat.id,
                    nome: cat.nome,
                    descricao: cat.descricao || '',
                    icone: cat.icone || '🍯',
                    produtos: {}
                };
            }

            // Agrupa os produtos dentro de suas respectivas categorias
            // Para manter compatibilidade com números de seleção do WhatsApp (1, 2, 3...)
            const indicesPorCategoria = {};

            for (const prod of resProd.rows) {
                const catId = prod.categoria_id;
                if (!catalogoFormatado.categorias[catId]) continue;

                if (!indicesPorCategoria[catId]) {
                    indicesPorCategoria[catId] = 1;
                }

                const indexStr = String(indicesPorCategoria[catId]++);

                catalogoFormatado.categorias[catId].produtos[indexStr] = {
                    id_banco: prod.id,
                    codigo: indexStr,
                    nome: prod.nome,
                    preco: parseFloat(prod.preco),
                    descricao: prod.descricao || '',
                    foto: prod.foto || null,
                    estoque: prod.estoque
                };
            }

            this.cacheCatalogo = catalogoFormatado;
            this.cacheTimestamp = agora;
            return catalogoFormatado;

        } catch (error) {
            console.error('❌ [CATALOGO] Erro ao carregar catálogo do banco, usando fallback:', error.message);
            return catalogoFallback;
        }
    }

    /**
     * Retorna a lista plana de todos os produtos com nome da categoria (Para Dashboard Admin)
     */
    static async listarTodosOsProdutos(filtro = '') {
        try {
            let sql = `
                SELECT 
                    p.id, 
                    p.categoria_id, 
                    c.nome as categoria_nome, 
                    c.icone as categoria_icone,
                    p.nome, 
                    p.preco, 
                    p.descricao, 
                    p.foto,
                    p.estoque, 
                    p.ativo, 
                    p.criado_em, 
                    p.atualizado_em
                FROM tb_produtos p
                LEFT JOIN tb_categorias c ON p.categoria_id = c.id
            `;
            const params = [];

            if (filtro && filtro.trim().length > 0) {
                params.push(`%${filtro.trim()}%`);
                sql += ` WHERE p.nome ILIKE $1 OR p.descricao ILIKE $1 OR c.nome ILIKE $1`;
            }

            sql += ` ORDER BY c.ordem ASC, p.id ASC`;

            const res = await DatabaseService.executar(sql, params);
            return res.rows.map(r => ({
                ...r,
                preco: parseFloat(r.preco)
            }));
        } catch (error) {
            console.error('❌ Erro ao listar produtos:', error.message);
            throw error;
        }
    }

    /**
     * Retorna um produto por ID
     */
    static async obterProdutoPorId(id) {
        const sql = `SELECT * FROM tb_produtos WHERE id = $1`;
        const res = await DatabaseService.executar(sql, [id]);
        if (res.rows.length === 0) return null;
        return {
            ...res.rows[0],
            preco: parseFloat(res.rows[0].preco)
        };
    }

    /**
     * Cria um novo produto no banco de dados
     */
    static async criarProduto({ categoria_id, nome, preco, descricao = '', foto = null, estoque = 999, ativo = true }) {
        if (!categoria_id || !nome || preco === undefined || preco === null) {
            throw new Error('Campos obrigatórios: categoria_id, nome e preco.');
        }

        const sql = `
            INSERT INTO tb_produtos (categoria_id, nome, preco, descricao, foto, estoque, ativo, criado_em, atualizado_em)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [
            categoria_id,
            nome.trim(),
            parseFloat(preco),
            descricao ? descricao.trim() : '',
            foto || null,
            parseInt(estoque, 10) || 999,
            ativo === true || ativo === 'true'
        ]);

        this.invalidarCache();
        return res.rows[0];
    }

    /**
     * Atualiza um produto existente
     */
    static async atualizarProduto(id, dados) {
        const campos = [];
        const valores = [];
        let contador = 1;

        if (dados.categoria_id !== undefined) {
            campos.push(`categoria_id = $${contador++}`);
            valores.push(dados.categoria_id);
        }
        if (dados.nome !== undefined) {
            campos.push(`nome = $${contador++}`);
            valores.push(dados.nome.trim());
        }
        if (dados.preco !== undefined) {
            campos.push(`preco = $${contador++}`);
            valores.push(parseFloat(dados.preco));
        }
        if (dados.descricao !== undefined) {
            campos.push(`descricao = $${contador++}`);
            valores.push(dados.descricao.trim());
        }
        if (dados.foto !== undefined) {
            campos.push(`foto = $${contador++}`);
            valores.push(dados.foto || null);
        }
        if (dados.estoque !== undefined) {
            campos.push(`estoque = $${contador++}`);
            valores.push(parseInt(dados.estoque, 10) || 0);
        }
        if (dados.ativo !== undefined) {
            campos.push(`ativo = $${contador++}`);
            valores.push(dados.ativo === true || dados.ativo === 'true');
        }

        if (campos.length === 0) {
            throw new Error('Nenhum campo fornecido para atualização.');
        }

        campos.push(`atualizado_em = CURRENT_TIMESTAMP`);
        const idInt = parseInt(id, 10);
        valores.push(isNaN(idInt) ? id : idInt);

        const sql = `
            UPDATE tb_produtos 
            SET ${campos.join(', ')} 
            WHERE id = $${contador}
            RETURNING *;
        `;

        const res = await DatabaseService.executar(sql, valores);
        if (res.rows.length === 0) {
            throw new Error(`Produto #${id} não encontrado.`);
        }

        this.invalidarCache();
        return res.rows[0];
    }

    /**
     * Remove um produto do banco
     */
    static async deletarProduto(id) {
        const sql = `DELETE FROM tb_produtos WHERE id = $1 RETURNING id, nome`;
        const res = await DatabaseService.executar(sql, [id]);
        if (res.rows.length === 0) {
            throw new Error(`Produto #${id} não encontrado.`);
        }
        this.invalidarCache();
        return res.rows[0];
    }

    /**
     * Retorna todas as categorias cadastradas
     */
    static async listarCategorias() {
        try {
            const sql = `
                SELECT 
                    c.*, 
                    COUNT(p.id) as total_produtos
                FROM tb_categorias c
                LEFT JOIN tb_produtos p ON c.id = p.categoria_id
                GROUP BY c.id
                ORDER BY c.ordem ASC, c.id ASC;
            `;
            const res = await DatabaseService.executar(sql);
            return res.rows.map(r => ({
                ...r,
                total_produtos: parseInt(r.total_produtos, 10)
            }));
        } catch (error) {
            console.error('❌ Erro ao listar categorias:', error.message);
            throw error;
        }
    }

    /**
     * Cria uma categoria
     */
    static async criarCategoria({ id, nome, descricao = '', icone = '🍯', ordem = 1, ativo = true }) {
        if (!id || !nome) {
            throw new Error('ID e Nome da categoria são obrigatórios.');
        }

        const sql = `
            INSERT INTO tb_categorias (id, nome, descricao, icone, ordem, ativo)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                nome = EXCLUDED.nome,
                descricao = EXCLUDED.descricao,
                icone = CASE WHEN EXCLUDED.icone != '' THEN EXCLUDED.icone ELSE tb_categorias.icone END,
                ordem = EXCLUDED.ordem,
                ativo = EXCLUDED.ativo
            RETURNING *;
        `;
        const res = await DatabaseService.executar(sql, [
            id.trim(),
            nome.trim(),
            descricao.trim(),
            icone.trim(),
            parseInt(ordem, 10) || 1,
            ativo === true || ativo === 'true'
        ]);

        this.invalidarCache();
        return res.rows[0];
    }

    /**
     * Atualiza uma categoria
     */
    static async atualizarCategoria(id, dados) {
        const campos = [];
        const valores = [];
        let contador = 1;

        if (dados.nome !== undefined) {
            campos.push(`nome = $${contador++}`);
            valores.push(dados.nome.trim());
        }
        if (dados.descricao !== undefined) {
            campos.push(`descricao = $${contador++}`);
            valores.push(dados.descricao.trim());
        }
        if (dados.icone !== undefined) {
            campos.push(`icone = $${contador++}`);
            valores.push(dados.icone.trim());
        }
        if (dados.ordem !== undefined) {
            campos.push(`ordem = $${contador++}`);
            valores.push(parseInt(dados.ordem, 10) || 1);
        }
        if (dados.ativo !== undefined) {
            campos.push(`ativo = $${contador++}`);
            valores.push(dados.ativo === true || dados.ativo === 'true');
        }

        if (campos.length === 0) {
            throw new Error('Nenhum campo fornecido para atualização.');
        }

        valores.push(id);
        const sql = `
            UPDATE tb_categorias 
            SET ${campos.join(', ')} 
            WHERE id = $${contador}
            RETURNING *;
        `;

        const res = await DatabaseService.executar(sql, valores);
        if (res.rows.length === 0) {
            throw new Error(`Categoria #${id} não encontrada.`);
        }

        this.invalidarCache();
        return res.rows[0];
    }

    /**
     * Remove uma categoria
     */
    static async deletarCategoria(id) {
        const sql = `DELETE FROM tb_categorias WHERE id = $1 RETURNING id, nome`;
        const res = await DatabaseService.executar(sql, [id]);
        if (res.rows.length === 0) {
            throw new Error(`Categoria #${id} não encontrada.`);
        }
        this.invalidarCache();
        return res.rows[0];
    }
}

module.exports = CatalogoService;
