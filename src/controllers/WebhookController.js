const SessionService = require('../services/SessionService');
const EvolutionService = require('../services/EvolutionService');
const BotController = require('./BotController');

// Cache em memória para desduplicação de webhooks por Message ID (evita processar o mesmo webhook recebido 2x da Evolution API/Baileys)
const mensagensWebhookProcessadasCache = new Set();

// Cache em memória para rastrear mensagens enviadas ativamente pelo nosso sistema (Robô e Painel Administrativo)
// Mensagens aqui já foram gravadas no banco e emitidas via socket no momento do disparo. O eco via webhook deve ser ignorado para não duplicar.
const mensagensEnviadasPeloSistemaCache = new Set();

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
    while (
        msg?.ephemeralMessage?.message ||
        msg?.viewOnceMessage?.message ||
        msg?.viewOnceMessageV2?.message ||
        msg?.documentWithCaptionMessage?.message ||
        msg?.editedMessage?.message?.protocolMessage?.editedMessage ||
        msg?.editedMessage?.message
    ) {
        msg = msg.ephemeralMessage?.message
            || msg.viewOnceMessage?.message
            || msg.viewOnceMessageV2?.message
            || msg.documentWithCaptionMessage?.message
            || msg.editedMessage?.message?.protocolMessage?.editedMessage
            || msg.editedMessage?.message;
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

    if (msg?.contactMessage) {
        return {
            texto: `[👤 Contato: ${msg.contactMessage.displayName || 'Contato'}]`,
            tipo: 'contato'
        };
    }

    if (msg?.contactsArrayMessage) {
        return {
            texto: `[👥 Contatos (${msg.contactsArrayMessage.contacts?.length || 0})]`,
            tipo: 'contato'
        };
    }

    if (msg?.locationMessage || msg?.liveLocationMessage) {
        const loc = msg.locationMessage || msg.liveLocationMessage;
        return {
            texto: `[📍 Localização: ${loc.name || loc.address || 'Localização compartilhada'}]`,
            tipo: 'localizacao'
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

async function normalizarNumero(key, data) {
    let remoteJid = key?.remoteJid || data?.key?.remoteJid || '';
    const isFromMe = Boolean(key?.fromMe ?? data?.key?.fromMe ?? data?.fromMe);
    const numeroLoja = (process.env.NUMERO_DA_LOJA || '557988125726').replace(/\D/g, '');

    function isLoja(cand) {
        if (!cand || typeof cand !== 'string') return false;
        const digits = cand.split('@')[0].split(':')[0].replace(/\D/g, '');
        return Boolean(digits && numeroLoja && digits === numeroLoja);
    }

    // 1. Candidatos explícitos de telefone real (@s.whatsapp.net)
    // Se a mensagem foi enviada pelo celular do atendente (fromMe = true), o telefone do cliente está em remoteJidAlt ou remoteJid (NUNCA em sender, pois sender é a própria loja!)
    let candidatos = [];
    if (isFromMe) {
        candidatos = [
            key?.remoteJidAlt,
            data?.remoteJidAlt,
            data?.key?.remoteJidAlt,
            data?.recipient,
            data?.recipientAlt,
            key?.recipient
        ];
        // Se remoteJid já for @s.whatsapp.net e não for o número da loja
        if (remoteJid && remoteJid.includes('@s.whatsapp.net') && !isLoja(remoteJid)) {
            candidatos.push(remoteJid);
        }
    } else {
        // Mensagem recebida do cliente
        candidatos = [
            key?.remoteJidAlt,
            data?.remoteJidAlt,
            data?.key?.remoteJidAlt,
            (remoteJid && remoteJid.includes('@s.whatsapp.net') && !isLoja(remoteJid)) ? remoteJid : null,
            data?.sender,
            data?.key?.participant,
            data?.participant,
            key?.participant,
            data?.senderAlt,
            data?.key?.senderAlt
        ];
    }

    // Procura o primeiro candidato válido que seja @s.whatsapp.net e NÃO seja o número da própria loja
    for (const cand of candidatos) {
        if (cand && typeof cand === 'string' && cand.includes('@s.whatsapp.net') && !isLoja(cand)) {
            remoteJid = cand;
            break;
        }
    }

    // 2. Se ainda for um LID interno do WhatsApp (ex: 56023670861837@lid), busca resolver via cache/banco/Evolution
    if (remoteJid && remoteJid.includes('@lid')) {
        const phoneResolvido = await EvolutionService.resolverLidParaTelefone(remoteJid);
        if (phoneResolvido) {
            remoteJid = phoneResolvido;
        }
    }

    // 3. Se temos o remoteJid com @s.whatsapp.net E a chave continha um @lid (ex: key.remoteJid era @lid), grava no cache de mapeamento
    const originalJid = key?.remoteJid || data?.key?.remoteJid || '';
    if (originalJid && originalJid.includes('@lid') && remoteJid && remoteJid.includes('@s.whatsapp.net') && !isLoja(remoteJid)) {
        EvolutionService.registrarMapeamentoLid(originalJid, remoteJid);
    }

    // 4. Limpa sufixos de dispositivo (:0@s.whatsapp.net -> @s.whatsapp.net)
    if (remoteJid && remoteJid.includes(':') && remoteJid.includes('@')) {
        const [usuario, dominio] = remoteJid.split('@');
        const usuarioLimpo = usuario.split(':')[0];
        remoteJid = `${usuarioLimpo}@${dominio}`;
    }
    return remoteJid;
}

class WebhookController {
    static normalizarNumero = normalizarNumero;
    static registrarMensagemEnviadaPeloSistema(msgId) {
        if (!msgId) return;
        mensagensEnviadasPeloSistemaCache.add(msgId);
        if (mensagensEnviadasPeloSistemaCache.size > 5000) {
            const firstVal = mensagensEnviadasPeloSistemaCache.values().next().value;
            mensagensEnviadasPeloSistemaCache.delete(firstVal);
        }
    }

    static registrarMensagemEnviadaPeloBot(msgId) {
        this.registrarMensagemEnviadaPeloSistema(msgId);
    }

    static async handleEvolutionWebhook(req, res) {
        res.sendStatus(200); // Resposta imediata para a Evolution API

        try {
            const { event, data } = req.body;
            const eventLower = (event || '').toLowerCase();

            // 0. Tratamento do Evento: Status da Conexão (connection.update / status.instance)
            if (eventLower === 'connection.update' || eventLower === 'connection_update' || eventLower === 'status.instance' || eventLower === 'status_instance') {
                const statusState = data?.state || data?.status || req.body?.data?.state || 'desconhecido';
                console.log(`📡 [Webhook Evolution] Status da conexão WhatsApp atualizado: ${statusState}`);

                EvolutionService.cacheStatus = {
                    instance: { state: statusState }
                };
                EvolutionService.cacheStatusTimestamp = Date.now();
                if (statusState === 'open') {
                    EvolutionService.cacheQrCode = null;
                }

                try {
                    const SocketService = require('../services/SocketService');
                    SocketService.emitirStatusInstancia({
                        status: statusState,
                        instance: req.body?.instance || EvolutionService.instanceName
                    });
                } catch (e) {
                    console.error('[Webhook Evolution] Erro ao emitir status socket:', e.message);
                }
                return;
            }

            // 0.1. Tratamento do Evento: Novo QR Code Gerado (qrcode.updated)
            if (eventLower === 'qrcode.updated' || eventLower === 'qrcode_updated') {
                const qrCodeBase64 = data?.qrcode?.base64 || data?.base64 || req.body?.data?.qrcode?.base64 || null;
                if (qrCodeBase64) {
                    console.log(`📷 [Webhook Evolution] Novo QR Code recebido via webhook para ${req.body?.instance || EvolutionService.instanceName}`);
                    EvolutionService.cacheQrCode = {
                        base64: qrCodeBase64,
                        timestamp: Date.now()
                    };
                    try {
                        const SocketService = require('../services/SocketService');
                        SocketService.emitirStatusInstancia({
                            status: 'qrcode',
                            qrCodeBase64: qrCodeBase64,
                            instance: req.body?.instance || EvolutionService.instanceName
                        });
                    } catch (e) {
                        console.error('[Webhook Evolution] Erro ao emitir QR code socket:', e.message);
                    }
                }
                return;
            }

            // 1. Tratamento do Evento: Mensagem Excluída no WhatsApp (messages.delete)
            if (eventLower === 'messages.delete' || eventLower === 'messages_delete' || eventLower === 'message.delete') {
                const itens = Array.isArray(data) ? data : (Array.isArray(data?.keys) ? data.keys : [data?.key || data]);
                for (const item of itens) {
                    if (!item) continue;
                    const targetKey = item.key || item;
                    const targetMsgId = targetKey?.id || item?.id;
                    if (!targetMsgId) continue;
                    const numeroReal = (await normalizarNumero(targetKey, item)) || (await normalizarNumero(data?.key, data));
                    const isFromMe = Boolean(targetKey?.fromMe ?? item?.fromMe);
                    const apagadaPor = isFromMe ? 'atendente' : 'cliente';
                    console.log(`🗑️ [Webhook] Mensagem ${targetMsgId} marcada como apagada (${apagadaPor}) em ${numeroReal || 'busca-global'}`);
                    await SessionService.marcarMensagemApagada(numeroReal, targetMsgId, apagadaPor);
                }
                return;
            }

            if (
                (eventLower !== 'messages.upsert' && eventLower !== 'messages_upsert' && eventLower !== 'send.message' && eventLower !== 'send_message') ||
                !data?.key ||
                !data?.message
            ) {
                return;
            }

            // 2. Tratamento de Protocol Message (Revoke / Exclusão embutida no messages.upsert)
            const protoMsg = data?.message?.protocolMessage;
            if (protoMsg && (protoMsg.type === 0 || protoMsg.type === 'REVOKE' || String(protoMsg.type) === '0')) {
                const revokedKey = protoMsg.key;
                const targetMsgId = revokedKey?.id;
                if (targetMsgId) {
                    const numeroReal = await normalizarNumero(revokedKey || data.key, data);
                    const isFromMe = Boolean(revokedKey?.fromMe ?? data.key?.fromMe);
                    const apagadaPor = isFromMe ? 'atendente' : 'cliente';
                    console.log(`🗑️ [Webhook] Mensagem ${targetMsgId} revogada (protocolMessage) por ${apagadaPor} em ${numeroReal || 'busca-global'}`);
                    await SessionService.marcarMensagemApagada(numeroReal, targetMsgId, apagadaPor);
                    return;
                }
            }

            // 3. Filtro de Desduplicação de Webhook por Message ID da Evolution/Baileys
            const msgId = data.key?.id;
            if (msgId && mensagensWebhookProcessadasCache.has(msgId)) {
                return; // Já processou este evento de webhook para esta mensagem exata
            }

            // 4. Extração e Normalização do Número do Cliente (resolução profunda de LIDs e números)
            const numeroReal = await normalizarNumero(data.key, data);

            // 5. Filtros de Segurança: Ignorar JIDs anônimos de dispositivo (@lid) sem telefone associado e status@broadcast
            if (!numeroReal || numeroReal.includes('@lid') || numeroReal.includes('status@broadcast')) {
                return;
            }

            const infoMsg = await extrairDadosMensagem(data.message, data);
            const isFromMe = Boolean(data.key.fromMe);
            const rawPushName = (data.pushName && typeof data.pushName === 'string') ? data.pushName.trim() : null;
            const nomeContato = (!isFromMe && SessionService.isNomeContatoValido(rawPushName)) ? rawPushName : null;

            if (!infoMsg.texto) return;

            // Registra mensagem no cache de desduplicação apenas após confirmar conteúdo e destinatário válidos
            if (msgId) {
                mensagensWebhookProcessadasCache.add(msgId);
                if (mensagensWebhookProcessadasCache.size > 5000) {
                    const firstVal = mensagensWebhookProcessadasCache.values().next().value;
                    mensagensWebhookProcessadasCache.delete(firstVal);
                }
            }

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
                    autor = nomeContato || SessionService.formatarNumeroWhatsapp(numeroReal);
                    remetenteCitado = 'cliente';
                } else {
                    autor = isFromMe ? (nomeContato || SessionService.formatarNumeroWhatsapp(numeroReal)) : 'Atendente';
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

            console.log(`📩 [Webhook] Mensagem ${isFromMe ? 'ENVIADA (Dispositivo/Vendedor)' : 'RECEBIDA (Cliente)'} de ${numeroReal}: "${infoMsg.texto}" (${infoMsg.tipo})${quotedFormatado ? ` [Em resposta a: "${quotedFormatado.texto.substring(0, 25)}..."]` : ''}`);

            const lidOrigem = (data.key?.remoteJid && data.key.remoteJid.includes('@lid'))
                ? data.key.remoteJid.split('@')[0]
                : null;

            // 1. Se a mensagem foi enviada pelo WhatsApp (pelo próprio robô, pelo painel administrativo ou pelo celular/WhatsApp Web do vendedor)
            if (isFromMe) {
                // Se já estiver registrada no cache de envio do nosso sistema (Bot ou Painel)
                if (msgId && mensagensEnviadasPeloSistemaCache.has(msgId)) {
                    return; // Mensagem já enviada e registrada pelo sistema localmente (sem duplicar)
                }

                // Verifica se a mensagem já foi gravada previamente no histórico da conversa
                const conversa = await SessionService.obterConversa(numeroReal);
                const ultimasMsgs = (conversa.historicoMensagens || []).slice(-10);
                const jaExiste = ultimasMsgs.some(m =>
                    (msgId && (m.id === msgId || m.whatsappMessageId === msgId))
                );

                if (jaExiste) {
                    return; // Eco descartado sem duplicar!
                }

                // Se não foi enviada pelo robô nem pelo painel, é o vendedor/atendente humano digitando diretamente no celular ou WhatsApp Web
                await SessionService.adicionarMensagem(numeroReal, 'atendente', infoMsg.texto, nomeContato, {
                    tipo: infoMsg.tipo,
                    mediaUrl: infoMsg.mediaUrl,
                    mediaBase64: infoMsg.mediaBase64,
                    fileName: infoMsg.fileName,
                    mimetype: infoMsg.mimetype,
                    atendenteNome: 'Vendedor (Celular)',
                    messageId: msgId,
                    whatsappMessageId: msgId,
                    quoted: quotedFormatado,
                    lid: lidOrigem
                });

                if (conversa.modo_atendimento !== 'humano') {
                    await SessionService.alternarModoAtendimento(numeroReal, 'humano');
                }

                // Notifica o BotController para atualizar contexto de IA e tags de atendimento humano sem disparar resposta automática
                data.message = { conversation: infoMsg.texto };
                await BotController.processarMensagem(data);
                return;
            }

            // 2. Se a mensagem veio do cliente: grava no histórico e processa
            await SessionService.adicionarMensagem(numeroReal, 'cliente', infoMsg.texto, nomeContato, {
                tipo: infoMsg.tipo,
                mediaUrl: infoMsg.mediaUrl,
                mediaBase64: infoMsg.mediaBase64,
                fileName: infoMsg.fileName,
                mimetype: infoMsg.mimetype,
                messageId: msgId,
                whatsappMessageId: msgId,
                quoted: quotedFormatado,
                lid: lidOrigem
            });

            const conversa = await SessionService.obterConversa(numeroReal);
            const modoAtual = conversa.modo_atendimento || 'bot';
            const textoCliente = (infoMsg.texto || '').toLowerCase().trim();

            // Se o atendimento estiver 100% humano no momento:
            if (modoAtual === 'humano') {
                // Cliente pode reativar o bot a qualquer momento digitando /bot, menu ou #
                const comandosReativar = ['#', 'menu', '/menu', 'voltar', '/voltar', '/bot', 'bot', 'catalogo', 'catálogo', '0', 'inicio', 'início'];
                if (comandosReativar.includes(textoCliente)) {
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
            console.error('Erro ao processar webhook da Evolution:', err.message);
        }
    }
}

module.exports = WebhookController;