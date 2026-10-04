const SessionService = require('../services/SessionService');
const EvolutionService = require('../services/EvolutionService');
const BotController = require('./BotController');

// Cache em memória para desduplicação de mensagens por ID (evita duplicidade enviada pela Evolution API/Baileys)
const mensagensProcessadasCache = new Set();

function extrairBase64Valido(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        if (raw.trim() === '' || raw.includes('[object Object]')) return null;
        return raw;
    }
    if (Buffer.isBuffer(raw)) {
        return raw.toString('base64');
    }
    if (typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
        return Buffer.from(raw.data).toString('base64');
    }
    return null;
}

async function extrairDadosMensagem(message, fullData = null) {
    if (!message) return { texto: '', tipo: 'texto' };
    let msg = message;
    while (msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message) {
        msg = msg.ephemeralMessage?.message 
           || msg.viewOnceMessage?.message 
           || msg.viewOnceMessageV2?.message 
           || msg.documentWithCaptionMessage?.message;
    }

    if (msg?.stickerMessage) {
        let base64 = extrairBase64Valido(msg.stickerMessage.base64) || extrairBase64Valido(msg.base64) || extrairBase64Valido(fullData?.base64) || extrairBase64Valido(fullData?.message?.base64);
        const thumb = extrairBase64Valido(msg.stickerMessage.pngThumbnail);
        if (!base64 && thumb) {
            base64 = `data:image/png;base64,${thumb}`;
        }
        if (!base64 && fullData?.key) {
            base64 = await EvolutionService.obterBase64DeMidia(fullData);
        }
        return {
            texto: '[🎨 Figurinha]',
            tipo: 'figurinha',
            mediaUrl: msg.stickerMessage.url || null,
            mimetype: msg.stickerMessage.mimetype || 'image/webp',
            mediaBase64: base64
        };
    }

    if (msg?.imageMessage) {
        let base64 = extrairBase64Valido(msg.imageMessage.base64) || extrairBase64Valido(msg.base64) || extrairBase64Valido(fullData?.base64) || extrairBase64Valido(fullData?.message?.base64);
        const thumb = extrairBase64Valido(msg.imageMessage.jpegThumbnail);
        if (!base64 && thumb) {
            base64 = `data:image/jpeg;base64,${thumb}`;
        }
        if (!base64 && fullData?.key) {
            base64 = await EvolutionService.obterBase64DeMidia(fullData);
        }
        return {
            texto: msg.imageMessage.caption || '[🖼️ Imagem]',
            tipo: 'imagem',
            mediaUrl: msg.imageMessage.url || null,
            mimetype: msg.imageMessage.mimetype || 'image/jpeg',
            mediaBase64: base64
        };
    }

    if (msg?.audioMessage) {
        let base64 = extrairBase64Valido(msg.audioMessage.base64) || extrairBase64Valido(msg.base64) || extrairBase64Valido(fullData?.base64) || extrairBase64Valido(fullData?.message?.base64);
        if (!base64 && fullData?.key) {
            base64 = await EvolutionService.obterBase64DeMidia(fullData);
        }
        return {
            texto: '[🎙️ Mensagem de Voz]',
            tipo: 'audio',
            mediaUrl: msg.audioMessage.url || null,
            mimetype: msg.audioMessage.mimetype || 'audio/ogg; codecs=opus',
            mediaBase64: base64
        };
    }

    if (msg?.documentMessage) {
        let base64 = extrairBase64Valido(msg.documentMessage.base64) || extrairBase64Valido(msg.base64) || extrairBase64Valido(fullData?.base64) || extrairBase64Valido(fullData?.message?.base64);
        if (!base64 && fullData?.key) {
            base64 = await EvolutionService.obterBase64DeMidia(fullData);
        }
        return {
            texto: msg.documentMessage.caption || msg.documentMessage.fileName || '[📄 Documento]',
            tipo: 'documento',
            fileName: msg.documentMessage.fileName || 'arquivo.pdf',
            mimetype: msg.documentMessage.mimetype || 'application/pdf',
            mediaUrl: msg.documentMessage.url || null,
            mediaBase64: base64
        };
    }

    if (msg?.videoMessage) {
        let base64 = extrairBase64Valido(msg.videoMessage.base64) || extrairBase64Valido(msg.base64) || extrairBase64Valido(fullData?.base64) || extrairBase64Valido(fullData?.message?.base64);
        const thumb = extrairBase64Valido(msg.videoMessage.jpegThumbnail);
        if (!base64 && thumb) {
            base64 = `data:image/jpeg;base64,${thumb}`;
        }
        if (!base64 && fullData?.key) {
            base64 = await EvolutionService.obterBase64DeMidia(fullData);
        }
        return {
            texto: msg.videoMessage.caption || '[🎥 Vídeo]',
            tipo: 'video',
            mediaUrl: msg.videoMessage.url || null,
            mimetype: msg.videoMessage.mimetype || 'video/mp4',
            mediaBase64: base64
        };
    }

    const textoSimples = (
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.buttonsResponseMessage?.selectedButtonId ||
        msg?.buttonsResponseMessage?.selectedDisplayText ||
        msg?.templateButtonReplyMessage?.selectedId ||
        msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        ''
    );

    return {
        texto: textoSimples,
        tipo: 'texto'
    };
}

function extrairContextInfo(message, fullData = null) {
    if (!message && !fullData) return null;

    let msg = message;
    while (msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message) {
        msg = msg.ephemeralMessage?.message 
           || msg.viewOnceMessage?.message 
           || msg.viewOnceMessageV2?.message 
           || msg.documentWithCaptionMessage?.message;
    }

    const context = (
        msg?.extendedTextMessage?.contextInfo ||
        msg?.imageMessage?.contextInfo ||
        msg?.videoMessage?.contextInfo ||
        msg?.audioMessage?.contextInfo ||
        msg?.documentMessage?.contextInfo ||
        msg?.stickerMessage?.contextInfo ||
        msg?.buttonsResponseMessage?.contextInfo ||
        msg?.templateButtonReplyMessage?.contextInfo ||
        msg?.listResponseMessage?.contextInfo ||
        msg?.interactiveResponseMessage?.contextInfo ||
        msg?.contextInfo ||
        fullData?.message?.contextInfo ||
        fullData?.contextInfo
    );

    if (!context || !context.quotedMessage) return null;

    let quoted = context.quotedMessage;
    while (quoted?.ephemeralMessage?.message || quoted?.viewOnceMessage?.message || quoted?.viewOnceMessageV2?.message || quoted?.documentWithCaptionMessage?.message) {
        quoted = quoted.ephemeralMessage?.message 
              || quoted.viewOnceMessage?.message 
              || quoted.viewOnceMessageV2?.message 
              || quoted.documentWithCaptionMessage?.message;
    }

    let texto = '';
    let tipo = 'texto';

    if (quoted.conversation) {
        texto = quoted.conversation;
    } else if (quoted.extendedTextMessage?.text) {
        texto = quoted.extendedTextMessage.text;
    } else if (quoted.imageMessage) {
        texto = quoted.imageMessage.caption || '[🖼️ Imagem]';
        tipo = 'imagem';
    } else if (quoted.videoMessage) {
        texto = quoted.videoMessage.caption || '[🎥 Vídeo]';
        tipo = 'video';
    } else if (quoted.audioMessage) {
        texto = '[🎙️ Mensagem de Voz]';
        tipo = 'audio';
    } else if (quoted.documentMessage) {
        texto = quoted.documentMessage.fileName || quoted.documentMessage.caption || '[📄 Documento]';
        tipo = 'documento';
    } else if (quoted.stickerMessage) {
        texto = '[🎨 Figurinha]';
        tipo = 'figurinha';
    } else if (quoted.buttonsResponseMessage?.selectedDisplayText) {
        texto = quoted.buttonsResponseMessage.selectedDisplayText;
    } else if (quoted.templateButtonReplyMessage?.selectedDisplayText) {
        texto = quoted.templateButtonReplyMessage.selectedDisplayText;
    } else if (quoted.listResponseMessage?.title) {
        texto = quoted.listResponseMessage.title;
    } else {
        texto = '[Mensagem citada]';
    }

    return {
        id: context.stanzaId || null,
        participant: context.participant || null,
        fromMe: Boolean(context.fromMeQuoted),
        texto: texto,
        tipo: tipo
    };
}

function normalizarNumero(key, data) {
    let remoteJid = key?.remoteJid || '';

    // Se o remoteJid for um LID interno do WhatsApp (ex: 23348113359018@lid), busca o JID real com número de telefone (@s.whatsapp.net)
    if (remoteJid.includes('@lid')) {
        const candidatos = [
            data?.sender,
            key?.participant,
            data?.participant,
            data?.key?.participant,
            data?.remoteJidAlt,
            data?.key?.remoteJidAlt,
            data?.senderAlt,
            data?.key?.senderAlt
        ];
        for (const cand of candidatos) {
            if (cand && typeof cand === 'string' && cand.includes('@s.whatsapp.net')) {
                remoteJid = cand;
                break;
            }
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
    static registrarMensagemEnviadaPeloBot(msgId) {
        if (!msgId) return;
        mensagensProcessadasCache.add(msgId);
        if (mensagensProcessadasCache.size > 3000) {
            const firstVal = mensagensProcessadasCache.values().next().value;
            mensagensProcessadasCache.delete(firstVal);
        }
    }

    static async handleEvolutionWebhook(req, res) {
        res.sendStatus(200); // Resposta imediata para a Evolution API

        try {
            const { event, data } = req.body;
            const eventLower = (event || '').toLowerCase();

            // 1. Tratamento do Evento: Mensagem Excluída no WhatsApp (messages.delete)
            if (eventLower === 'messages.delete' || eventLower === 'messages_delete' || eventLower === 'message.delete') {
                const itens = Array.isArray(data) ? data : (Array.isArray(data?.keys) ? data.keys : [data?.key || data]);
                for (const item of itens) {
                    if (!item) continue;
                    const targetKey = item.key || item;
                    const targetMsgId = targetKey?.id || item?.id;
                    if (!targetMsgId) continue;
                    const numeroReal = normalizarNumero(targetKey, item) || normalizarNumero(data?.key, data);
                    const isFromMe = Boolean(targetKey?.fromMe ?? item?.fromMe);
                    const apagadaPor = isFromMe ? 'atendente' : 'cliente';
                    console.log(`🗑️ [Webhook] Mensagem ${targetMsgId} marcada como apagada (${apagadaPor}) em ${numeroReal || 'busca-global'}`);
                    await SessionService.marcarMensagemApagada(numeroReal, targetMsgId, apagadaPor);
                }
                return;
            }

            if ((eventLower !== 'messages.upsert' && eventLower !== 'messages_upsert') || !data?.key || !data?.message) return;

            // 2. Tratamento de Protocol Message (Revoke / Exclusão embutida no messages.upsert)
            const protoMsg = data?.message?.protocolMessage;
            if (protoMsg && (protoMsg.type === 0 || protoMsg.type === 'REVOKE' || String(protoMsg.type) === '0')) {
                const revokedKey = protoMsg.key;
                const targetMsgId = revokedKey?.id;
                if (targetMsgId) {
                    const numeroReal = normalizarNumero(revokedKey || data.key, data);
                    const isFromMe = Boolean(revokedKey?.fromMe ?? data.key?.fromMe);
                    const apagadaPor = isFromMe ? 'atendente' : 'cliente';
                    console.log(`🗑️ [Webhook] Mensagem ${targetMsgId} revogada (protocolMessage) por ${apagadaPor} em ${numeroReal || 'busca-global'}`);
                    await SessionService.marcarMensagemApagada(numeroReal, targetMsgId, apagadaPor);
                    return;
                }
            }

            // 3. Filtro de Desduplicação por Message ID da Evolution/Baileys
            const msgId = data.key?.id;
            if (msgId) {
                if (mensagensProcessadasCache.has(msgId)) {
                    return; // Já processou esta mensagem exata
                }
                mensagensProcessadasCache.add(msgId);
                if (mensagensProcessadasCache.size > 3000) {
                    const firstVal = mensagensProcessadasCache.values().next().value;
                    mensagensProcessadasCache.delete(firstVal);
                }
            }

            // 4. Extração e Normalização do Número do Cliente
            const numeroReal = normalizarNumero(data.key, data);

            // 3. Filtro de Segurança: Ignorar JIDs anônimos de dispositivo (@lid) sem número de telefone associado
            if (!numeroReal || numeroReal.includes('@lid')) {
                return;
            }

            const infoMsg = await extrairDadosMensagem(data.message, data);
            const isFromMe = Boolean(data.key.fromMe);
            const nomeContato = data.pushName || 'Cliente';

            if (!infoMsg.texto) return;

            // Extrai dados de mensagem citada/respondida se houver
            const infoQuoted = extrairContextInfo(data.message, data);
            let quotedFormatado = null;
            if (infoQuoted) {
                let autor = 'Mensagem';
                let remetenteCitado = null;

                if (infoQuoted.fromMe) {
                    autor = 'Atendente';
                    remetenteCitado = 'atendente';
                } else if (infoQuoted.participant && (infoQuoted.participant.includes(numeroReal.split('@')[0]) || infoQuoted.participant.includes('@lid'))) {
                    autor = nomeContato || 'Cliente';
                    remetenteCitado = 'cliente';
                } else {
                    autor = isFromMe ? (nomeContato || 'Cliente') : 'Atendente';
                    remetenteCitado = isFromMe ? 'cliente' : 'atendente';
                }

                quotedFormatado = {
                    id: infoQuoted.id,
                    texto: infoQuoted.texto,
                    autor: autor,
                    remetente: remetenteCitado,
                    tipo: infoQuoted.tipo
                };
            }

            console.log(`📩 [Webhook] Mensagem ${isFromMe ? 'ENVIADA (Dispositivo)' : 'RECEBIDA'} de ${numeroReal}: "${infoMsg.texto}" (${infoMsg.tipo})${quotedFormatado ? ` [Em resposta a: "${quotedFormatado.texto.substring(0, 25)}..."]` : ''}`);

            const remetente = isFromMe ? 'atendente' : 'cliente';
            await SessionService.adicionarMensagem(numeroReal, remetente, infoMsg.texto, isFromMe ? null : nomeContato, {
                tipo: infoMsg.tipo,
                mediaUrl: infoMsg.mediaUrl,
                mediaBase64: infoMsg.mediaBase64,
                fileName: infoMsg.fileName,
                mimetype: infoMsg.mimetype,
                messageId: msgId,
                whatsappMessageId: msgId,
                quoted: quotedFormatado
            });

            // 1. Se a mensagem foi enviada no WhatsApp (verificação se foi o bot ou atendente humano)
            if (isFromMe) {
                const isMsgBot = ['🐝', '👨‍🌾', '✅', '⚠️', '🔇', '⏳', '🤖', '🛒', '👉 Link:', '🍯'].some(e => (infoMsg.texto || '').includes(e));
                if (isMsgBot) {
                    // Mensagem automática enviada pelo robô: NÃO altera o modo para humano
                    return;
                }

                const conversa = await SessionService.obterConversa(numeroReal);
                if (conversa.modo_atendimento !== 'humano') {
                    await SessionService.alternarModoAtendimento(numeroReal, 'humano');
                }
                return;
            }

            // 2. Se a mensagem veio do cliente
            const conversa = await SessionService.obterConversa(numeroReal);
            const modoAtual = conversa.modo_atendimento || 'bot';
            const textoCliente = (infoMsg.texto || '').toLowerCase().trim();

            // Se o atendimento estiver 100% humano no momento:
            if (modoAtual === 'humano') {
                // Cliente pode reativar o bot a qualquer momento digitando /bot, menu ou #
                if (textoCliente === '/bot' || textoCliente === 'menu' || textoCliente === '#') {
                    await SessionService.alternarModoAtendimento(numeroReal, 'bot');
                    data.message = { conversation: infoMsg.texto };
                    await BotController.processarMensagem(data);
                }
                return; // Respeita o atendimento humano
            }

            // 3. Modo Bot Ativo: Executa o cérebro do Bot Favo de Mel
            data.message = { conversation: infoMsg.texto };
            await BotController.processarMensagem(data);

        } catch (err) {
            console.error('❌ Erro ao processar webhook da Evolution:', err.message);
        }
    }
}

module.exports = WebhookController;