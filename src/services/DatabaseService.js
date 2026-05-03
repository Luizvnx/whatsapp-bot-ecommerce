const { Pool } = require('pg');

class DatabaseService {
    static pool = null;

    static async inicializar() {
        try {
            console.log('🔍 [DEBUG] Iniciando conexão com o banco de dados...');

            // Se existir a DATABASE_URL (Nuvem/Railway), usa ela direto.
            // Se não, usa as configurações locais (Seu PC).
            const dbConfig = process.env.DATABASE_URL 
                ? { connectionString: process.env.DATABASE_URL }
                : {
                    user: process.env.POSTGRES_USER || 'postgres',
                    password: process.env.POSTGRES_PASSWORD || 'typebot',
                    host: process.env.BOT_DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 5432,
                    database: process.env.POSTGRES_DB || 'evolution_db'
                };

            this.pool = new Pool(dbConfig);

            const sql = `
                CREATE TABLE IF NOT EXISTS tb_bot_sessoes (
                    id_cliente VARCHAR(50) PRIMARY KEY,
                    nome_contato VARCHAR(100) DEFAULT 'Desconhecido',
                    etapa VARCHAR(30),
                    dados_sessao JSONB,
                    ultima_msg TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            await this.pool.query(sql);
            console.log('📦 Tabela do PostgreSQL verificada/criada com sucesso.');
        } catch (err) {
            console.error('❌ Erro ao inicializar o banco:', err);
        }
    }

    static async limparSessoesInativas() {
        try {
            const sql = `DELETE FROM tb_bot_sessoes WHERE ultima_msg < NOW() - INTERVAL '1 days'`;
            const result = await this.pool.query(sql);
            if (result.rowCount > 0) {
                console.log(`🧹 Faxina concluída: ${result.rowCount} sessões inativas removidas do banco.`);
            }
        } catch (err) {
            console.error('❌ Erro ao limpar sessões:', err);
        }
    }

    static async executar(sql, params = []) {
        try {
            if (!this.pool) {
                throw new Error("O banco de dados ainda não foi inicializado!");
            }
            return await this.pool.query(sql, params);
        } catch (err) {
            console.error('❌ Erro na query PostgreSQL:', err);
            throw err;
        }
    }
}

module.exports = DatabaseService;

