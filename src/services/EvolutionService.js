const axios = require('axios');
const config = require('../config');

class EvolutionService {
    static get baseUrl() {
        return (process.env.EVOLUTION_URL || config.evolution.url || 'https://evolution-api-production-d166.up.railway.app').replace(/\/$/, '');
    }

    static get instanceName() {
        return process.env.EVOLUTION_INSTANCE_NAME || config.evolution.instance || 'ViP';
    }

    static get apiKey() {
        return process.env.EVOLUTION_API_KEY || config.evolution.apiKey || '176E007EAA4B-4D08-8DFE-5F77AF6E8E09';
    }

    /**
     * Envia uma mensagem de texto simples para um número (com suporte a resposta/citação)
     */
    static async enviarMensagemText(numero, texto, quoted = null) {
        const url = `${this.baseUrl}/message/sendText/${this.instanceName}`;

        const payload = {
            number: numero,
            text: texto
        };

        if (quoted && (quoted.id || quoted.whatsappMessageId)) {
            const quotedId = quoted.whatsappMessageId || quoted.id;
            const quotedObj = {
                key: {
                    id: quotedId,
                    ...(quoted.remoteJid ? { remoteJid: quoted.remoteJid } : {}),
                    ...(quoted.fromMe !== undefined ? { fromMe: quoted.fromMe } : {})
                },
                message: {
                    conversation: quoted.texto || 'Mensagem'
                }
            };
            payload.quoted = quotedObj;
            payload.options = { quoted: quotedObj };
        }

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Mensagem enviada via Evolution para ${numero}${quoted ? ' (com citação)' : ''}`);
            return response.data;
        } catch (erro) {
            console.error('[Erro Evolution] Falha ao enviar mensagem:', erro.response ? erro.response.data : erro.message);
            throw erro;
        }
    }

    /**
     * Envia um Menu de Lista clicável (List Message) com fallback automático para texto simples
     */
    static async enviarLista(numero, { title, description, buttonText, footerText, sections }, fallbackText = '') {
        const url = `${this.baseUrl}/message/sendList/${this.instanceName}`;
        const numeroLimpo = (numero || '').replace(/\D/g, '');

        const payload = {
            number: numeroLimpo,
            title: title || 'Menu de Opções',
            description: description || 'Selecione uma opção:',
            buttonText: buttonText || 'Ver Opções 🍯',
            footerText: footerText || 'Apiário Favo de Mel',
            sections: sections || []
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            console.log(`📋 Menu de Lista interativo enviado via Evolution para ${numeroLimpo}`);
            return response.data;
        } catch (erro) {
            console.warn('[EvolutionService] Falha ao enviar lista interativa (usando fallback de texto):', erro.response?.data || erro.message);
            if (fallbackText) {
                return await this.enviarMensagemText(numeroLimpo, fallbackText);
            }
            throw erro;
        }
    }

    /**
     * Envia Botões Clicáveis (Buttons Message) com fallback automático para texto simples
     */
    static async enviarBotoes(numero, { title, description, footer, buttons }, fallbackText = '') {
        const url = `${this.baseUrl}/message/sendButtons/${this.instanceName}`;
        const numeroLimpo = (numero || '').replace(/\D/g, '');

        const payload = {
            number: numeroLimpo,
            title: title || '',
            description: description || '',
            footer: footer || 'Apiário Favo de Mel',
            buttons: (buttons || []).map((b, idx) => ({
                buttonId: String(b.id || idx + 1),
                buttonText: {
                    displayText: b.text || b.titulo || `Opção ${idx + 1}`
                },
                type: 1
            }))
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            console.log(`🔘 Botões interativos enviados via Evolution para ${numeroLimpo}`);
            return response.data;
        } catch (erro) {
            console.warn('[EvolutionService] Falha ao enviar botões interativos (usando fallback de texto):', erro.response?.data || erro.message);
            if (fallbackText) {
                return await this.enviarMensagemText(numeroLimpo, fallbackText);
            }
            throw erro;
        }
    }

    /**
     * Auxiliar para remover o prefixo Data URI ("data:image/png;base64,") deixando apenas o Base64 puro
     */
    static limparBase64(base64String) {
        if (!base64String || typeof base64String !== 'string') return base64String;
        if (base64String.includes(';base64,')) {
            return base64String.split(';base64,')[1];
        }
        if (base64String.startsWith('data:')) {
            return base64String.split(',')[1];
        }
        return base64String;
    }

    /**
     * Envia um áudio (gravação de voz) para o WhatsApp (com suporte a resposta/citação)
     */
    static async enviarAudio(numero, base64Audio, quoted = null) {
        const url = `${this.baseUrl}/message/sendWhatsAppAudio/${this.instanceName}`;
        const audioPuro = this.limparBase64(base64Audio);

        const payload = {
            number: numero,
            audio: audioPuro,
            encoding: true
        };

        if (quoted && (quoted.id || quoted.whatsappMessageId)) {
            const quotedId = quoted.whatsappMessageId || quoted.id;
            const quotedObj = {
                key: {
                    id: quotedId,
                    ...(quoted.remoteJid ? { remoteJid: quoted.remoteJid } : {}),
                    ...(quoted.fromMe !== undefined ? { fromMe: quoted.fromMe } : {})
                },
                message: {
                    conversation: quoted.texto || 'Mensagem'
                }
            };
            payload.quoted = quotedObj;
            payload.options = { quoted: quotedObj };
        }

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`🎙️ Áudio enviado via Evolution para ${numero}${quoted ? ' (com citação)' : ''}`);
            return response.data;
        } catch (erro) {
            console.error('[Erro Evolution] Falha ao enviar áudio:', erro.response ? erro.response.data : erro.message);
            throw erro;
        }
    }

    /**
     * Envia uma mídia (imagem, documento, PDF, etc.) para o WhatsApp (com suporte a resposta/citação)
     */
    static async enviarMidia(numero, { media, mediatype, mimetype, fileName, caption = '', quoted = null }) {
        const url = `${this.baseUrl}/message/sendMedia/${this.instanceName}`;
        const numeroLimpo = (numero || '').replace(/\D/g, '');
        const isUrl = typeof media === 'string' && (media.startsWith('http://') || media.startsWith('https://'));
        
        let detectedMime = mimetype;
        if (!detectedMime && typeof media === 'string') {
            if (media.startsWith('data:')) {
                const match = media.match(/^data:([^;]+);base64,/);
                if (match) detectedMime = match[1];
            } else if (isUrl) {
                if (media.endsWith('.png')) detectedMime = 'image/png';
                else if (media.endsWith('.webp')) detectedMime = 'image/webp';
                else if (media.endsWith('.gif')) detectedMime = 'image/gif';
            }
        }
        if (!detectedMime) {
            detectedMime = mediatype === 'video' ? 'video/mp4' : (mediatype === 'document' ? 'application/pdf' : 'image/jpeg');
        }

        const ext = detectedMime === 'image/png' ? 'png' : (detectedMime === 'image/webp' ? 'webp' : 'jpg');
        const defaultFileName = mediatype === 'document' ? 'documento.pdf' : (mediatype === 'video' ? 'video.mp4' : `imagem.${ext}`);
        const mediaPura = isUrl ? media : this.limparBase64(media);

        const payload = {
            number: numeroLimpo,
            mediatype: mediatype || 'image',
            mimetype: detectedMime,
            caption: caption || '',
            media: mediaPura,
            fileName: fileName || defaultFileName
        };

        if (quoted && (quoted.id || quoted.whatsappMessageId)) {
            const quotedId = quoted.whatsappMessageId || quoted.id;
            const quotedObj = {
                key: {
                    id: quotedId,
                    ...(quoted.remoteJid ? { remoteJid: quoted.remoteJid } : {}),
                    ...(quoted.fromMe !== undefined ? { fromMe: quoted.fromMe } : {})
                },
                message: {
                    conversation: quoted.texto || 'Mensagem'
                }
            };
            payload.quoted = quotedObj;
            payload.options = { quoted: quotedObj };
        }

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📎 Mídia (${mediatype || 'image'}) enviada via Evolution para ${numeroLimpo}${quoted ? ' (com citação)' : ''}`);
            return response.data;
        } catch (erro) {
            if (!isUrl && typeof media === 'string') {
                try {
                    const fallbackPayload = {
                        ...payload,
                        media: media.startsWith('data:') ? media : `data:${detectedMime};base64,${mediaPura}`
                    };
                    const retryResp = await axios.post(url, fallbackPayload, {
                        headers: {
                            'apikey': this.apiKey,
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log(`📎 Mídia enviada com sucesso no retry (com data URI) para ${numeroLimpo}`);
                    return retryResp.data;
                } catch (_) {}
            }
            console.error('[Erro Evolution] Falha ao enviar mídia:', erro.response ? erro.response.data : erro.message);
            throw erro;
        }
    }

    /**
     * Obtém o status atual da conexão com a instância da Evolution API
     */
    static async obterStatusInstancia() {
        const url = `${this.baseUrl}/instance/connectionState/${this.instanceName}`;
        try {
            const response = await axios.get(url, {
                headers: { 'apikey': this.apiKey },
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            console.error('[Erro Evolution] Falha ao consultar status:', error.message);
            return null;
        }
    }

    /**
     * Obtém o conteúdo em Base64 de uma mensagem de mídia da Evolution API (fallback)
     */
    static async obterBase64DeMidia(data) {
        if (!data?.key || !data?.message) return null;
        const url = `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instanceName}`;

        try {
            const response = await axios.post(url, {
                message: {
                    key: data.key,
                    message: data.message
                },
                convertToMp3: false
            }, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            return response.data?.base64 || response.data?.mediaBase64 || null;
        } catch (error) {
            console.error('[Erro Evolution] Falha ao obter base64 da mídia:', error.response ? error.response.data : error.message);
            return null;
        }
    }

    /**
     * Verifica se um número possui conta ativa no WhatsApp
     */
    static async verificarNumeroWhatsApp(numero) {
        const url = `${this.baseUrl}/chat/whatsappNumbers/${this.instanceName}`;
        const numeroLimpo = numero.replace(/\D/g, '');

        try {
            const response = await axios.post(url, {
                numbers: [numeroLimpo]
            }, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            if (Array.isArray(response.data) && response.data.length > 0) {
                const info = response.data[0];
                return {
                    existe: Boolean(info.exists),
                    jid: info.jid || `${numeroLimpo}@s.whatsapp.net`,
                    numero: info.number || numeroLimpo
                };
            }
            return { existe: true, jid: `${numeroLimpo}@s.whatsapp.net`, numero: numeroLimpo };
        } catch (error) {
            console.warn('[EvolutionService] Falha ao verificar número no WhatsApp (usando fallback):', error.message);
            return { existe: true, jid: `${numeroLimpo}@s.whatsapp.net`, numero: numeroLimpo };
        }
    }

    /**
     * Gerencia etiquetas de um contato na Evolution API (com fallback silencioso)
     */
    static async gerenciarEtiqueta(numero, labelId, action = 'add') {
        const url = `${this.baseUrl}/chat/handleLabels/${this.instanceName}`;
        const numeroLimpo = (numero || '').replace(/\D/g, '');
        if (!numeroLimpo || !labelId) return null;

        try {
            const response = await axios.post(url, {
                number: numeroLimpo,
                labelId: String(labelId),
                action: action // 'add' ou 'remove'
            }, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            // Falhas de etiqueta são tratadas silenciosamente sem interromper o fluxo do robô
            console.warn(`[EvolutionService] Aviso ao gerenciar etiqueta ${labelId} (${action}) para ${numeroLimpo}:`, error.message);
            return null;
        }
    }

    /**
     * Cria um novo grupo no WhatsApp via Evolution API
     */
    static async criarGrupo(nomeGrupo, participantes = [], descricao = '') {
        const url = `${this.baseUrl}/group/create/${this.instanceName}`;

        const participantesFormatados = participantes.map(p => {
            const limpo = p.replace(/\D/g, '');
            return limpo.includes('@') ? limpo : `${limpo}@s.whatsapp.net`;
        });

        try {
            const response = await axios.post(url, {
                subject: nomeGrupo,
                participants: participantesFormatados,
                description: descricao || undefined
            }, {
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            console.log(`👥 Grupo criado com sucesso: ${nomeGrupo} (${response.data?.id})`);
            return response.data;
        } catch (error) {
            console.error('[EvolutionService] Falha ao criar grupo:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response?.message?.[0] || error.response?.data?.message || 'Falha ao criar grupo no WhatsApp.');
        }
    }

    /**
     * Exclui uma mensagem para todos no WhatsApp via Evolution API
     */
    static async apagarMensagemParaTodos(remoteJid, messageId, fromMe = true, participant = null) {
        if (!remoteJid || !messageId) {
            throw new Error('remoteJid e messageId são obrigatórios para apagar a mensagem.');
        }

        let jidFormatado = String(remoteJid).trim();
        if (!jidFormatado.includes('@')) {
            jidFormatado = `${jidFormatado.replace(/\D/g, '')}@s.whatsapp.net`;
        } else if (jidFormatado.includes(':')) {
            const [user, domain] = jidFormatado.split('@');
            jidFormatado = `${user.split(':')[0]}@${domain}`;
        }

        const url = `${this.baseUrl}/chat/deleteMessageForEveryone/${this.instanceName}`;
        const payload = {
            id: messageId,
            remoteJid: jidFormatado,
            fromMe: Boolean(fromMe)
        };
        if (participant) {
            payload.participant = participant;
        }

        const headers = {
            'apikey': this.apiKey,
            'Content-Type': 'application/json'
        };

        try {
            // 1. Tenta DELETE no endpoint padrão v2
            const response = await axios.delete(url, { headers, data: payload });
            console.log(`🗑️ Mensagem ${messageId} apagada para todos via Evolution (DELETE).`);
            return response.data;
        } catch (erroDelete) {
            // 2. Fallback para POST caso a versão instalada espere método POST
            if (erroDelete.response && (erroDelete.response.status === 405 || erroDelete.response.status === 404)) {
                try {
                    const responsePost = await axios.post(url, payload, { headers });
                    console.log(`🗑️ Mensagem ${messageId} apagada para todos via Evolution (POST fallback).`);
                    return responsePost.data;
                } catch (erroPost) {
                    // 3. Fallback para rota legada /message/delete
                    try {
                        const altUrl = `${this.baseUrl}/message/delete/${this.instanceName}`;
                        const responseAlt = await axios.delete(altUrl, { headers, data: payload });
                        console.log(`🗑️ Mensagem ${messageId} apagada para todos via Evolution (/message/delete fallback).`);
                        return responseAlt.data;
                    } catch (erroAlt) {
                        console.error('[Erro Evolution] Falha nos fallbacks de exclusão:', erroDelete.response?.data || erroDelete.message);
                        throw erroDelete;
                    }
                }
            }
            console.error('[Erro Evolution] Falha ao apagar mensagem para todos:', erroDelete.response ? erroDelete.response.data : erroDelete.message);
            throw erroDelete;
        }
    }
}

module.exports = EvolutionService;