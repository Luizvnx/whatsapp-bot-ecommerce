const BotController = require('./botController');
const DatabaseService = require('../services/DatabaseService');

const bufferMensagens = new Map();
const MAX_BUFFER_SIZE = 1000;

function extrairTextoMensagem(message) {
    if (!message) return '';
    let msg = message;
    // Desembrulha mensagens temporárias, visualização única ou documentos com legenda
    while (msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message) {
        msg = msg.ephemeralMessage?.message 
           || msg.viewOnceMessage?.message 
           || msg.viewOnceMessageV2?.message 
           || msg.documentWithCaptionMessage?.message;
    }

    return (
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        msg?.videoMessage?.caption ||
        msg?.documentMessage?.caption ||
        msg?.buttonsResponseMessage?.selectedButtonId ||
        msg?.buttonsResponseMessage?.selectedDisplayText ||
        msg?.templateButtonReplyMessage?.selectedId ||
        msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        ''
    );
}

function normalizarNumero(key, data) {
    let remoteJid = key?.remoteJid || '';
    if (remoteJid.includes('@lid')) {
        if (data?.sender && data.sender.includes('@s.whatsapp.net')) {
            remoteJid = data.sender;
        } else if (key?.participant && key.participant.includes('@s.whatsapp.net')) {
            remoteJid = key.participant;
        }
    }
    if (remoteJid.includes(':') && remoteJid.includes('@')) {
        const [usuario, dominio] = remoteJid.split('@');
        const usuarioLimpo = usuario.split(':')[0];
        remoteJid = `${usuarioLimpo}@${dominio}`;
    }
    return remoteJid;
}

class WebhookController {
    static async handleEvolutionWebhook(req, res) {
        res.sendStatus(200); // Resposta imediata para a Evolution API

        const { event, data } = req.body;
        if (event !== 'messages.upsert' || !data?.key || !data?.message) return;

        const texto = extrairTextoMensagem(data.message);
        const numeroReal = normalizarNumero(data.key, data);
        if (!texto || !numeroReal) return;

        console.log(`📩 [Webhook] Mensagem recebida de ${numeroReal} (fromMe: ${Boolean(data.key.fromMe)}): "${texto}"`);

        // Se a mensagem partiu do próprio atendente/número da loja (fromMe), processa imediatamente sem buffer
        if (data.key.fromMe) {
            data.message = { conversation: texto };
            await BotController.processarMensagem(data);
            return;
        }

        // Limpeza preventiva de memória
        if (bufferMensagens.size > MAX_BUFFER_SIZE) bufferMensagens.clear();

        if (!bufferMensagens.has(numeroReal)) {
            bufferMensagens.set(numeroReal, { 
                data, 
                textos: [], 
                timer: null,
                nome: data.pushName || 'Cliente' 
            });
        }

        const sessaoBuffer = bufferMensagens.get(numeroReal);
        sessaoBuffer.textos.push(texto);

        clearTimeout(sessaoBuffer.timer);
        sessaoBuffer.timer = setTimeout(() => WebhookController.finalizarProcessamento(numeroReal), 3500);
    }

    static async finalizarProcessamento(numeroReal) {
        const buffer = bufferMensagens.get(numeroReal);
        if (!buffer) return;

        const textoCompleto = buffer.textos.join(' ');
        buffer.data.message = { conversation: textoCompleto }; // Normaliza para o BotController

        try {
            const sql = `
                INSERT INTO tb_bot_sessoes (id_cliente, nome_contato, etapa, ultima_msg, dados_sessao) 
                VALUES ($1, $2, 'inicio', NOW(), '{}')
                ON CONFLICT (id_cliente) DO UPDATE SET 
                    nome_contato = EXCLUDED.nome_contato, 
                    ultima_msg = NOW();
            `;
            await DatabaseService.executar(sql, [numeroReal, buffer.nome]);
            
            await BotController.processarMensagem(buffer.data);
        } catch (err) {
            console.error('❌ Erro no processamento final:', err.message);
        } finally {
            bufferMensagens.delete(numeroReal);
        }
    }
}

module.exports = WebhookController;