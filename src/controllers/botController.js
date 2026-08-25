const SessaoService = require('../services/SessionService'); 
const EvolutionService = require('../services/EvolutionService');
const DatabaseService = require('../services/DatabaseService');
const mensagens = require('../data/mensagens.json');

const estagios = {
    'inicio': require('../stages/InicioStage'),
    'aguardando_categoria': require('../stages/CategoriaStage'),
    'aguardando_produto': require('../stages/ProdutoStage'),
    'aguardando_quantidade': require('../stages/QuantidadeStage'),
    'carrinho_opcoes': require('../stages/CarrinhoStage'),
    'conversando_com_ia': require('../stages/IaStage'),
    'em_atendimento_humano': require('../stages/HumanoStage')
};

// Cache em memória para evitar consultas desnecessárias ao banco a cada mensagem
let cacheBotPausado = false;
let ultimaChecagemConfig = 0;

class BotController {
    
    static async isPausadoGlobalmente() {
        const agora = Date.now();
        // Atualiza o cache do banco a cada 5 segundos se necessário
        if (agora - ultimaChecagemConfig > 5000) {
            try {
                const config = await DatabaseService.obterConfig('bot_global_status');
                if (config && typeof config.pausado === 'boolean') {
                    cacheBotPausado = config.pausado;
                }
            } catch (e) {
                console.error('Erro ao ler config global do bot:', e.message);
            }
            ultimaChecagemConfig = agora;
        }
        return cacheBotPausado;
    }

    static async setPausadoGlobalmente(pausado) {
        cacheBotPausado = Boolean(pausado);
        ultimaChecagemConfig = Date.now();
        await DatabaseService.salvarConfig('bot_global_status', { pausado: cacheBotPausado });
        console.log(`[BotController] Automação Global ${cacheBotPausado ? '🛑 PAUSADA' : '🟢 ATIVADA'}`);
        return cacheBotPausado;
    }

    static async processarMensagem(data) {
        if (!data?.key || !data?.message) return;

        let sessao;
        
        try {
            const rawRemoteJid = data.key.remoteJid;
            let numeroReal = rawRemoteJid;
            if (rawRemoteJid.includes('@lid')) {
                numeroReal = (data.sender?.includes('@s.whatsapp.net')) ? data.sender 
                           : (data.key.participant?.includes('@s.whatsapp.net')) ? data.key.participant 
                           : rawRemoteJid;
            }

            // 1. Busca a sessão do cliente
            sessao = await SessaoService.obterSessao(numeroReal);

            // 2. Extrai dados da mensagem e injeta a sessão no info para reply salvar no histórico
            const info = this._extrairDadosMensagem(data, sessao);
            if (!info.textoBruto) return;

            // Se for mensagem enviada pelo próprio atendente (via celular ou WhatsApp Web)
            if (info.fromMe) {
                await this._processarAcoesAdmin(info.textoBruto, info.numeroReal, sessao);
                return; 
            }

            // 3. REGISTRA A MENSAGEM DO CLIENTE NO HISTÓRICO (para exibição no Dashboard e contexto de IA)
            if (!Array.isArray(sessao.historicoIa)) sessao.historicoIa = [];
            sessao.historicoIa.push({
                role: 'user',
                parts: [{ text: info.textoBruto }]
            });
            if (sessao.historicoIa.length > 30) {
                sessao.historicoIa = sessao.historicoIa.slice(-30);
            }

            // 4. Valida expiração da sessão ANTES dos bloqueios de atendimento
            if (SessaoService.verificarExpiracao(sessao)) {
                await info.reply(mensagens.erros.sessaoExpirada);
                await EvolutionService.gerenciarEtiqueta(info.numeroCliente, '7', 'remove').catch(() => {});
                await EvolutionService.gerenciarEtiqueta(info.numeroCliente, '8', 'add').catch(() => {});
                return;
            }

            // 5. Se o cliente estiver em atendimento humano, permite apenas comandos de reativação (/bot, /voltar, menu)
            if (sessao.etapa === 'em_atendimento_humano') {
                if (info.texto === '/bot' || info.texto === '/voltar' || info.texto === 'menu') {
                    sessao.etapa = 'inicio';
                    sessao.errosConsecutivos = 0;
                    sessao.carrinho = [];
                    await EvolutionService.gerenciarEtiqueta(info.numeroCliente, '7', 'remove').catch(() => {});
                    await EvolutionService.gerenciarEtiqueta(info.numeroCliente, '8', 'add').catch(() => {});
                    await info.reply("🤖 *Atendimento automático reativado!*\nDigite qualquer coisa para ver o catálogo. 🍯");
                    await estagios['inicio'].executar(info, info.texto, sessao);
                    return;
                }
                // Silêncio total do robô durante atendimento humano (a mensagem do cliente já foi gravada acima para o atendente ver no dashboard)
                return;
            }

            // 6. Verifica pausa global ou travamento de concorrência
            const pausado = await this.isPausadoGlobalmente();
            if (pausado || sessao.processando) {
                return;
            }

            sessao.processando = true;

            // 7. Intercepta Comandos Globais do Cliente (/bot, /carrinho)
            const comandoInterceptado = await this._processarComandosCliente(info, sessao);
            if (comandoInterceptado) return;

            // 8. Executa o Estágio Atual
            const estagioAtual = estagios[sessao.etapa] || estagios['inicio'];
            await estagioAtual.executar(info, info.texto, sessao);

        } catch (error) {
            console.error(`❌ Erro processando cliente:`, error);
        } finally {
            if (sessao) {
                sessao.processando = false; 
                await SessaoService.salvarSessao(sessao.id || data.key.remoteJid, sessao).catch(console.error);
            }
        }
    }

    // ==========================================
    // MÉTODOS PRIVADOS DE APOIO
    // ==========================================

    static _extrairDadosMensagem(data, sessao) {
        const { remoteJid, fromMe } = data.key;
        
        // Tratamento do @lid
        let numeroReal = remoteJid;
        if (remoteJid.includes('@lid')) {
            numeroReal = (data.sender?.includes('@s.whatsapp.net')) ? data.sender 
                       : (data.key.participant?.includes('@s.whatsapp.net')) ? data.key.participant 
                       : remoteJid;
        }
        
        const numeroCliente = remoteJid.split('@')[0];
        const numeroParaLink = numeroReal.split('@')[0]; 
        const isLid = numeroParaLink.length > 13;
        const nomeCliente = data.pushName || 'um Cliente';
        
        const linkAlerta = isLid 
            ? `\n👉 *Aviso:* Número oculto pelo WhatsApp. Procure pela conversa de *${nomeCliente}* no seu aplicativo.`
            : `\n👉 Link: https://wa.me/${numeroParaLink}`;

        const textoBruto = data.message.conversation || data.message.extendedTextMessage?.text || '';

        return {
            numeroCliente, // Usado apenas para enviar mensagens (EvolutionService)
            numeroReal,    // Usado como Chave Primária no Banco de Dados
            fromMe,
            nomeCliente,
            linkAlerta,
            textoBruto,
            texto: textoBruto.toLowerCase().trim(),
            reply: async (t) => {
                // Registra a resposta do bot no histórico da conversa
                if (sessao) {
                    if (!Array.isArray(sessao.historicoIa)) sessao.historicoIa = [];
                    sessao.historicoIa.push({
                        role: 'model',
                        parts: [{ text: t }]
                    });
                    if (sessao.historicoIa.length > 30) {
                        sessao.historicoIa = sessao.historicoIa.slice(-30);
                    }
                }
                return await EvolutionService.enviarMensagemText(numeroCliente, t);
            }
        };
    }

    static async _processarAcoesAdmin(texto, numeroReal, sessao) {
        const textoLimpo = texto.toLowerCase().trim();

        if (textoLimpo === '/pausarbot') { 
            await this.setPausadoGlobalmente(true);
            return; 
        }
        if (textoLimpo === '/ligarbot') { 
            await this.setPausadoGlobalmente(false);
            return; 
        }
        
        // Se o vendedor mandou mensagem e não é um comando/emoji automático do bot, assume atendimento humano
        const isMsgBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖', '🛒', '👉 Link:'].some(e => texto.includes(e));
        
        if (!isMsgBot) {
            if (!Array.isArray(sessao.historicoIa)) sessao.historicoIa = [];
            sessao.historicoIa.push({
                role: 'model',
                parts: [{ text: `[Atendente Humano]: ${texto}` }]
            });
            if (sessao.historicoIa.length > 30) {
                sessao.historicoIa = sessao.historicoIa.slice(-30);
            }

            if (sessao.etapa !== 'em_atendimento_humano') {
                sessao.etapa = 'em_atendimento_humano';
                const numeroLimpoParaTag = numeroReal.split('@')[0];
                await EvolutionService.gerenciarEtiqueta(numeroLimpoParaTag, '8', 'remove').catch(() => {});
                await EvolutionService.gerenciarEtiqueta(numeroLimpoParaTag, '7', 'add').catch(() => {});
            }
        }
    }

    static async _processarComandosCliente(info, sessao) {
        const { texto, numeroCliente, reply } = info;

        if (texto === '/bot' || texto === '/menu' || texto === 'menu') {
            sessao.etapa = 'inicio';
            sessao.errosConsecutivos = 0;
            sessao.carrinho = []; 
            
            await EvolutionService.gerenciarEtiqueta(numeroCliente, '7', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroCliente, '8', 'add').catch(() => {});

            await estagios['inicio'].executar(info, texto, sessao);
            return true; 
        }

        if (texto === 'carrinho' || texto === '/carrinho') {
            await this._exibirResumoCarrinho(sessao, reply);
            return true;
        }

        return false; // Não interceptou nenhum comando
    }

    static async _exibirResumoCarrinho(sessao, reply) {
        if (!sessao.carrinho || sessao.carrinho.length === 0) {
            await reply("🛒 *Seu carrinho está vazio no momento!*\n\nDigite *#* para ver o nosso menu de produtos e começar a comprar. 🍯");
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

        await reply(resumo);
        sessao.etapa = 'carrinho_opcoes';
    }
}

module.exports = BotController;