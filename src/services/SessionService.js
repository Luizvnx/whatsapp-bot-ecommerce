const DatabaseService = require('./DatabaseService');
const SocketService = require('./SocketService');

class SessionService {
    // Fila sequencial em memória por cliente para evitar condições de corrida (Race Conditions)
    static queues = new Map();
    // Cache em memória para leitura ultrarrápida intra-requisições (elimina queries redundantes)
    static cacheConversas = new Map();
    static CACHE_SESSAO_TTL = 8000; // 8 segundos de cache

    /**
     * Normaliza qualquer identificador para o JID canônico do WhatsApp (@s.whatsapp.net)
     */
    static normalizarId(id) {
        if (!id || typeof id !== 'string') return id;
        const limpo = id.trim();
        if (limpo.includes('@lid') || limpo.includes('@g.us')) return limpo;
        const numero = limpo.split('@')[0].split(':')[0].replace(/\D/g, '');
        return numero ? `${numero}@s.whatsapp.net` : limpo;
    }

    /**
     * Executa operações para o mesmo cliente de forma estritamente sequencial
     */
    static async enfileirar(chave, fn) {
        const prevPromise = this.queues.get(chave) || Promise.resolve();
        const nextPromise = prevPromise.then(fn, fn);
        this.queues.set(chave, nextPromise);
        nextPromise.finally(() => {
            if (this.queues.get(chave) === nextPromise) {
                this.queues.delete(chave);
            }
        });
        return nextPromise;
    }

    /**
     * Formata o número de telefone para um padrão legível e amigável (ex: (79) 98856-2587)
     */
    static formatarNumeroWhatsapp(idOuNumero) {
        if (!idOuNumero) return 'Cliente';
        const digits = String(idOuNumero).split('@')[0].split(':')[0].replace(/\D/g, '');
        if (digits.length === 13 && digits.startsWith('55')) {
            const ddd = digits.substring(2, 4);
            const p1 = digits.substring(4, 9);
            const p2 = digits.substring(9);
            return `(${ddd}) ${p1}-${p2}`;
        }
        if (digits.length === 12 && digits.startsWith('55')) {
            const ddd = digits.substring(2, 4);
            const p1 = digits.substring(4, 8);
            const p2 = digits.substring(8);
            return `(${ddd}) ${p1}-${p2}`;
        }
        if (digits.length === 11) {
            const ddd = digits.substring(0, 2);
            const p1 = digits.substring(2, 7);
            const p2 = digits.substring(7);
            return `(${ddd}) ${p1}-${p2}`;
        }
        return digits ? `+${digits}` : 'Cliente';
    }

    /**
     * Valida se uma string é um nome real e legítimo do cliente
     */
    static isNomeContatoValido(nome) {
        if (!nome || typeof nome !== 'string') return false;
        const n = nome.trim().toLowerCase();
        if (!n || n === 'undefined' || n === 'null') return false;
        if (n === 'cliente' || n === 'um cliente' || n === 'você' || n === 'voce') return false;
        if (n.includes('bot favo') || n === 'favo de mel' || n.includes('atendente') || n.includes('favo de mel')) return false;
        // Rejeita strings que não possuem pelo menos uma letra (ex: números puros, pontuação)
        const letras = n.replace(/[^a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/g, '');
        if (letras.length === 0) return false;
        return true;
    }

    /**
     * Atualiza explicitamente o nome de um contato (usado pelo painel ou sincronização)
     */
    static async atualizarNomeContato(numeroCliente, novoNome) {
        const idCanonico = this.normalizarId(numeroCliente);
        return await this.enfileirar(idCanonico, async () => {
            const conversa = await this.obterConversa(idCanonico);
            const nomeFinal = this.isNomeContatoValido(novoNome) ? novoNome.trim() : this.formatarNumeroWhatsapp(idCanonico);
            conversa.nome_contato = nomeFinal;
            await this.salvarConversa(idCanonico, conversa);
            return conversa;
        });
    }

    /**
     * Obtém ou inicializa a conversa de um cliente
     */
    static async obterConversa(numeroCliente) {
        const idCanonico = this.normalizarId(numeroCliente);
        const numeroLimpo = idCanonico.split('@')[0];
        const agora = Date.now();

        // 1. Checa cache em memória para evitar queries desnecessárias e acelerar a resposta do bot
        const cached = this.cacheConversas.get(idCanonico);
        if (cached && (agora - cached.timestamp < this.CACHE_SESSAO_TTL)) {
            return cached.dados;
        }
        
        // Busca determinística pela sessão mais recente, cobrindo variações de sufixo
        const sql = `
            SELECT id_cliente, nome_contato, etapa, dados_sessao, ultima_msg 
            FROM tb_bot_sessoes 
            WHERE id_cliente = $1 OR id_cliente = $2 
            ORDER BY ultima_msg DESC 
            LIMIT 1
        `;
        const result = await DatabaseService.executar(sql, [idCanonico, numeroLimpo]);

        if (result.rows.length > 0) {
            const row = result.rows[0];
            let dados = typeof row.dados_sessao === 'string' ? JSON.parse(row.dados_sessao) : (row.dados_sessao || {});
            dados.id_cliente = idCanonico;
            
            let nomeFinal = this.isNomeContatoValido(row.nome_contato) 
                ? row.nome_contato.trim() 
                : (this.isNomeContatoValido(dados.nome_contato) ? dados.nome_contato.trim() : this.formatarNumeroWhatsapp(idCanonico));
            dados.nome_contato = nomeFinal;
            
            // Retrocompatibilidade para conversas anteriores
            if (!Array.isArray(dados.historicoMensagens)) {
                if (Array.isArray(dados.historicoIa)) {
                    dados.historicoMensagens = dados.historicoIa.map(m => {
                        const isUser = m.role === 'user';
                        const txt = (m.parts && m.parts[0]?.text) ? m.parts[0].text : (m.text || m.content || '');
                        const isHuman = txt.startsWith('[Atendente Humano]:');
                        return {
                            id: Date.now().toString(),
                            remetente: isUser ? 'cliente' : 'atendente',
                            texto: isHuman ? txt.replace('[Atendente Humano]:', '').trim() : txt,
                            timestamp: new Date().toISOString()
                        };
                    });
                } else {
                    dados.historicoMensagens = [];
                }
            }

            this.cacheConversas.set(idCanonico, { dados, timestamp: Date.now() });
            return dados;
        }

        const conversaInicial = {
            id_cliente: idCanonico,
            nome_contato: this.formatarNumeroWhatsapp(idCanonico),
            historicoMensagens: [],
            criadoEm: new Date().toISOString()
        };

        await this.salvarConversa(idCanonico, conversaInicial);
        return conversaInicial;
    }

    /**
     * Salva as informações e histórico da conversa no PostgreSQL
     */
    static async salvarConversa(numeroCliente, dadosConversa) {
        const idCanonico = this.normalizarId(numeroCliente);
        dadosConversa.id_cliente = idCanonico;
        
        const nomeParaSalvar = this.isNomeContatoValido(dadosConversa.nome_contato)
            ? dadosConversa.nome_contato.trim()
            : this.formatarNumeroWhatsapp(idCanonico);
        dadosConversa.nome_contato = nomeParaSalvar;

        this.cacheConversas.set(idCanonico, { dados: dadosConversa, timestamp: Date.now() });

        const sql = `
            INSERT INTO tb_bot_sessoes (id_cliente, nome_contato, etapa, dados_sessao, ultima_msg)
            VALUES ($1, $2, 'atendimento', $3, CURRENT_TIMESTAMP)
            ON CONFLICT (id_cliente) 
            DO UPDATE SET 
                nome_contato = CASE 
                    -- 1. Se o novo nome é um nome legítimo com letras reais (não é bot nem genérico)
                    WHEN EXCLUDED.nome_contato IS NOT NULL 
                         AND EXCLUDED.nome_contato != 'Cliente' 
                         AND EXCLUDED.nome_contato NOT ILIKE '%bot favo%'
                         AND EXCLUDED.nome_contato NOT ILIKE '%favo de mel%'
                         AND EXCLUDED.nome_contato ~ '[a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]'
                    THEN EXCLUDED.nome_contato 

                    -- 2. Se o registro atual no banco já possui um nome legítimo com letras, preserva ele
                    WHEN tb_bot_sessoes.nome_contato IS NOT NULL 
                         AND tb_bot_sessoes.nome_contato != 'Cliente' 
                         AND tb_bot_sessoes.nome_contato NOT ILIKE '%bot favo%'
                         AND tb_bot_sessoes.nome_contato NOT ILIKE '%favo de mel%'
                         AND tb_bot_sessoes.nome_contato ~ '[a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]'
                    THEN tb_bot_sessoes.nome_contato

                    -- 3. Caso contrário, adota o novo nome (que é o telefone formatado amigável)
                    ELSE EXCLUDED.nome_contato 
                END,
                dados_sessao = EXCLUDED.dados_sessao,
                ultima_msg = CURRENT_TIMESTAMP;
        `;
        
        await DatabaseService.executar(sql, [
            idCanonico, 
            nomeParaSalvar,
            JSON.stringify(dadosConversa)
        ]);
    }

    /**
     * Adiciona uma mensagem enviada ou recebida ao histórico (com suporte a mídias e anexos)
     * Utiliza fila sequencial para prevenir race conditions de mensagens simultâneas.
     */
    static async adicionarMensagem(numeroCliente, remetente, texto, nomeContato = null, extraData = {}) {
        const idCanonico = this.normalizarId(numeroCliente);

        return await this.enfileirar(idCanonico, async () => {
            const conversa = await this.obterConversa(idCanonico);
            if (this.isNomeContatoValido(nomeContato)) {
                conversa.nome_contato = nomeContato.trim();
            }

            if (!Array.isArray(conversa.historicoMensagens)) {
                conversa.historicoMensagens = [];
            }

            const idMsg = extraData.messageId || extraData.id || (Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5));
            const whatsappMsgId = extraData.whatsappMessageId || extraData.messageId || null;

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
            }

            // Tratamento e enriquecimento da mensagem citada (quoted)
            let quotedFinal = null;
            if (extraData.quoted && typeof extraData.quoted === 'object') {
                quotedFinal = {
                    id: extraData.quoted.id || null,
                    whatsappMessageId: extraData.quoted.whatsappMessageId || extraData.quoted.id || null,
                    texto: extraData.quoted.texto || '',
                    autor: extraData.quoted.autor || 'Mensagem',
                    remetente: extraData.quoted.remetente || null,
                    tipo: extraData.quoted.tipo || 'texto'
                };

                if (quotedFinal.id || quotedFinal.whatsappMessageId) {
                    const buscaId = quotedFinal.whatsappMessageId || quotedFinal.id;
                    const msgOriginal = conversa.historicoMensagens.find(m => 
                        m.id === buscaId || 
                        m.whatsappMessageId === buscaId || 
                        (m.id && buscaId && (m.id.includes(buscaId) || buscaId.includes(m.id)))
                    );
                    if (msgOriginal) {
                        quotedFinal.texto = msgOriginal.texto || quotedFinal.texto;
                        quotedFinal.tipo = msgOriginal.tipo || quotedFinal.tipo;
                        if (msgOriginal.remetente === 'atendente') {
                            quotedFinal.autor = msgOriginal.atendenteNome ? `Atendente (${msgOriginal.atendenteNome})` : 'Atendente';
                            quotedFinal.remetente = 'atendente';
                        } else {
                            quotedFinal.autor = conversa.nome_contato || 'Cliente';
                            quotedFinal.remetente = 'cliente';
                        }
                    }
                }
            }

            const novaMensagem = {
                id: idMsg,
                whatsappMessageId: whatsappMsgId,
                remetente: remetente, // 'cliente' ou 'atendente'
                texto: texto,
                tipo: extraData.tipo || 'texto', // 'texto', 'audio', 'imagem', 'documento', 'figurinha', 'video'
                mediaUrl: extraData.mediaUrl || null,
                mediaBase64: extraData.mediaBase64 || null,
                fileName: extraData.fileName || null,
                mimetype: extraData.mimetype || null,
                atendenteNome: extraData.atendenteNome || null,
                quoted: quotedFinal,
                timestamp: new Date().toISOString()
            };

            conversa.historicoMensagens.push(novaMensagem);

            // Otimização de armazenamento inteligente de mídias:
            // Mantém base64 apenas nas 40 mídias mais recentes para não inflar o JSONB do banco.
            // Para mídias mais antigas, zera o Base64 mas preserva 100% dos metadados, links, tipo, texto e histórico!
            let countMidiasComBase64 = 0;
            for (let i = conversa.historicoMensagens.length - 1; i >= 0; i--) {
                const msg = conversa.historicoMensagens[i];
                if (msg.mediaBase64) {
                    countMidiasComBase64++;
                    if (countMidiasComBase64 > 40) {
                        msg.mediaBase64 = null; // Libera payload pesado de mídias antigas sem perder a mensagem
                    }
                }
            }

            // Aumenta a retenção para até 3.000 mensagens completas por conversa
            if (conversa.historicoMensagens.length > 3000) {
                conversa.historicoMensagens = conversa.historicoMensagens.slice(-3000);
            }

            await this.salvarConversa(idCanonico, conversa);

            // Transmite via WebSocket em tempo real para todos os atendentes
            try {
                SocketService.emitirNovaMensagem(idCanonico, novaMensagem, conversa.nome_contato);
            } catch (err) {
                console.error('⚠️ [SocketService] Falha ao emitir nova mensagem:', err.message);
            }

            return novaMensagem;
        });
    }

    /**
     * Alterna o modo de atendimento (ex: 'humano' ou 'copiloto')
     */
    static async alternarModoAtendimento(numeroCliente, modo) {
        const idCanonico = this.normalizarId(numeroCliente);
        const conversa = await this.obterConversa(idCanonico);
        conversa.modo_atendimento = modo; // 'humano' ou 'copiloto'
        await this.salvarConversa(idCanonico, conversa);

        if (SocketService.io) {
            SocketService.io.emit('modo_alterado', {
                idCliente: idCanonico,
                modo: modo
            });
        }
        return conversa;
    }

    /**
     * Marca uma mensagem como apagada no histórico (sem excluir do banco de dados)
     */
    static async marcarMensagemApagada(numeroCliente, idMensagem, apagadaPor = 'atendente') {
        if (!idMensagem) return null;
        let idCanonico = numeroCliente ? this.normalizarId(numeroCliente) : null;

        // Função interna para aplicar a exclusão lógica na conversa
        const aplicarExclusao = async (targetId) => {
            return await this.enfileirar(targetId, async () => {
                const conversa = await this.obterConversa(targetId);
                if (!Array.isArray(conversa.historicoMensagens)) {
                    return null;
                }

                const msg = conversa.historicoMensagens.find(m => 
                    m.id === idMensagem || 
                    m.whatsappMessageId === idMensagem ||
                    (m.id && idMensagem && (m.id.includes(idMensagem) || idMensagem.includes(m.id)))
                );

                if (!msg) return null;

                // Marcação lógica - preserva o conteúdo original para o atendente
                msg.apagada = true;
                msg.apagadaPor = apagadaPor; // 'atendente' ou 'cliente'
                msg.apagadaEm = new Date().toISOString();

                await this.salvarConversa(targetId, conversa);

                // Notifica os painéis em tempo real via WebSocket
                try {
                    SocketService.emitirMensagemApagada(targetId, msg.id, {
                        whatsappMessageId: msg.whatsappMessageId,
                        apagadaPor: apagadaPor,
                        apagadaEm: msg.apagadaEm
                    });
                } catch (err) {
                    console.error('⚠️ [SocketService] Falha ao emitir mensagem apagada:', err.message);
                }

                return msg;
            });
        };

        // 1. Tenta encontrar na conversa do número informado
        if (idCanonico && !idCanonico.includes('@lid')) {
            const resultado = await aplicarExclusao(idCanonico);
            if (resultado) return resultado;
        }

        // 2. Fallback determinístico: busca global no PostgreSQL pelo ID da mensagem
        try {
            const sql = `
                SELECT id_cliente 
                FROM tb_bot_sessoes 
                WHERE dados_sessao::text LIKE $1 
                LIMIT 1
            `;
            const busca = await DatabaseService.executar(sql, [`%"${idMensagem}"%`]);
            if (busca.rows.length > 0) {
                const idEncontrado = busca.rows[0].id_cliente;
                console.log(`🔍 [SessionService] Mensagem ${idMensagem} localizada via busca global na sessão ${idEncontrado}`);
                return await aplicarExclusao(idEncontrado);
            }
        } catch (dbErr) {
            console.error('❌ [SessionService] Erro na busca global por mensagem apagada:', dbErr.message);
        }

        console.warn(`⚠️ [SessionService] Mensagem ${idMensagem} não encontrada em nenhuma sessão para marcar como apagada.`);
        return null;
    }

    static async alterarEtapa(numeroCliente, novaEtapa, resetarCarrinho = false) {
        const idCanonico = this.normalizarId(numeroCliente);
        const conversa = await this.obterConversa(idCanonico);
        conversa.etapa = novaEtapa;
        conversa.processando = false;
        conversa.ultimaInteracao = Date.now();
        if (resetarCarrinho) {
            conversa.carrinho = [];
        }
        await this.salvarConversa(idCanonico, conversa);
        return conversa;
    }

    static async limparCarrinho(numeroCliente) {
        const idCanonico = this.normalizarId(numeroCliente);
        const conversa = await this.obterConversa(idCanonico);
        conversa.carrinho = [];
        await this.salvarConversa(idCanonico, conversa);
        return conversa;
    }

    static verificarExpiracao(sessao) {
        const TEMPO_LIMITE = 24 * 60 * 60 * 1000;
        let expirou = false;
        if (sessao.ultimaInteracao && (Date.now() - sessao.ultimaInteracao > TEMPO_LIMITE)) {
            sessao.etapa = 'menu_principal';
            sessao.carrinho = [];
            sessao.historicoIa = [];
            expirou = true;
        }
        sessao.ultimaInteracao = Date.now();
        return expirou;
    }

    // Métodos mantidos para retrocompatibilidade de chamadas legadas caso existam
    static async obterSessao(numeroCliente) { return this.obterConversa(numeroCliente); }
    static async salvarSessao(numeroCliente, sessao) {
        const idCanonico = this.normalizarId(numeroCliente);
        return await this.enfileirar(idCanonico, async () => {
            const conversaAtual = await this.obterConversa(idCanonico);
            if (Array.isArray(conversaAtual.historicoMensagens)) {
                sessao.historicoMensagens = conversaAtual.historicoMensagens;
            }
            sessao.id_cliente = idCanonico;
            await this.salvarConversa(idCanonico, sessao);
            return sessao;
        });
    }
}

module.exports = SessionService;