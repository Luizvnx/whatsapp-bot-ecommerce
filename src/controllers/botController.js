const SessaoService = require('../services/SessaoService');
const EvolutionService = require('../services/EvolutionService');
const mensagens = require('../data/mensagens.json');

const estagios = {
    'inicio': require('../stages/InicioStage'),
    'aguardando_categoria': require('../stages/CategoriaStage'),
    'aguardando_produto': require('../stages/ProdutoStage'),
    'conversando_com_ia': require('../stages/IaStage')
};

let botPausadoGlobalmente = false; 

class BotController {
    static async processarMensagem(data) {
        let sessao; // Definida aqui fora para ser acessada no catch
        try {
            if (!data?.key || !data?.message) return;

            const { remoteJid, fromMe } = data.key;
            const numeroCliente = remoteJid.replace('@s.whatsapp.net', '');
            const textoBruto = data.message.conversation || data.message.extendedTextMessage?.text || '';
            if (!textoBruto) return; 
            const texto = textoBruto.toLowerCase().trim();

            const msg = {
                from: numeroCliente,
                body: textoBruto,
                fromMe,
                reply: async (t) => await EvolutionService.enviarMensagemText(numeroCliente, t)
            };

            // 1. Pegar a sessão IMEDIATAMENTE
            sessao = SessaoService.obterSessao(numeroCliente);

            // 2. Comando Global /BOT (Funciona para todos)
            if (texto === '/bot') {
                sessao.etapa = 'inicio';
                sessao.processando = false; 
                sessao.errosConsecutivos = 0;
                await msg.reply(mensagens.geral.botReativado);
                
                // Tenta limpar etiquetas sem travar se falhar
                await EvolutionService.marcarComoNaoLida(numeroCliente, '7', 'remove').catch(() => {});
                await EvolutionService.marcarComoNaoLida(numeroCliente, '8', 'add').catch(() => {});

                // 👉 MÁGICA: Executa o menu NA HORA
                return await estagios['inicio'].executar(msg, texto, sessao);
            }

            // 3. Admin Global
            if (fromMe) {
                if (texto === '/pausarbot') { botPausadoGlobalmente = true; return; }
                if (texto === '/ligarbot') { botPausadoGlobalmente = false; return; }
                
                const isMsgBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖'].some(e => texto.includes(e));
                if (!isMsgBot && sessao.etapa !== 'em_atendimento_humano') {
                    sessao.etapa = 'em_atendimento_humano';
                    await EvolutionService.gerenciarEtiqueta(numeroCliente, '8', 'remove').catch(() => {});
                }
                return; 
            }

            if (botPausadoGlobalmente || sessao.etapa === 'em_atendimento_humano') return;
            if (sessao.processando) return;

            // 4. Execução de estágios para o cliente
            sessao.processando = true;
            const estagioAtual = estagios[sessao.etapa] || estagios['inicio'];
            await estagioAtual.executar(msg, texto, sessao);
            sessao.processando = false;

        } catch (error) {
            console.error('❌ Erro no BotController:', error);
            if (sessao) sessao.processando = false;
        }
    }
}

module.exports = BotController;