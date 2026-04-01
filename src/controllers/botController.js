const SessaoService = require('../services/sessaoService');
const InicioStage = require('../stages/InicioStage');

const estagios = {
    'inicio': InicioStage,
    'aguardando_categoria': require('../stages/CategoriaStage'),
    'aguardando_produto': require('../stages/ProdutoStage'),
    'aguardando_pagamento': require('../stages/PagamentoStage'),
    'em_atendimento_humano': require('../stages/HumanoStage')
};

const tempoInicioServidor = Math.floor(Date.now() / 1000);
let botPausadoGlobalmente = false; 

class BotController {
    static async processarMensagem(msg) {
        if (msg.timestamp < tempoInicioServidor) return;
        if (msg.type === 'e2e_notification' || msg.type === 'call_log' || msg.type === 'protocol' || !msg.body) return; 
        if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

        const texto = msg.body.toLowerCase();


        if (msg.fromMe) {
            if (texto === '/pausarbot') { botPausadoGlobalmente = true; return; }
            if (texto === '/ligarbot') { botPausadoGlobalmente = false; return; }


            const mensagemDoBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖','🟠','🍷','🛡️'].some(emoji => texto.includes(emoji));
            if (mensagemDoBot) return; 

            const numeroClienteAAtender = msg.to; 

            if (SessaoService.existeSessao(numeroClienteAAtender)) {
                const sessaoCliente = SessaoService.obterSessao(numeroClienteAAtender);
                
                // /bot no WhatsApp para reativar
                if (texto === '/bot') {
                    sessaoCliente.etapa = 'inicio';
                    await msg.reply("🤖 Atendimento automático reativado!");
                    await InicioStage.executar(msg, texto, sessaoCliente);
                    return;
                }

                // Se você digitou texto normal (assumiu a conversa), o bot pausa
                if (sessaoCliente.etapa !== 'em_atendimento_humano') {
                    sessaoCliente.etapa = 'em_atendimento_humano';
                    console.log(`[WhatsApp] Você assumiu a conversa com ${numeroClienteAAtender}. Bot silenciado.`);
                }
            }
            return; 
        }

        // FLUXO NORMAL DOS CLIENTES

        if (botPausadoGlobalmente) return;

        const sessao = SessaoService.obterSessao(msg.from);
        
        if (SessaoService.verificarExpiracao(sessao, msg.from)) {
            await msg.reply("⏳ Sua sessão expirou devido à inatividade. Vamos começar de novo! 🐝\n\nDigite qualquer coisa para ver o menu.");
            return; 
        }

        const estagioAtual = estagios[sessao.etapa];

        if (estagioAtual) {
            await estagioAtual.executar(msg, texto, sessao);
        } else {
            sessao.etapa = 'inicio'; 
        }
    }
}

module.exports = BotController;