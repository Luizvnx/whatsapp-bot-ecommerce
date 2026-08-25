const DatabaseService = require('./DatabaseService');

class SessaoService {
    static async obterSessao(numeroCliente) {
        const idAlt = numeroCliente.includes('@') ? numeroCliente.split('@')[0] : `${numeroCliente}@s.whatsapp.net`;
        const sql = `SELECT id_cliente, etapa, dados_sessao FROM tb_bot_sessoes WHERE id_cliente = $1 OR id_cliente = $2 LIMIT 1`;
        const result = await DatabaseService.executar(sql, [numeroCliente, idAlt]);

        if (result.rows.length > 0) {
            const row = result.rows[0];
            let dados = typeof row.dados_sessao === 'string' ? JSON.parse(row.dados_sessao) : (row.dados_sessao || {});
            if (row.etapa) {
                dados.etapa = row.etapa;
            }
            dados.id = row.id_cliente || numeroCliente;
            if (!Array.isArray(dados.carrinho)) dados.carrinho = [];
            if (!Array.isArray(dados.historicoIa)) dados.historicoIa = [];
            return dados;
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
        const etapa = sessao.etapa || 'inicio';
        sessao.etapa = etapa;

        const sql = `
            INSERT INTO tb_bot_sessoes (id_cliente, etapa, dados_sessao, ultima_msg)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (id_cliente) 
            DO UPDATE SET 
                dados_sessao = EXCLUDED.dados_sessao,
                etapa = EXCLUDED.etapa,
                ultima_msg = CURRENT_TIMESTAMP;
        `;
        
        await DatabaseService.executar(sql, [
            numeroCliente, 
            etapa, 
            JSON.stringify(sessao)
        ]);
    }

    static async alterarEtapa(numeroCliente, novaEtapa, resetarCarrinho = false) {
        const sessao = await this.obterSessao(numeroCliente);
        sessao.etapa = novaEtapa;
        sessao.processando = false;
        sessao.ultimaInteracao = Date.now();

        if (resetarCarrinho) {
            sessao.carrinho = [];
        }
        if (novaEtapa === 'inicio') {
            sessao.errosConsecutivos = 0;
        }

        await this.salvarSessao(numeroCliente, sessao);
        return sessao;
    }

    static async limparCarrinho(numeroCliente) {
        const sessao = await this.obterSessao(numeroCliente);
        sessao.carrinho = [];
        await this.salvarSessao(numeroCliente, sessao);
        return sessao;
    }

    static verificarExpiracao(sessao) {
        const TEMPO_LIMITE = 24 * 60 * 60 * 1000;
        let expirou = false;
        
        if (sessao.ultimaInteracao && (Date.now() - sessao.ultimaInteracao > TEMPO_LIMITE)) {
            sessao.etapa = 'inicio';
            sessao.carrinho = [];
            sessao.historicoIa = [];
            expirou = true;
        }
        
        sessao.ultimaInteracao = Date.now(); 
        return expirou;
    }
}

module.exports = SessaoService;