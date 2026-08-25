const { Pool } = require('pg');
const config = require('../config');

// 1. Criamos a configuração inteligente com a regra do SSL
const dbConfig = config.database.url
    ? { 
        connectionString: config.database.url,
        // Ativa SSL automaticamente se a URL for da nuvem (rlwy.net ou railway.app)
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

        try {
            await this.executar(sqlSessoes);
            await this.executar(sqlConfig);
            console.log('📦 Banco de Dados pronto para uso.');
        } catch (error) {
            console.error('❌ Erro ao inicializar tabelas:', error.message);
            throw error;
        }
    }

    // Método auxiliar para rodar queries
    static async executar(sql, params = []) {
        try {
            return await this.pool.query(sql, params);
        } catch (err) {
            console.error('❌ Erro na execução SQL:', err.message);
            throw err;
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
            console.error(`❌ Erro ao obter config ${chave}:`, err.message);
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
            console.error(`❌ Erro ao salvar config ${chave}:`, err.message);
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
            console.error('❌ Erro na rotina de limpeza de sessões:', error.message);
        }
    }
}

module.exports = DatabaseService;