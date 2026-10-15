class OutputSanitizer {
    /**
     * Remove todos os emojis e símbolos pictográficos para manter tom 100% humano e natural
     */
    static removerEmojis(texto) {
        if (!texto || typeof texto !== 'string') return '';
        // Normaliza números e símbolos com keycaps (ex: 1️⃣ -> 1, #️⃣ -> #)
        let t = texto.replace(/([0-9#*])[\uFE0F\u20E3]+/g, '$1');
        const emojiRegex = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F9B0}-\u{1F9B3}\u{FE0F}\u{200D}\u{20E3}\u{2600}-\u{27BF}]/gu;
        return t
            .replace(emojiRegex, '')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/ ([.,!?;:])/g, '$1')
            .trim();
    }

    /**
     * Remove tags de raciocínio interno (<thought>, <think>, <reasoning>)
     */
    static removerTagsRaciocinio(texto) {
        if (!texto || typeof texto !== 'string') return '';
        return texto
            .replace(/<(thought|think|reasoning)>[\s\S]*?<\/\1>/gi, '')
            .replace(/\[(?:pensamento|raciocínio|reasoning)[\s\S]*?\]/gi, '')
            .trim();
    }

    /**
     * Remove delimitadores de código markdown (```json ... ```) se envolverem a mensagem
     */
    static desempacotarMarkdown(texto) {
        if (!texto || typeof texto !== 'string') return '';
        let t = texto.trim();
        if (t.startsWith('```') && t.endsWith('```')) {
            t = t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '').replace(/\n?```$/, '').trim();
        }
        return t;
    }

    /**
     * Remove introduções conversacionais metalinguísticas (ex: "Aqui está sua resposta:", "Sugestão:")
     */
    static removerMetatextoEIntroducoes(texto) {
        if (!texto || typeof texto !== 'string') return '';
        let t = texto.trim();

        const padroesIntro = [
            /^(?:aqui está (?:uma )?(?:sugestão|resposta|mensagem)(?: recomendada)?(?:\s+(?:para o|ao) (?:cliente|atendente))?:\s*)/i,
            /^(?:sugestão(?: de resposta)?|resposta(?: recomendada)?|mensagem(?: sugerida)?):\s*/i,
            /^(?:atendente|assistente|bot|favo de mel):\s*/i,
            /^(?:com certeza[,!]?|claro[,!]?|com prazer[,!]?)\s*(?:aqui está (?:a|uma) resposta:?\s*)?/i
        ];

        for (const padrao of padroesIntro) {
            t = t.replace(padrao, '').trim();
        }

        // Remove aspas externas se o modelo colocou toda a resposta entre aspas
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('“') && t.endsWith('”'))) {
            t = t.slice(1, -1).trim();
        }

        return t;
    }

    /**
     * Corta alucinações de turnos seguintes do diálogo (Freio de Mão em Stop Sequences)
     */
    static aplicarFreioDeMao(texto) {
        if (!texto || typeof texto !== 'string') return '';
        const regexParada = /(?:\r?\n)+(?:cliente|usuário|usuario|user|customer|atendente):\s*[\s\S]*$/i;
        return texto.replace(regexParada, '').trim();
    }

    /**
     * Adequa a formatação Markdown para os padrões nativos do WhatsApp
     */
    static normalizarFormatacaoWhatsApp(texto) {
        if (!texto || typeof texto !== 'string') return '';
        let t = texto;

        // Converte cabeçalhos Markdown (# Título) para negrito do WhatsApp (*Título*)
        t = t.replace(/^#{1,6}\s+([^\n]+)$/gm, '*$1*');

        // Converte tachado de Markdown (~~texto~~) para tachado do WhatsApp (~texto~)
        t = t.replace(/~~([^~]+)~~/g, '~$1~');

        // Converte links no formato [texto](url) para "texto (url)"
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');

        // Limita quebras de linha excessivas (no máximo 2 consecutivas)
        t = t.replace(/\n{3,}/g, '\n\n');

        return t.trim();
    }

    /**
     * Pipeline completo de higienização de saída para o WhatsApp (100% livre de emojis e ruídos)
     */
    static higienizarMensagemWhatsApp(textoBruto) {
        if (!textoBruto || typeof textoBruto !== 'string') return '';
        
        let limpo = this.removerTagsRaciocinio(textoBruto);
        limpo = this.desempacotarMarkdown(limpo);

        // Se por algum motivo vazou uma string JSON bruta, resgata a mensagem limpa
        if (limpo.startsWith('{') && (limpo.includes('"resposta"') || limpo.includes('"mensagemSugerida"') || limpo.includes('"resumoFormatado"'))) {
            const extraido = this.extrairJsonSeguro(limpo);
            if (extraido?.resposta) limpo = extraido.resposta;
            else if (extraido?.mensagemSugerida) limpo = extraido.mensagemSugerida;
            else if (extraido?.resumoFormatado) limpo = extraido.resumoFormatado;
        }

        // Limpa resquícios caso tenha sobrado fragmento de chave JSON
        limpo = limpo.replace(/^\{\s*"(?:resposta|mensagemSugerida|resumoFormatado)"\s*:\s*"?/i, '');
        if (limpo.endsWith('"}') || limpo.endsWith('}') || limpo.endsWith('"')) {
            limpo = limpo.replace(/(?:"\}|\}"|\}|")$/, '');
        }

        limpo = this.removerMetatextoEIntroducoes(limpo);
        limpo = this.aplicarFreioDeMao(limpo);
        limpo = this.normalizarFormatacaoWhatsApp(limpo);
        limpo = this.removerEmojis(limpo);

        return limpo;
    }

    /**
     * Extrai e faz parse seguro de JSON retornado pelo LLM, mesmo se houver ruído ou truncamento
     */
    static extrairJsonSeguro(texto) {
        if (!texto) return null;
        let t = this.removerTagsRaciocinio(texto);
        t = this.desempacotarMarkdown(t);

        try {
            return JSON.parse(t);
        } catch (_) {
            // 1. Tenta encontrar o bloco {...} mais externo
            const match = t.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (e) {}
            }

            // 2. Fallback resiliente: extrai propriedades via Regex mesmo se o JSON foi cortado antes de fechar
            const matchProp = t.match(/"(?:resposta|mensagemSugerida|resumoFormatado)"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
            if (matchProp) {
                try {
                    const parsedVal = JSON.parse(`"${matchProp[1]}"`);
                    return {
                        resposta: parsedVal,
                        mensagemSugerida: parsedVal,
                        resumoFormatado: parsedVal
                    };
                } catch (_) {
                    const unescaped = matchProp[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    return {
                        resposta: unescaped,
                        mensagemSugerida: unescaped,
                        resumoFormatado: unescaped
                    };
                }
            }
        }
        return null;
    }
}

module.exports = OutputSanitizer;
