const GeminiService = require('../services/GeminiService');
const EvolutionService = require('../services/EvolutionService');
const mensagens = require('../data/mensagens.json');

class IaStage {
    static async executar(msg, texto, sessao) {
        
        if (texto === '#' || texto === 'sair') {
            sessao.etapa = 'inicio';
            sessao.historicoIa = [];
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        if (texto === '0' || texto.includes('atendente') || texto.includes('humano')) {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            
            const numeroLoja = process.env.NUMERO_DA_LOJA; 
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ALERTA IA*\nO cliente pediu atendimento humano enquanto falava com a IA!${msg.linkAlerta}`);
            return;
        }

        //await msg.reply(mensagens.ia.carregando);

        if (!Array.isArray(sessao.historicoIa)) {
            sessao.historicoIa = [];
        }

        const retornoGemini = await GeminiService.perguntar(texto, sessao.historicoIa);
        sessao.historicoIa = retornoGemini.historicoAtualizado;

        // Mantém 10 mensagens"
        if (sessao.historicoIa.length > 10) {
            let histCortado = sessao.historicoIa.slice(-10);
            if (histCortado.length > 0 && histCortado[0].role === 'model') {
                histCortado.shift();
            }
            sessao.historicoIa = histCortado;
        }

        await msg.reply(`${retornoGemini.resposta}\n\n# - Voltar ao menu principal`);
    }
}

module.exports = IaStage;