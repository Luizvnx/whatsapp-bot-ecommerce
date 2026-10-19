const axios = require('axios');
const OutputSanitizer = require('../utils/OutputSanitizer');

class GeminiService {
    static get apiKey() {
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    }

    /**
     * Prompts e Instruções do Sistema para a Loja Favo de Mel
     */
    static get systemInstruction() {
        return `Você é a atendente virtual da loja Favo de Mel (Aracaju/SE).
Tom de conversa: Natural, educado, direto e humano, como uma pessoa real atendendo no WhatsApp de uma loja.

REGRA CRÍTICA DE COMUNICAÇÃO:
- NUNCA use emojis em nenhuma mensagem. Não use abelhas, potes de mel, flores, setas ou nenhum outro emoji.
- Escreva de forma fluida, simples e agradável. Evite textos artificiais, robóticos ou excessivamente enfeitados.

CONHECIMENTO DA FAVO DE MEL:
- Loja física: Av. Deputado Pedro Valadares, 690, loja 8, Garden's Gallery - Bairro Jardins, Aracaju/SE (próximo ao Shopping Jardins).
- Horário: Segunda a Sexta, das 8h às 18h.
- Produtos:
  * Méis de Abelhas Nativas sem Ferrão (Mel de Jataí R$ 100, Moça Branca R$ 90, Uruçu R$ 80 - ricos em propriedades medicinais e com sabor floral único).
  * Mel com Favo de Cera 700g (R$ 70), Mel de Melato de Bracatinga (R$ 60 - escuro, sabor amadeirado, não cristaliza facilmente), Mel Puro Tradicional 1400g (R$ 67).
  * Própolis Verde e Vermelha (extratos concentrados R$ 30).
  * Geleia Real pura in natura (R$ 53) e em cápsulas (R$ 51).
  * Bebidas e Delícias: Hidromel tradicional (R$ 57 / R$ 28), Melomel de frutas (R$ 28), Molhos artesanais de maracujá, mostarda ou pimenta com mel (R$ 17 a R$ 25).
  * Cera de abelha bruta e alveolada para apicultura e artesanato.
- Serviços Especializados:
  * Captura e Resgate Seguro de Abelhas (remoção ecológica de enxames de residências e empresas para preservação em apiário).
  * Consultoria Apícola e Manejo (capacitação para novos e experientes criadores).
- Dica sobre mel: A cristalização é um fenômeno natural do mel 100% puro e cru, provando que ele não foi superaquecido ou adulterado.
- Catálogo e compras online: https://apiariofavodemel.com.br/catalogo

DIRETRIZES DE SAÍDA E CONTROLE DE QUALIDADE:
1. Se a mensagem do cliente for uma dúvida legítima sobre mel, abelhas, produtos da colmeia, catálogo ou serviços da Favo de Mel:
   - Defina "relacionadoComMelOuLoja": true e "transferirHumano": false.
   - Responda de forma direta, clara e prestativa (máximo de 2 parágrafos curtos).
   - Se for sobre compra ou preços, mencione o catálogo online: https://apiariofavodemel.com.br/catalogo.
2. Se o cliente pedir para falar com um atendente/humano ou reclamar:
   - Defina "transferirHumano": true e "intencao": "humano".
3. Se o assunto NÃO for relacionado a mel, abelhas, produtos da colmeia, catálogo ou serviços da loja (ex: assuntos gerais, aluguel, piadas, assuntos aleatórios sem relação com mel):
   - Defina "relacionadoComMelOuLoja": false, "transferirHumano": true e "intencao": "outro".
4. NUNCA invente informações não confirmadas. NUNCA utilize emojis.`;
    }

    /**
     * Schema de saída estruturada para o atendimento ao cliente
     */
    static get schemaAtendimentoCliente() {
        return {
            type: 'OBJECT',
            properties: {
                resposta: {
                    type: 'STRING',
                    description: 'Texto final limpo, humano e acolhedor formatado para WhatsApp (*negrito*). NUNCA utilize emojis. Sem prefixos e sem tags.'
                },
                transferirHumano: {
                    type: 'BOOLEAN',
                    description: 'True se a dúvida exigir intervenção de um atendente humano OU se o assunto não for sobre mel/produtos/loja.'
                },
                relacionadoComMelOuLoja: {
                    type: 'BOOLEAN',
                    description: 'True se a dúvida for sobre mel, abelhas, produtos da colmeia, catálogo ou serviços da Favo de Mel. False se for sobre qualquer outro assunto sem relação com mel/loja.'
                },
                intencao: {
                    type: 'STRING',
                    enum: ['duvida_produto', 'preco_catalogo', 'resgate_abelhas', 'consultoria', 'humano', 'outro'],
                    description: 'Intenção principal da mensagem do cliente.'
                },
                sugerirAcao: {
                    type: 'STRING',
                    enum: ['catalogo', 'resgate', 'consultoria', 'menu', 'nenhuma'],
                    description: 'Próxima ação recomendada para guiar o cliente no fluxo.'
                }
            },
            required: ['resposta', 'transferirHumano', 'relacionadoComMelOuLoja', 'intencao', 'sugerirAcao']
        };
    }

    /**
     * Responde dúvidas sobre a Favo de Mel utilizando Structured Outputs, Stop Sequences e tom humano sem emojis
     */
    static async perguntar(mensagemCliente, historicoCliente = []) {
        const keyGemini = this.apiKey;

        if (!keyGemini) {
            console.warn('⚠️ GEMINI_API_KEY não configurada no .env');
            return {
                resposta: "Desculpe, nosso assistente virtual está temporariamente indisponível. Para falar com a equipe, por favor aguarde um momento.",
                transferirHumano: true,
                intencao: 'humano',
                sugerirAcao: 'nenhuma'
            };
        }

        // Monta histórico recente limpo (máximo 8 turnos)
        const historicoRecente = (historicoCliente || []).slice(-8);
        const contents = [];

        historicoRecente.forEach(item => {
            const role = item.role === 'model' ? 'model' : 'user';
            const rawText = (item.parts && item.parts[0]?.text) ? item.parts[0].text : (item.text || '');
            const cleanText = OutputSanitizer.removerEmojis(OutputSanitizer.removerTagsRaciocinio(rawText)).trim();
            if (cleanText) {
                contents.push({ role, parts: [{ text: cleanText }] });
            }
        });

        contents.push({
            role: 'user',
            parts: [{ text: mensagemCliente.trim() }]
        });

        const modelosGemini = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];
        const stopSequences = ['\nCliente:', '\nUsuário:', '\nUser:', '\n[Cliente]:'];

        for (const model of modelosGemini) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyGemini}`;
                const payload = {
                    system_instruction: {
                        parts: [{ text: this.systemInstruction }]
                    },
                    contents,
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 700,
                        stopSequences,
                        responseMimeType: 'application/json',
                        responseSchema: this.schemaAtendimentoCliente
                    }
                };

                const response = await axios.post(url, payload, { timeout: 12000 });
                const cand = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

                if (cand) {
                    const parsed = OutputSanitizer.extrairJsonSeguro(cand);
                    if (parsed && typeof parsed.resposta === 'string') {
                        const respostaLimpa = OutputSanitizer.higienizarMensagemWhatsApp(parsed.resposta);
                        const relacionado = parsed.relacionadoComMelOuLoja !== false && parsed.intencao !== 'outro';
                        return {
                            resposta: respostaLimpa,
                            transferirHumano: Boolean(parsed.transferirHumano) || !relacionado,
                            relacionadoComMelOuLoja: relacionado,
                            intencao: parsed.intencao || (relacionado ? 'duvida_produto' : 'outro'),
                            sugerirAcao: parsed.sugerirAcao || 'nenhuma'
                        };
                    }

                    // Fallback de higienização caso JSON não venha estruturado
                    const respostaTexto = OutputSanitizer.higienizarMensagemWhatsApp(cand);
                    return {
                        resposta: respostaTexto,
                        transferirHumano: this._verificarNecessidadeHumano(respostaTexto),
                        relacionadoComMelOuLoja: true,
                        intencao: 'duvida_produto',
                        sugerirAcao: 'catalogo'
                    };
                }
            } catch (err) {
                console.warn(`[GeminiService] Falha no modelo ${model}:`, err.response?.data?.error?.message || err.message);
            }
        }

        // Fallback Seguro de Degradação Graciosa
        return {
            resposta: "Estou com uma pequena instabilidade para consultar as informações no momento. Vou transferir para nossa equipe te atender em instantes.",
            transferirHumano: true,
            intencao: 'humano',
            sugerirAcao: 'nenhuma'
        };
    }

    /**
     * Sugere uma resposta inteligente para o atendente humano aprovar e enviar pelo painel
     * Garante tom 100% humano, sem emojis, sem meta-comentários e sem aspas
     */
    static async sugerirResposta(historicoMensagens = [], nomeContato = 'Cliente') {
        const key = this.apiKey;
        const historicoRecente = (Array.isArray(historicoMensagens) ? historicoMensagens : [])
            .slice(-12)
            .map(m => {
                const quem = m.remetente === 'atendente' ? (m.atendenteNome || 'Atendente') : (nomeContato || 'Cliente');
                return `${quem}: ${m.texto || '[Mídia]'}`;
            })
            .join('\n');

        if (!key || !historicoRecente.trim()) {
            return `Olá, ${nomeContato || 'tudo bem'}! Como posso te ajudar hoje com nossos produtos da Favo de Mel?`;
        }

        const prompt = `Você é um atendente humano experiente da loja Favo de Mel (Aracaju/SE).
Analise o histórico recente com o cliente "${nomeContato}" e crie uma resposta recomendada ideal para o atendente enviar pelo WhatsApp.
A resposta deve ser cordial, acolhedora, objetiva e soar exatamente como uma pessoa real digitando.
REGRA: NÃO utilize nenhum emoji.

HISTÓRICO RECENTE:
${historicoRecente}

Gere a mensagem pronta para envio imediato.`;

        const schemaSugestao = {
            type: 'OBJECT',
            properties: {
                mensagemSugerida: {
                    type: 'STRING',
                    description: 'Texto limpo da mensagem a ser enviada ao cliente no WhatsApp, sem emojis, sem introduções e sem aspas.'
                },
                resumoContexto: {
                    type: 'STRING',
                    description: 'Breve explicação interna do motivo da sugestão.'
                }
            },
            required: ['mensagemSugerida']
        };

        const modelos = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

        for (const model of modelos) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                const response = await axios.post(url, {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 500,
                        stopSequences: ['\nCliente:', '\nUsuário:', '\nAtendente:'],
                        responseMimeType: 'application/json',
                        responseSchema: schemaSugestao
                    }
                }, { timeout: 10000 });

                const cand = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (cand) {
                    const parsed = OutputSanitizer.extrairJsonSeguro(cand);
                    if (parsed?.mensagemSugerida) {
                        return OutputSanitizer.higienizarMensagemWhatsApp(parsed.mensagemSugerida);
                    }
                    return OutputSanitizer.higienizarMensagemWhatsApp(cand);
                }
            } catch (err) {
                console.warn(`[GeminiService] Falha ao sugerir resposta com ${model}:`, err.message);
            }
        }

        return `Olá, ${nomeContato}! Estou verificando sua solicitação aqui e já te passo mais detalhes em instantes.`;
    }

    /**
     * Gera um resumo estruturado da conversa para o operador e CRM (sem emojis)
     */
    static async resumirConversa(historicoMensagens = [], nomeContato = 'Cliente') {
        const key = this.apiKey;
        const historicoTexto = (Array.isArray(historicoMensagens) ? historicoMensagens : [])
            .slice(-30)
            .map(m => {
                const quem = m.remetente === 'atendente' ? (m.atendenteNome || 'Atendente') : (nomeContato || 'Cliente');
                return `[${quem}]: ${m.texto || '[Mídia]'}`;
            })
            .join('\n');

        if (!key || !historicoTexto.trim()) {
            return `Resumo do Atendimento:\n- Cliente: ${nomeContato}\n- Total de mensagens: ${(historicoMensagens || []).length}\n- Sem dados suficientes para gerar resumo inteligente.`;
        }

        const prompt = `Você é um assistente de CRM da Favo de Mel. Analise o histórico desta conversa com o cliente "${nomeContato}" e gere um resumo conciso sem utilizar emojis.

HISTÓRICO:
${historicoTexto}`;

        const schemaResumo = {
            type: 'OBJECT',
            properties: {
                cliente: { type: 'STRING', description: 'Nome e perfil do cliente' },
                objetivo: { type: 'STRING', description: 'Interesse principal do cliente' },
                status: { type: 'STRING', description: 'Status atual do atendimento' },
                proximaAcao: { type: 'STRING', description: 'Ação recomendada para o operador' },
                resumoFormatado: { type: 'STRING', description: 'Resumo completo em tópicos profissionais sem emojis' }
            },
            required: ['cliente', 'objetivo', 'status', 'proximaAcao', 'resumoFormatado']
        };

        const modelos = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

        for (const model of modelos) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                const response = await axios.post(url, {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 600,
                        responseMimeType: 'application/json',
                        responseSchema: schemaResumo
                    }
                }, { timeout: 10000 });

                const cand = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (cand) {
                    const parsed = OutputSanitizer.extrairJsonSeguro(cand);
                    if (parsed?.resumoFormatado) {
                        return OutputSanitizer.higienizarMensagemWhatsApp(parsed.resumoFormatado);
                    }
                    return OutputSanitizer.higienizarMensagemWhatsApp(cand);
                }
            } catch (err) {
                console.warn(`[GeminiService] Falha ao resumir conversa com ${model}:`, err.message);
            }
        }

        return `Resumo do Atendimento:\n- Cliente: ${nomeContato}\n- Mensagens trocadas: ${(historicoMensagens || []).length}\n- Status: Atendimento em andamento.`;
    }

    /**
     * Fallback heurístico caso a chamada não retorne Structured Output
     */
    static _verificarNecessidadeHumano(texto) {
        if (!texto) return false;
        const t = texto.toLowerCase();
        return t.includes('encaminhar para nossos atendentes humanos') ||
               t.includes('solicitação específica que vou encaminhar') ||
               t.includes('aguarde só um momento que já vamos te responder') ||
               t.includes('vou transferir') ||
               t.includes('atendente humano');
    }
}

module.exports = GeminiService;