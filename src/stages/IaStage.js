const GeminiService = require('../services/GeminiService');
const EvolutionService = require('../services/EvolutionService');

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

        // 1. Envia feedback visual de "digitando..." no WhatsApp
        await EvolutionService.enviarPresenca(msg.numeroCliente, 'composing', 1500).catch(() => {});

        // 2. Consulta a IA com Structured Outputs e Stop Sequences (tom 100% humano e sem emojis)
        const retorno = await GeminiService.perguntar(texto, sessao.historicoIa);

        // 3. Registra a resposta LIMPA no histórico da IA (sem poluição de rodapés)
        sessao.historicoIa.push({ role: 'model', parts: [{ text: retorno.resposta }] });

        if (sessao.historicoIa.length > 20) {
            sessao.historicoIa = sessao.historicoIa.slice(-20);
        }

        // 4. Se a IA determinou transferência humana de forma estruturada
        if (retorno.transferirHumano) {
            sessao.etapa = 'em_atendimento_humano';
            await msg.reply(retorno.resposta);
            return;
        }

        // 5. Monta rodapé contextual conforme a ação sugerida pela IA (sem emojis)
        let rodape = '_Digite *1* para comprar produtos ou *#* para ver o menu principal._';
        if (retorno.sugerirAcao === 'catalogo') {
            rodape = '_Digite *1* para ver nosso catálogo completo ou *#* para o menu principal._';
        } else if (retorno.sugerirAcao === 'resgate') {
            rodape = '_Digite *2* para solicitar resgate de abelhas ou *#* para o menu principal._';
        } else if (retorno.sugerirAcao === 'consultoria') {
            rodape = '_Digite *3* para falar sobre consultoria apícola ou *#* para o menu principal._';
        } else if (retorno.sugerirAcao === 'menu') {
            rodape = '_Digite *#* para voltar ao menu principal._';
        }

        await msg.reply(`${retorno.resposta}\n\n${rodape}`);
    }
}

module.exports = IaStage;