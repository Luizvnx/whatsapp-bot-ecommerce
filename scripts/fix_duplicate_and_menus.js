const fs = require('fs');
const path = require('path');

// 1. Atualizar SessionService.js para ter desduplicação em adicionarMensagem
function updateSessionService() {
    const filePath = path.join(__dirname, '..', 'src', 'services', 'SessionService.js');
    let code = fs.readFileSync(filePath, 'utf8');

    if (!code.includes('// Desduplicação determinística:')) {
        const target = "const whatsappMsgId = extraData.whatsappMessageId || extraData.messageId || null;";
        const replacement = `const whatsappMsgId = extraData.whatsappMessageId || extraData.messageId || null;

            // Desduplicação determinística: impede que a mesma mensagem seja adicionada 2x
            // (ex: envio do bot + eco do webhook da Evolution API)
            const buscaId = whatsappMsgId || extraData.messageId || extraData.id;
            if (buscaId) {
                const jaExiste = conversa.historicoMensagens.find(m => 
                    m.id === buscaId || 
                    m.whatsappMessageId === buscaId
                );
                if (jaExiste) {
                    if (extraData.mediaUrl && !jaExiste.mediaUrl) jaExiste.mediaUrl = extraData.mediaUrl;
                    if (extraData.mediaBase64 && !jaExiste.mediaBase64) jaExiste.mediaBase64 = extraData.mediaBase64;
                    return jaExiste;
                }
            }`;

        code = code.replace(target, replacement);
        fs.writeFileSync(filePath, code, 'utf8');
        console.log('✅ SessionService: Desduplicação de mensagens adicionada com sucesso!');
    }
}

// 2. Atualizar WebhookController.js com registrarMensagemEnviadaPeloBot e filtro de eco
function updateWebhookController() {
    const filePath = path.join(__dirname, '..', 'src', 'controllers', 'WebhookController.js');
    let code = fs.readFileSync(filePath, 'utf8');

    if (!code.includes('static registrarMensagemEnviadaPeloBot')) {
        code = code.replace(
            'class WebhookController {',
            `class WebhookController {
    static registrarMensagemEnviadaPeloBot(msgId) {
        if (!msgId) return;
        mensagensProcessadasCache.add(msgId);
    }`
        );
        console.log('✅ WebhookController: registrarMensagemEnviadaPeloBot adicionado com sucesso!');
    }

    // Se a mensagem foi enviada pelo próprio bot (isFromMe), evitar adicionar novamente se já for mensagem do bot
    if (!code.includes('// Ignora eco de mensagens enviadas pelo próprio robô')) {
        const target = "const remetente = isFromMe ? 'atendente' : 'cliente';";
        const replacement = `// Ignora eco de mensagens enviadas pelo próprio robô se já tiverem sido registradas
            if (isFromMe && msgId && mensagensProcessadasCache.has(msgId)) {
                return;
            }

            const remetente = isFromMe ? 'atendente' : 'cliente';`;
        code = code.replace(target, replacement);
        console.log('✅ WebhookController: Filtro de eco do bot adicionado com sucesso!');
    }

    fs.writeFileSync(filePath, code, 'utf8');
}

// 3. Atualizar BotController.js para registrar msgId em reply
function updateBotController() {
    const filePath = path.join(__dirname, '..', 'src', 'controllers', 'BotController.js');
    let code = fs.readFileSync(filePath, 'utf8');

    // Garantir que WebhookController.registrarMensagemEnviadaPeloBot é chamado em reply
    if (!code.includes('WebhookController.registrarMensagemEnviadaPeloBot(msgId)')) {
        code = code.replace(
            'const resp = await EvolutionService.enviarMensagemText(numeroCliente, t);\n                const msgId = resp?.key?.id || null;',
            `const resp = await EvolutionService.enviarMensagemText(numeroCliente, t);
                const msgId = resp?.key?.id || null;
                if (msgId) {
                    try {
                        const WebhookController = require('./WebhookController');
                        WebhookController.registrarMensagemEnviadaPeloBot(msgId);
                    } catch (_) {}
                }`
        );
    }

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ BotController: Registro de msgId validado!');
}

// 4. Limpar mensagens duplicadas consecutivas no banco para sessões existentes
async function limparMensagensDuplicadasBanco() {
    const DatabaseService = require('../src/services/DatabaseService');
    const res = await DatabaseService.executar("SELECT id_cliente, dados_sessao FROM tb_bot_sessoes");

    let totalRemovidas = 0;
    for (const row of res.rows) {
        let dados = typeof row.dados_sessao === 'string' ? JSON.parse(row.dados_sessao) : (row.dados_sessao || {});
        if (!Array.isArray(dados.historicoMensagens) || dados.historicoMensagens.length === 0) continue;

        const msgs = dados.historicoMensagens;
        const msgsLimpos = [];
        const idsVistos = new Set();

        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            const msgId = m.whatsappMessageId || m.id;
            
            // Verifica duplicidade exata por ID ou mensagem consecutiva idêntica no mesmo minuto
            const prev = msgsLimpos[msgsLimpos.length - 1];
            const isRepetidaConsecutiva = prev && 
                prev.remetente === m.remetente && 
                prev.texto === m.texto && 
                Math.abs(new Date(prev.timestamp || 0) - new Date(m.timestamp || 0)) < 15000;

            if (msgId && idsVistos.has(msgId)) {
                totalRemovidas++;
                continue;
            }
            if (isRepetidaConsecutiva) {
                totalRemovidas++;
                continue;
            }

            if (msgId) idsVistos.add(msgId);
            msgsLimpos.push(m);
        }

        if (msgsLimpos.length !== msgs.length) {
            dados.historicoMensagens = msgsLimpos;
            await DatabaseService.executar(
                "UPDATE tb_bot_sessoes SET dados_sessao = $1 WHERE id_cliente = $2",
                [JSON.stringify(dados), row.id_cliente]
            );
            console.log(`🧹 ${row.id_cliente}: ${msgs.length - msgsLimpos.length} mensagens duplicadas removidas!`);
        }
    }
    console.log(`✅ Total de duplicatas limpas no PostgreSQL: ${totalRemovidas}`);
}

(async () => {
    try {
        updateSessionService();
        updateWebhookController();
        updateBotController();
        await limparMensagensDuplicadasBanco();
        console.log('🚀 Desduplicação aplicada e histórico higienizado!');
        process.exit(0);
    } catch (e) {
        console.error('❌ Erro:', e);
        process.exit(1);
    }
})();
