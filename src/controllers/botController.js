const SessaoService = require('../services/SessaoService');
const EvolutionService = require('../services/EvolutionService');
const mensagens = require('../data/mensagens.json');

const estagios = {
    'inicio': require('../stages/InicioStage'),
    'aguardando_categoria': require('../stages/CategoriaStage'),
    'aguardando_produto': require('../stages/ProdutoStage'),
    'aguardando_quantidade': require('../stages/QuantidadeStage'),
    'carrinho_opcoes': require('../stages/CarrinhoStage'),
    'conversando_com_ia': require('../stages/IaStage')
};

let botPausadoGlobalmente = false; 

class BotController {
    static async processarMensagem(data) {
        let sessao;
        try {
            if (!data?.key || !data?.message) return;

            const { remoteJid, fromMe } = data.key;
            
            //Bypass do @lid)
            let numeroReal = remoteJid;
            if (remoteJid.includes('@lid')) {
                if (data.sender && data.sender.includes('@s.whatsapp.net')) {
                    numeroReal = data.sender;
                } else if (data.key.participant && data.key.participant.includes('@s.whatsapp.net')) {
                    numeroReal = data.key.participant;
                }
            }
            
            const numeroCliente = remoteJid.split('@')[0];
            const numeroParaLink = numeroReal.split('@')[0]; 
            const isLid = numeroParaLink.length > 13;
            
            const nomeCliente = data.pushName || 'um Cliente';
            
            const linkAlerta = isLid 
                ? `\n👉 *Aviso:* Número oculto pelo WhatsApp. Procure pela conversa de *${nomeCliente}* no seu aplicativo.`
                : `\n👉 Link: https://wa.me/${numeroParaLink}`;

            const textoBruto = data.message.conversation || data.message.extendedTextMessage?.text || '';
            if (!textoBruto) return; 
            const texto = textoBruto.toLowerCase().trim();

            const msg = {
                from: numeroCliente,
                body: textoBruto,
                fromMe,
                nome: nomeCliente,
                linkAlerta: linkAlerta,
                reply: async (t) => await EvolutionService.enviarMensagemText(numeroCliente, t)
            };

            sessao = SessaoService.obterSessao(numeroCliente);

            // 1. Comando Global /BOT
            if (texto === '/bot') {
                sessao.etapa = 'inicio';
                sessao.processando = false; 
                sessao.errosConsecutivos = 0;
                sessao.carrinho = []; // Limpa o carrinho ao reiniciar o bot
                await msg.reply(mensagens.geral.botReativado);
                
                await EvolutionService.gerenciarEtiqueta(numeroCliente, '7', 'remove').catch(() => {});
                await EvolutionService.gerenciarEtiqueta(numeroCliente, '8', 'add').catch(() => {});

                return await estagios['inicio'].executar(msg, texto, sessao);
            }

            //Admin Global (Ações do Vendedor)
            if (fromMe) {
                if (texto === '/pausarbot') { botPausadoGlobalmente = true; return; }
                if (texto === '/ligarbot') { botPausadoGlobalmente = false; return; }
                
                const isMsgBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖', '🛒'].some(e => texto.includes(e));
                if (!isMsgBot && sessao.etapa !== 'em_atendimento_humano') {
                    sessao.etapa = 'em_atendimento_humano';
                    await EvolutionService.gerenciarEtiqueta(numeroCliente, '8', 'remove').catch(() => {});
                }
                return; 
            }

            if (botPausadoGlobalmente || sessao.etapa === 'em_atendimento_humano') return;
            if (sessao.processando) return;

            try {
                sessao.processando = true;

                // Verifica se a sessão expirou por inatividade
                if (SessaoService.verificarExpiracao(sessao, msg.from)) {
                    await msg.reply(mensagens.erros.sessaoExpirada);
                    return;
                }

                if (texto === 'carrinho' || texto === '/carrinho') {
                    if (!sessao.carrinho || sessao.carrinho.length === 0) {
                        await msg.reply("🛒 *Seu carrinho está vazio no momento!*\n\nDigite *#* para ver o nosso menu de produtos e começar a comprar. 🍯");
                        return;
                    }

                    let subtotal = 0;
                    let resumo = `🛒 *Aqui está o seu carrinho:*\n\n`;
                    
                    sessao.carrinho.forEach((item) => {
                        const totalItem = item.preco * item.quantidade;
                        subtotal += totalItem;
                        resumo += `- ${item.quantidade}x ${item.nome} (R$ ${totalItem.toFixed(2).replace('.', ',')})\n`;
                    });

                    resumo += `\n💰 *Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}*`;
                    resumo += mensagens.carrinho.opcoes;

                    await msg.reply(resumo);
                    sessao.etapa = 'carrinho_opcoes';
                    return; 
                }

                const estagioAtual = estagios[sessao.etapa] || estagios['inicio'];
                await estagioAtual.executar(msg, texto, sessao);

            } finally {
                sessao.processando = false; 
            }

        } catch (error) {
            console.error('❌ Erro no BotController:', error);
            if (sessao) sessao.processando = false;
        }
    }
}

module.exports = BotController;