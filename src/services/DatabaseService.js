const { Pool } = require('pg');

class DatabaseService {
    // Começa vazio
    static pool = null;

    static async inicializar() {
        try {
            // 👇 Linha de diagnóstico para descobrir quem está mentindo
            console.log('🔍 [DEBUG] Lendo DB_HOST do .env:', process.env.DB_HOST);

            this.pool = new Pool({
                user: process.env.POSTGRES_USER || 'postgres',
                password: process.env.POSTGRES_PASSWORD || 'typebot',
                host: process.env.BOT_DB_HOST || 'localhost',
                port: 5432,
                database: process.env.POSTGRES_DB || 'evolution_db'
            });

            const sql = `
                CREATE TABLE IF NOT EXISTS tb_bot_sessoes (
                    id_cliente VARCHAR(50) PRIMARY KEY,
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
            const sql = `DELETE FROM tb_bot_sessoes WHERE ultima_msg < NOW() - INTERVAL '15 days'`;
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