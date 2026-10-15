const { Pool } = require('pg');
const config = require('../config');

// 1. Criamos a configuração inteligente com a regra do SSL
const dbConfig = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...(config.database.url
        ? {
            connectionString: config.database.url,
            ssl: (config.database.url.includes('rlwy.net') || config.database.url.includes('railway'))
                ? { rejectUnauthorized: false }
                : false
        }
        : {
            host: config.database.host,
            user: config.database.user,
            password: config.database.pass,
            database: config.database.name,
            port: config.database.port
        })
};

class DatabaseService {
    // 2. CORREÇÃO: Passamos a variável dbConfig diretamente, sem repetir código
    static pool = new Pool(dbConfig);

    // O método inicializar DEVE ser static para ser chamado sem dar 'new'
    static async inicializar() {
        console.log('🔍 [DEBUG] Verificando tabelas no banco de dados...');
        const sqlSessoes = `
            CREATE TABLE IF NOT EXISTS tb_bot_sessoes (
                id_cliente VARCHAR(100) PRIMARY KEY,
                nome_contato VARCHAR(150),
                etapa VARCHAR(50) DEFAULT 'inicio',
                dados_sessao JSONB DEFAULT '{}',
                ultima_msg TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tb_bot_sessoes_ultima_msg ON tb_bot_sessoes (ultima_msg DESC);
            CREATE INDEX IF NOT EXISTS idx_tb_bot_sessoes_etapa ON tb_bot_sessoes (etapa);
        `;

        const sqlConfig = `
            CREATE TABLE IF NOT EXISTS tb_bot_config (
                chave VARCHAR(50) PRIMARY KEY,
                valor JSONB,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO tb_bot_config (chave, valor)
            VALUES ('bot_global_status', '{"pausado": false}'::jsonb)
            ON CONFLICT (chave) DO NOTHING;
        `;

        const sqlCatalogo = `
            CREATE TABLE IF NOT EXISTS tb_categorias (
                id VARCHAR(50) PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                descricao TEXT,
                icone VARCHAR(20) DEFAULT '🍯',
                ordem INT DEFAULT 1,
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tb_produtos (
                id SERIAL PRIMARY KEY,
                categoria_id VARCHAR(50) NOT NULL REFERENCES tb_categorias(id) ON DELETE CASCADE,
                nome VARCHAR(150) NOT NULL,
                preco NUMERIC(10,2) NOT NULL,
                descricao TEXT,
                foto TEXT,
                estoque INT DEFAULT 999,
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE tb_produtos ADD COLUMN IF NOT EXISTS foto TEXT;

            CREATE INDEX IF NOT EXISTS idx_tb_produtos_categoria ON tb_produtos(categoria_id);
            CREATE INDEX IF NOT EXISTS idx_tb_produtos_ativo ON tb_produtos(ativo);
        `;

        const sqlUsuarios = `
            CREATE TABLE IF NOT EXISTS tb_usuarios (
                id SERIAL PRIMARY KEY,
                login VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                nome VARCHAR(100) NOT NULL,
                senha VARCHAR(255) NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO tb_usuarios (login, email, nome, senha)
            VALUES ('admin', 'admin@favodemel.com', 'Favo de Mel', 'admin')
            ON CONFLICT (login) DO NOTHING;
        `;

        const sqlCrm = `
            CREATE TABLE IF NOT EXISTS tb_crm_clientes (
                id SERIAL PRIMARY KEY,
                id_cliente VARCHAR(100) UNIQUE NOT NULL,
                telefone VARCHAR(50) NOT NULL,
                nome VARCHAR(150),
                email VARCHAR(150),
                documento VARCHAR(30),
                origem VARCHAR(50) DEFAULT 'whatsapp',
                status VARCHAR(50) DEFAULT 'lead',
                etapa_funil VARCHAR(50) DEFAULT 'novo_contato',
                tags TEXT[] DEFAULT '{}',
                endereco JSONB DEFAULT '{}',
                ltv NUMERIC(10,2) DEFAULT 0.00,
                total_pedidos INT DEFAULT 0,
                ticket_medio NUMERIC(10,2) DEFAULT 0.00,
                primeira_compra_em TIMESTAMP,
                ultima_compra_em TIMESTAMP,
                observacoes TEXT,
                campos_personalizados JSONB DEFAULT '{}',
                responsavel_id INT REFERENCES tb_usuarios(id) ON DELETE SET NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_tb_crm_clientes_telefone ON tb_crm_clientes(telefone);
            CREATE INDEX IF NOT EXISTS idx_tb_crm_clientes_status ON tb_crm_clientes(status);
            CREATE INDEX IF NOT EXISTS idx_tb_crm_clientes_etapa_funil ON tb_crm_clientes(etapa_funil);

            CREATE TABLE IF NOT EXISTS tb_crm_notas (
                id SERIAL PRIMARY KEY,
                cliente_id INT NOT NULL REFERENCES tb_crm_clientes(id) ON DELETE CASCADE,
                autor_nome VARCHAR(100) NOT NULL,
                texto TEXT NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tb_crm_notas_cliente ON tb_crm_notas(cliente_id);

            -- FASE 2: Funil de Vendas & Pipeline de Negócios (Kanban)
            CREATE TABLE IF NOT EXISTS tb_crm_oportunidades (
                id SERIAL PRIMARY KEY,
                cliente_id INT NOT NULL REFERENCES tb_crm_clientes(id) ON DELETE CASCADE,
                id_cliente VARCHAR(100) NOT NULL,
                titulo VARCHAR(150) NOT NULL,
                valor_estimado NUMERIC(10, 2) DEFAULT 0.00,
                etapa VARCHAR(50) DEFAULT 'novo_lead',
                status VARCHAR(20) DEFAULT 'aberto',
                motivo_perda TEXT,
                responsavel_id INT REFERENCES tb_usuarios(id) ON DELETE SET NULL,
                origem VARCHAR(50) DEFAULT 'whatsapp_bot',
                dados_extras JSONB DEFAULT '{}',
                data_fechamento TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tb_crm_oportunidades_cliente_id ON tb_crm_oportunidades(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_tb_crm_oportunidades_id_cliente ON tb_crm_oportunidades(id_cliente);
            CREATE INDEX IF NOT EXISTS idx_tb_crm_oportunidades_etapa ON tb_crm_oportunidades(etapa);
            CREATE INDEX IF NOT EXISTS idx_tb_crm_oportunidades_status ON tb_crm_oportunidades(status);
        `;

        try {
            await this.executar(sqlSessoes);
            await this.executar(sqlConfig);
            await this.executar(sqlCatalogo);
            await this.executar(sqlUsuarios);
            await this.executar(sqlCrm);
            await this.semearCatalogoSeVazio();
            await this.migrarSessoesParaCrmClientesSeVazio();
            await this.migrarOportunidadesIniciaisSeVazio();
            console.log('📦 Banco de Dados pronto para uso.');
        } catch (error) {
            console.error('Erro ao inicializar tabelas:', error.message);
            throw error;
        }
    }

    /**
     * Sincroniza/migra contatos da tabela tb_bot_sessoes para tb_crm_clientes se estiver vazia
     */
    static async migrarSessoesParaCrmClientesSeVazio() {
        try {
            const check = await this.executar('SELECT count(*) FROM tb_crm_clientes');
            if (parseInt(check.rows[0].count, 10) === 0) {
                console.log('🔄 [CRM] Migrando clientes de tb_bot_sessoes para tb_crm_clientes...');
                const sessoes = await this.executar('SELECT id_cliente, nome_contato, dados_sessao, ultima_msg FROM tb_bot_sessoes');
                for (const row of sessoes.rows) {
                    if (!row.id_cliente) continue;
                    const telefone = row.id_cliente.split('@')[0].split(':')[0].replace(/\D/g, '');
                    if (!telefone) continue;
                    const nome = row.nome_contato || 'Cliente';
                    const dados = row.dados_sessao || {};
                    const endereco = dados.dadosEntregaTexto ? { texto: dados.dadosEntregaTexto } : {};
                    const totalPedidos = dados.pedidoFinalizado ? 1 : 0;
                    const status = totalPedidos > 0 ? 'cliente' : 'lead';
                    const etapaFunil = totalPedidos > 0 ? 'fechamento' : 'novo_contato';
                    const tags = [];
                    if (dados.categoriaSelecionada) tags.push(`cat_${dados.categoriaSelecionada}`);
                    if (dados.pedidoFinalizado) tags.push('pedido_realizado');

                    await this.executar(`
                        INSERT INTO tb_crm_clientes (
                            id_cliente, telefone, nome, status, etapa_funil, tags, endereco, total_pedidos, criado_em, atualizado_em
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
                        ON CONFLICT (id_cliente) DO NOTHING
                    `, [
                        row.id_cliente,
                        telefone,
                        nome,
                        status,
                        etapaFunil,
                        tags,
                        JSON.stringify(endereco),
                        totalPedidos,
                        row.ultima_msg || new Date()
                    ]);
                }
                console.log(`✅ [CRM] Migração de contatos para o CRM concluída com sucesso.`);
            }
        } catch (err) {
            console.warn('⚠️ [CRM] Aviso na migração de clientes para o CRM:', err.message);
        }
    }

    /**
     * Cria oportunidades iniciais para os clientes existentes caso tb_crm_oportunidades esteja vazia
     */
    static async migrarOportunidadesIniciaisSeVazio() {
        try {
            const check = await this.executar('SELECT count(*) FROM tb_crm_oportunidades');
            if (parseInt(check.rows[0].count, 10) === 0) {
                console.log('🔄 [CRM Funil] Inicializando oportunidades para clientes existentes...');
                const clientes = await this.executar('SELECT id, id_cliente, nome, status, etapa_funil, ltv, ticket_medio, total_pedidos, criado_em, atualizado_em FROM tb_crm_clientes');

                for (const c of clientes.rows) {
                    let etapa = 'novo_lead';
                    let status = 'aberto';
                    const valor = parseFloat(c.ticket_medio || c.ltv || 0.00) || 0.00;

                    if (c.status === 'cliente' || c.total_pedidos > 0) {
                        etapa = 'pos_venda';
                        status = 'ganho';
                    } else if (c.etapa_funil === 'fechamento' || c.etapa_funil === 'pedido_fechado') {
                        etapa = 'pedido_fechado';
                        status = 'ganho';
                    } else if (c.etapa_funil === 'aguardando_pagamento') {
                        etapa = 'aguardando_pagamento';
                    } else if (c.etapa_funil === 'carrinho_aberto') {
                        etapa = 'carrinho_aberto';
                    } else if (c.etapa_funil === 'qualificacao') {
                        etapa = 'qualificacao';
                    }

                    const titulo = `Atendimento - ${c.nome || 'Cliente'}`;

                    await this.executar(`
                        INSERT INTO tb_crm_oportunidades (
                            cliente_id, id_cliente, titulo, valor_estimado, etapa, status, origem, criado_em, atualizado_em
                        ) VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp_bot', $7, $8)
                    `, [
                        c.id,
                        c.id_cliente,
                        titulo,
                        valor,
                        etapa,
                        status,
                        c.criado_em || new Date(),
                        c.atualizado_em || new Date()
                    ]);
                }
                console.log('✅ [CRM Funil] Oportunidades do funil inicializadas com sucesso.');
            }
        } catch (err) {
            console.warn('⚠️ [CRM Funil] Aviso na inicialização de oportunidades:', err.message);
        }
    }

    /**
     * Semeia categorias e produtos a partir do catalogo.json se as tabelas estiverem vazias
     */
    static async semearCatalogoSeVazio() {
        try {
            const check = await this.executar('SELECT count(*) FROM tb_categorias');
            if (parseInt(check.rows[0].count, 10) === 0) {
                console.log('🌱 [SEED] Semeando catálogo no banco de dados pela primeira vez...');
                const catalogoPadrao = require('../data/catalogo.json');

                let ordem = 1;
                for (const [catId, catObj] of Object.entries(catalogoPadrao.categorias || {})) {
                    await this.executar(
                        `INSERT INTO tb_categorias (id, nome, descricao, ordem, ativo) VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`,
                        [catId, catObj.nome, catObj.descricao || '', ordem++]
                    );

                    for (const [, prodObj] of Object.entries(catObj.produtos || {})) {
                        await this.executar(
                            `INSERT INTO tb_produtos (categoria_id, nome, preco, descricao, estoque, ativo) VALUES ($1, $2, $3, $4, 999, true)`,
                            [catId, prodObj.nome, prodObj.preco, prodObj.descricao || '']
                        );
                    }
                }
                console.log('✅ [SEED] Catálogo semeado com sucesso no banco de dados.');
            }
        } catch (err) {
            console.warn('⚠️ [SEED] Aviso ao semear catálogo:', err.message);
        }
    }

    // Método auxiliar para rodar queries com resiliência a inicialização do banco
    static async executar(sql, params = [], tentativas = 3) {
        for (let i = 1; i <= tentativas; i++) {
            try {
                return await this.pool.query(sql, params);
            } catch (err) {
                const msg = err.message || '';
                const code = err.code || '';
                // Se o Postgres ainda estiver ligando/recuperando (57P03: the database system is starting up)
                if ((code === '57P03' || msg.includes('starting up')) && i < tentativas) {
                    console.warn(`⏳ [BD] Banco de dados iniciando (tentativa ${i}/${tentativas}). Aguardando 2s...`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                const detalhe = msg || code || (err.errors && err.errors[0]?.message) || String(err);
                console.error('Erro na execução SQL:', detalhe);
                throw err;
            }
        }
    }

    /**
     * Busca uma configuração pelo identificador da chave
     */
    static async obterConfig(chave) {
        try {
            const sql = `SELECT valor FROM tb_bot_config WHERE chave = $1`;
            const result = await this.executar(sql, [chave]);
            if (result.rows.length > 0) {
                return result.rows[0].valor;
            }
            return null;
        } catch (err) {
            console.error(`Erro ao obter config ${chave}:`, err.message);
            return null;
        }
    }

    /**
     * Salva ou atualiza uma configuração
     */
    static async salvarConfig(chave, valor) {
        try {
            const sql = `
                INSERT INTO tb_bot_config (chave, valor, atualizado_em)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (chave)
                DO UPDATE SET 
                    valor = EXCLUDED.valor,
                    atualizado_em = CURRENT_TIMESTAMP;
            `;
            await this.executar(sql, [chave, JSON.stringify(valor)]);
            return true;
        } catch (err) {
            console.error(`Erro ao salvar config ${chave}:`, err.message);
            throw err;
        }
    }

    /**
     * Limpa sessões inativas há mais de X dias (padrão 7 dias) na tabela tb_bot_sessoes
     */
    static async limparSessoesInativas(diasInatividade = 7) {
        try {
            console.log(`🧹 [LIMPEZA] Iniciando rotina de limpeza de sessões inativas (> ${diasInatividade} dias)...`);
            const sql = `
                DELETE FROM tb_bot_sessoes 
                WHERE ultima_msg < NOW() - ($1 || ' days')::INTERVAL;
            `;
            const result = await this.executar(sql, [diasInatividade]);
            console.log(`✅ [LIMPEZA] ${result.rowCount} sessões inativas removidas do banco de dados.`);
            return result.rowCount;
        } catch (error) {
            console.error('Erro na rotina de limpeza de sessões:', error.message);
        }
    }
}

module.exports = DatabaseService;