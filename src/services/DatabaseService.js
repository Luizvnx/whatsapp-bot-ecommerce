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
        const sql = `
            CREATE TABLE IF NOT EXISTS tb_bot_sessoes (
                id_cliente VARCHAR(100) PRIMARY KEY,
                nome_contato VARCHAR(150),
                etapa VARCHAR(50) DEFAULT 'inicio',
                dados_sessao JSONB DEFAULT '{}',
                ultima_msg TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        try {
            await this.executar(sql);
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
}

module.exports = DatabaseService;