const GeminiService = require('../services/GeminiService');
const EvolutionService = require('../services/EvolutionService');
const mensagens = require('../data/mensagens.json');

require('dotenv').config();

class IaStage {
    static async executar(msg, texto, sessao) {
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            
            const numeroLoja = process.env.NUMERO_DA_LOJA; 
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ALERTA IA*\nO cliente pediu atendente enquanto falava com a IA!\n👉 Link: https://wa.me/${msg.from}`);
            return;
        }

        if (texto === '#' || texto === 'sair') {
            sessao.etapa = 'inicio';
            const InicioStage = require('./InicioStage');
            await InicioStage.executar(msg, '', sessao);
            return;
        }

        await msg.reply(mensagens.ia.carregando);
        const respostaIa = await GeminiService.perguntar(texto);
        await msg.reply(`${respostaIa}\n${mensagens.geral.voltarMenu}`);
    }
}
module.exports = IaStage;