
const sessoes = new Map();
const TEMPO_EXPIRACAO = 30 * 60 * 1000; // 30 minutos

class SessaoService {
    static obterSessao(numeroCliente) {
        if (!sessoes.has(numeroCliente)) {
            sessoes.set(numeroCliente, { 
                etapa: 'inicio', 
                pedido_temp: null,
                categoriaSelecionada: null,
                ultimaInteracao: Date.now(),
                errosConsecutivos: 0
            });
        }
        return sessoes.get(numeroCliente);
    }

    static verificarExpiracao(sessao, numeroCliente) {
        const tempoOcioso = Date.now() - sessao.ultimaInteracao;
        
        if (tempoOcioso > TEMPO_EXPIRACAO && sessao.etapa !== 'em_atendimento_humano' && sessao.etapa !== 'inicio') {
            sessao.etapa = 'inicio';
            sessao.categoriaSelecionada = null;
            sessao.errosConsecutivos = 0;
            sessao.ultimaInteracao = Date.now();
            return true; // Retorna true se expirou
        }
        
        sessao.ultimaInteracao = Date.now();
        return false; // Não expirou
    }

    // Para uso na verificação de atendimento humano
    static existeSessao(numeroCliente) {
        return sessoes.has(numeroCliente);
    }
}

module.exports = SessaoService;