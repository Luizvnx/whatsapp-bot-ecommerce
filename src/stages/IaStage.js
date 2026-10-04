const GeminiService = require('../services/GeminiService');

class IaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'sair' || t === 'voltar' || t === 'menu') {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        if (t === '1') {
            sessao.etapa = 'aguardando_categoria';
            const mensagens = require('../data/mensagens.json');
            return await msg.reply(mensagens.produtos.escolhaCategoria);
        }

        if (!Array.isArray(sessao.historicoIa)) {
            sessao.historicoIa = [];
        }

        const retorno = await GeminiService.perguntar(texto, sessao.historicoIa);

        sessao.historicoIa.push({ role: 'user', parts: [{ text: texto }] });
        sessao.historicoIa.push({ role: 'model', parts: [{ text: retorno.resposta }] });

        if (sessao.historicoIa.length > 14) {
            sessao.historicoIa = sessao.historicoIa.slice(-14);
        }

        if (retorno.transferirHumano) {
            sessao.etapa = 'em_atendimento_humano';
            await msg.reply(retorno.resposta);
            return;
        }

        await msg.reply(`${retorno.resposta}\n\n👉 _Digite *1* para comprar produtos ou *#* para ver o menu principal._`);
    }
}

module.exports = IaStage;