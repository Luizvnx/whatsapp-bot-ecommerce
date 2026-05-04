const SessaoService = require('../services/SessionService'); 
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

// Variável de estado local (em ambientes escaláveis/cluster, isso deve ir para o Redis ou Banco de Dados)
let botPausadoGlobalmente = false; 

class BotController {
    
    static async processarMensagem(data) {
        if (!data?.key || !data?.message) return;

        const info = this._extrairDadosMensagem(data);
        if (!info.textoBruto) return;

        let sessao;
        
        try {
            // CORRETO: Busca a sessão usando o ID completo (numeroReal)
            sessao = await SessaoService.obterSessao(info.numeroReal);

            if (info.fromMe) {
                // CORREÇÃO: Passando info.numeroReal para as ações de admin
                await this._processarAcoesAdmin(info.texto, info.numeroReal, sessao);
                return; 
            }

            // 2. Verifica bloqueios globais ou de atendimento
            if (botPausadoGlobalmente || sessao.etapa === 'em_atendimento_humano' || sessao.processando) {
                return;
            }

            sessao.processando = true;

            // 3. Valida expiração da sessão (Avisos de expiração podem ir para o numero limpo via WPP)
            if (SessaoService.verificarExpiracao(sessao, info.numeroReal)) {
                await info.reply(mensagens.erros.sessaoExpirada);
                return;
            }

            // 4. Intercepta Comandos Globais do Cliente (/bot, /carrinho)
            const comandoInterceptado = await this._processarComandosCliente(info, sessao);
            if (comandoInterceptado) return; // Se for um comando, finaliza o fluxo aqui

            // 5. Executa o Estágio Atual
            const estagioAtual = estagios[sessao.etapa] || estagios['inicio'];
            await estagioAtual.executar(info, info.texto, sessao);

        } catch (error) {
            console.error(`❌ Erro processando cliente ${info?.numeroReal}:`, error);
        } finally {
            // Garante que a sessão seja salva e liberada independentemente de erros
            if (sessao) {
                sessao.processando = false; 
                // CORRETO: Salva usando o ID completo
                await SessaoService.salvarSessao(info.numeroReal, sessao).catch(console.error);
            }
        }
    }

    // ==========================================
    // MÉTODOS PRIVADOS DE APOIO
    // ==========================================

    static _extrairDadosMensagem(data) {
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
            reply: async (t) => await EvolutionService.enviarMensagemText(numeroCliente, t)
        };
    }

    // CORREÇÃO: Recebe numeroReal e usa ele para salvar a sessão e gerenciar etiquetas
    static async _processarAcoesAdmin(texto, numeroReal, sessao) {
        if (texto === '/pausarbot') { 
            botPausadoGlobalmente = true; 
            return; 
        }
        if (texto === '/ligarbot') { 
            botPausadoGlobalmente = false; 
            return; 
        }
        
        // Se o vendedor mandou mensagem e não é um comando/emoji do bot, assume atendimento humano
        const isMsgBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖', '🛒'].some(e => texto.includes(e));
        
        if (!isMsgBot && sessao.etapa !== 'em_atendimento_humano') {
            sessao.etapa = 'em_atendimento_humano';
            // CORREÇÃO: Salva no banco usando a chave correta
            await SessaoService.salvarSessao(numeroReal, sessao); 
            // CORREÇÃO: As APIs da Evolution preferem o número limpo para envio
            const numeroLimpoParaTag = numeroReal.split('@')[0];
            await EvolutionService.gerenciarEtiqueta(numeroLimpoParaTag, '8', 'remove').catch(() => {});
        }
    }

    static async _processarComandosCliente(info, sessao) {
        const { texto, numeroCliente, reply } = info;

        if (texto === '/bot') {
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