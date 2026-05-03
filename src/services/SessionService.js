const DatabaseService = require('./DatabaseService');

class SessaoService {
    static async obterSessao(numeroCliente) {
        const sql = `SELECT dados_sessao FROM tb_bot_sessoes WHERE id_cliente = $1`;
        const result = await DatabaseService.executar(sql, [numeroCliente]);

        if (result.rows.length > 0) {
            return result.rows[0].dados_sessao;
        }

        const sessaoInicial = {
            id: numeroCliente,
            etapa: 'inicio',
            processando: false,
            carrinho: [],
            historicoIa: [],
            ultimaInteracao: Date.now()
        };

        await this.salvarSessao(numeroCliente, sessaoInicial);
        return sessaoInicial;
    }

    static async salvarSessao(numeroCliente, sessao) {
        const sql = `
            INSERT INTO tb_bot_sessoes (id_cliente, etapa, dados_sessao)
            VALUES ($1, $2, $3)
            ON CONFLICT (id_cliente) 
            DO UPDATE SET 
                dados_sessao = EXCLUDED.dados_sessao,
                etapa = EXCLUDED.etapa,
                ultima_msg = CURRENT_TIMESTAMP;
        `;
        
        await DatabaseService.executar(sql, [
            numeroCliente, 
            sessao.etapa, 
            JSON.stringify(sessao)
        ]);
    }

    static verificarExpiracao(sessao) {
        const TEMPO_LIMITE = 24 * 60 * 60 * 1000;
        
        if (sessao.ultimaInteracao && (Date.now() - sessao.ultimaInteracao > TEMPO_LIMITE)) {
            sessao.etapa = 'inicio';
            sessao.carrinho = [];
            sessao.historicoIa = [];
        }
        
        sessao.ultimaInteracao = Date.now(); 
    }
}

module.exports = SessaoService;