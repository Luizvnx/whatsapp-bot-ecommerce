const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const SessionService = require('../services/SessionService');
const EvolutionService = require('../services/EvolutionService');
const GeminiService = require('../services/GeminiService');
const CatalogoService = require('../services/CatalogoService');
const { atualizarPerfilUsuario, gerarTokenSessao } = require('../config/users');

// 1. ROTA VISUAL: Renders Painel de Chat
router.get('/', (req, res) => {
    res.render('dashboard', { user: req.user || { name: 'Atendente', email: '' } }); 
});

// 2. ROTA DE CONVERSAS (Lista de conversas ordenadas pela última mensagem)
router.get('/conversas', async (req, res) => {
    try {
        const { busca, limite = 100 } = req.query;
        let sql = `SELECT id_cliente, nome_contato, etapa, dados_sessao, ultima_msg FROM tb_bot_sessoes WHERE id_cliente NOT LIKE '%@lid%'`;
        const params = [];

        if (busca && busca.trim().length > 0) {
            params.push(`%${busca.trim()}%`);
            sql += ` AND (nome_contato ILIKE $${params.length} OR id_cliente ILIKE $${params.length})`;
        }

        params.push(Math.min(parseInt(limite) || 100, 300));
        sql += ` ORDER BY ultima_msg DESC LIMIT $${params.length}`;

        const result = await DatabaseService.executar(sql, params);

        const conversasFormatadas = result.rows.map(row => {
            let dados = typeof row.dados_sessao === 'string' ? JSON.parse(row.dados_sessao) : (row.dados_sessao || {});
            
            // Garantir extração correta de mensagens
            let mensagens = Array.isArray(dados.historicoMensagens) ? dados.historicoMensagens : [];
            if (mensagens.length === 0 && Array.isArray(dados.historicoIa)) {
                mensagens = dados.historicoIa.map(m => {
                    const isUser = m.role === 'user';
                    const txt = (m.parts && m.parts[0]?.text) ? m.parts[0].text : (m.text || m.content || '');
                    const isHuman = txt.startsWith('[Atendente Humano]:');
                    return {
                        id: Date.now().toString(),
                        remetente: isUser ? 'cliente' : 'atendente',
                        texto: isHuman ? txt.replace('[Atendente Humano]:', '').trim() : txt,
                        timestamp: row.ultima_msg
                    };
                });
            }

            const ultimaMensagemObj = mensagens[mensagens.length - 1];
            let previewTexto = 'Conversa iniciada';
            if (ultimaMensagemObj) {
                if (ultimaMensagemObj.apagada) {
                    previewTexto = '🚫 Mensagem apagada';
                } else if (ultimaMensagemObj.texto && ultimaMensagemObj.texto.trim()) {
                    previewTexto = ultimaMensagemObj.texto;
                } else if (ultimaMensagemObj.tipo) {
                    const icones = { 
                        audio: '🎙️ [Mensagem de Voz]', 
                        imagem: '🖼️ [Imagem]', 
                        video: '🎥 [Vídeo]', 
                        documento: `📄 [${ultimaMensagemObj.fileName || 'Documento'}]`, 
                        figurinha: '🎨 [Figurinha]' 
                    };
                    previewTexto = icones[ultimaMensagemObj.tipo] || `[${ultimaMensagemObj.tipo}]`;
                }
            }

            return {
                id_cliente: row.id_cliente,
                numeroLimpo: row.id_cliente.split('@')[0],
                nome_contato: SessionService.isNomeContatoValido(row.nome_contato) ? row.nome_contato.trim() : (SessionService.isNomeContatoValido(dados.nome_contato) ? dados.nome_contato.trim() : SessionService.formatarNumeroWhatsapp(row.id_cliente)),
                modo_atendimento: dados.modo_atendimento || 'humano',
                ultima_msg: row.ultima_msg,
                preview: previewTexto,
                mensagensTotal: mensagens.length
            };
        });

        res.json({ success: true, data: conversasFormatadas });
    } catch (err) {
        console.error('❌ Erro ao buscar lista de conversas:', err);
        res.status(500).json({ success: false, message: "Erro interno no BD" });
    }
});


// 3.0. ROTA PARA ATUALIZAR NOME DO CONTATO EXPLICITAMENTE
router.post('/conversa/:id_cliente/atualizar-nome', async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const { nome } = req.body;
        if (!id_cliente) return res.status(400).json({ success: false, message: 'ID do cliente obrigatório.' });

        const conversaAtualizada = await SessionService.atualizarNomeContato(id_cliente, nome);
        res.json({ success: true, nome_contato: conversaAtualizada.nome_contato });
    } catch (err) {
        console.error('❌ Erro ao atualizar nome do contato:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar nome do contato.' });
    }
});

// 3. ROTA DE DETALHES DE UMA CONVERSA (Histórico completo)
router.get('/conversa/:id_cliente', async (req, res) => {
    try {
        const { id_cliente } = req.params;
        if (!id_cliente) {
            return res.status(400).json({ success: false, message: 'ID do cliente é obrigatório.' });
        }

        const conversa = await SessionService.obterConversa(id_cliente);
        res.json({ success: true, data: conversa });
    } catch (err) {
        console.error('❌ Erro ao buscar detalhes da conversa:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar conversa.' });
    }
});

// 3.1. ROTA DE EXPORTAÇÃO DO HISTÓRICO EM TXT
router.get('/conversa/:id_cliente/exportar-txt', async (req, res) => {
    try {
        const { id_cliente } = req.params;
        if (!id_cliente) {
            return res.status(400).send('ID do cliente é obrigatório.');
        }

        const conversa = await SessionService.obterConversa(id_cliente);
        const nome = SessionService.isNomeContatoValido(conversa.nome_contato) ? conversa.nome_contato.trim() : SessionService.formatarNumeroWhatsapp(id_cliente);
        const numero = id_cliente.split('@')[0];
        const mensagens = Array.isArray(conversa.historicoMensagens) ? conversa.historicoMensagens : [];

        let txt = `================================================================\n`;
        txt += `HISTÓRICO DE ATENDIMENTO - VIP WHATSAPP\n`;
        txt += `================================================================\n`;
        txt += `Cliente: ${nome}\n`;
        txt += `Número: ${numero}\n`;
        txt += `Data da Exportação: ${new Date().toLocaleString('pt-BR')}\n`;
        txt += `Total de Mensagens: ${mensagens.length}\n`;
        txt += `================================================================\n\n`;

        mensagens.forEach(msg => {
            const dataHora = msg.timestamp ? new Date(msg.timestamp).toLocaleString('pt-BR') : 'Data n/d';
            const remetente = msg.remetente === 'atendente' ? (msg.atendenteNome ? `Atendente (${msg.atendenteNome})` : 'Atendente') : (nome || 'Cliente');
            let textoMsg = msg.texto || (msg.tipo ? `[${msg.tipo.toUpperCase()}]` : '');
            if (msg.apagada) {
                textoMsg = `[MENSAGEM APAGADA (${(msg.apagadaPor || 'CLIENTE').toUpperCase()})] ${textoMsg}`;
            }
            if (msg.quoted) {
                const autorCitado = msg.quoted.autor || 'Mensagem';
                const textoCitado = (msg.quoted.texto || '').replace(/\r?\n/g, ' ').slice(0, 50);
                textoMsg = `[Em resposta a ${autorCitado}: "${textoCitado}"] ${textoMsg}`;
            }
            txt += `[${dataHora}] ${remetente}: ${textoMsg}\n`;
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="chat_${numero}.txt"`);
        res.send(txt);
    } catch (err) {
        console.error('❌ Erro ao exportar conversa em TXT:', err);
        res.status(500).send('Erro ao exportar histórico da conversa.');
    }
});

// 4. ENVIO DE MENSAGEM DO ATENDENTE PELO PAINEL
router.post('/enviar-mensagem', async (req, res) => {
    const { id_cliente, mensagem, quoted } = req.body;

    if (!id_cliente || !mensagem || !mensagem.trim()) {
        return res.status(400).json({ success: false, message: 'Número do cliente e mensagem são obrigatórios.' });
    }

    try {
        const numeroLimpo = id_cliente.split('@')[0];
        const nomeAtendente = req.user?.name || 'Atendente';
        const textoFinal = mensagem.trim();
        
        // 1. Dispara via Evolution API diretamente (sem prefixo) e contexto de citação se houver
        const respostaEvolution = await EvolutionService.enviarMensagemText(numeroLimpo, textoFinal, quoted);
        const msgIdEvolution = respostaEvolution?.key?.id || null;

        // 2. Salva no histórico da conversa
        const mensagemRegistrada = await SessionService.adicionarMensagem(id_cliente, 'atendente', textoFinal, null, {
            tipo: 'texto',
            atendenteNome: nomeAtendente,
            messageId: msgIdEvolution,
            whatsappMessageId: msgIdEvolution,
            quoted: quoted || null
        });

        res.json({ success: true, message: 'Mensagem enviada com sucesso!', data: mensagemRegistrada });
    } catch (err) {
        console.error('❌ Erro ao enviar mensagem pelo painel:', err);
        res.status(500).json({ success: false, message: 'Falha ao enviar mensagem via WhatsApp.' });
    }
});

// 5. ENVIO DE ÁUDIO GRAVADO NO NAVEGADOR
router.post('/enviar-audio', async (req, res) => {
    const { id_cliente, audioBase64, quoted } = req.body;

    if (!id_cliente || !audioBase64) {
        return res.status(400).json({ success: false, message: 'ID do cliente e áudio em base64 são obrigatórios.' });
    }

    try {
        const numeroLimpo = id_cliente.split('@')[0];
        const nomeAtendente = req.user?.name || 'Atendente';
        const textoHistorico = '[🎙️ Mensagem de Voz]';

        // 1. Dispara áudio via Evolution API
        const respostaEvolution = await EvolutionService.enviarAudio(numeroLimpo, audioBase64, quoted);
        const msgIdEvolution = respostaEvolution?.key?.id || null;

        // 2. Salva no histórico como áudio
        const mensagemRegistrada = await SessionService.adicionarMensagem(id_cliente, 'atendente', textoHistorico, null, {
            tipo: 'audio',
            mediaBase64: audioBase64,
            mimetype: 'audio/webm',
            atendenteNome: nomeAtendente,
            messageId: msgIdEvolution,
            whatsappMessageId: msgIdEvolution,
            quoted: quoted || null
        });

        res.json({ success: true, message: 'Áudio enviado com sucesso!', data: mensagemRegistrada });
    } catch (err) {
        console.error('❌ Erro ao enviar áudio pelo painel:', err);
        res.status(500).json({ success: false, message: 'Falha ao enviar áudio via WhatsApp.' });
    }
});

// 6. ENVIO DE MÍDIA / ANEXO (IMAGENS, VÍDEOS, PDFS, DOCUMENTOS)
router.post('/enviar-midia', async (req, res) => {
    const { id_cliente, mediaBase64, mediatype, mimetype, fileName, caption, quoted } = req.body;

    if (!id_cliente || !mediaBase64) {
        return res.status(400).json({ success: false, message: 'ID do cliente e arquivo base64 são obrigatórios.' });
    }

    try {
        const numeroLimpo = id_cliente.split('@')[0];
        const nomeAtendente = req.user?.name || 'Atendente';
        const captionFinal = caption && caption.trim() ? caption.trim() : '';

        const defaultFileName = mediatype === 'document' ? 'documento.pdf' : (mediatype === 'video' ? 'video.mp4' : 'imagem.jpg');

        // 1. Dispara mídia via Evolution API sem prefixo forçado
        const respostaEvolution = await EvolutionService.enviarMidia(numeroLimpo, {
            media: mediaBase64,
            mediatype: mediatype || 'image',
            mimetype: mimetype || (mediatype === 'video' ? 'video/mp4' : mediatype === 'document' ? 'application/pdf' : 'image/jpeg'),
            fileName: fileName || defaultFileName,
            caption: captionFinal,
            quoted: quoted || null
        });
        const msgIdEvolution = respostaEvolution?.key?.id || null;

        let tipoMensagem = 'imagem';
        if (mediatype === 'document') tipoMensagem = 'documento';
        else if (mediatype === 'video') tipoMensagem = 'video';

        // 2. Salva no histórico da conversa
        const mensagemRegistrada = await SessionService.adicionarMensagem(
            id_cliente, 
            'atendente', 
            captionFinal, 
            null, 
            {
                tipo: tipoMensagem,
                mediaBase64: mediaBase64,
                fileName: fileName || defaultFileName,
                mimetype: mimetype,
                atendenteNome: nomeAtendente,
                messageId: msgIdEvolution,
                whatsappMessageId: msgIdEvolution,
                quoted: quoted || null
            }
        );

        res.json({ success: true, message: 'Mídia enviada com sucesso!', data: mensagemRegistrada });
    } catch (err) {
        console.error('❌ Erro ao enviar mídia pelo painel:', err);
        res.status(500).json({ success: false, message: 'Falha ao enviar mídia via WhatsApp.' });
    }
});

// 6.1. EXCLUIR MENSAGEM PARA TODOS NO WHATSAPP E MARCAR COMO APAGADA NO BANCO
router.post('/apagar-mensagem', async (req, res) => {
    const { id_cliente, id_mensagem, whatsappMessageId } = req.body;

    if (!id_cliente || !id_mensagem) {
        return res.status(400).json({ success: false, message: 'ID do cliente e ID da mensagem são obrigatórios.' });
    }

    try {
        const msgIdEvolution = whatsappMessageId || id_mensagem;

        // 1. Obtém a conversa para identificar se foi enviada pelo atendente ou cliente
        let isFromMe = true;
        try {
            const conversa = await SessionService.obterConversa(id_cliente);
            const msgAlvo = conversa?.historicoMensagens?.find(m => 
                m.id === id_mensagem || 
                m.whatsappMessageId === id_mensagem ||
                m.id === msgIdEvolution ||
                m.whatsappMessageId === msgIdEvolution
            );
            if (msgAlvo) {
                isFromMe = msgAlvo.remetente === 'atendente';
            }
        } catch (e) {
            console.warn('⚠️ [adminRoutes] Aviso ao consultar remetente original:', e.message);
        }

        // 2. Tenta apagar para todos no WhatsApp via Evolution API
        try {
            await EvolutionService.apagarMensagemParaTodos(id_cliente, msgIdEvolution, isFromMe);
        } catch (evoErr) {
            console.warn('⚠️ [Evolution API] Falha ou aviso ao tentar deletar mensagem no WhatsApp:', evoErr.response?.data || evoErr.message);
            // Prossegue para atualizar a flag interna mesmo se a janela de 48h expirou no WhatsApp
        }

        // 3. Marca a mensagem como apagada no histórico do banco (SEM excluir o registro)
        const msgAtualizada = await SessionService.marcarMensagemApagada(id_cliente, id_mensagem, 'atendente');

        if (!msgAtualizada) {
            return res.status(404).json({ success: false, message: 'Mensagem não encontrada no histórico.' });
        }

        res.json({
            success: true,
            message: 'Mensagem apagada com sucesso!',
            data: {
                id: msgAtualizada.id,
                whatsappMessageId: msgAtualizada.whatsappMessageId,
                apagada: true,
                apagadaPor: msgAtualizada.apagadaPor,
                apagadaEm: msgAtualizada.apagadaEm
            }
        });
    } catch (err) {
        console.error('❌ Erro ao apagar mensagem:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro interno ao apagar mensagem.' });
    }
});

// 7. IA GEMINI: SUGERIR RESPOSTA PARA O ATENDENTE APROVAR
router.post('/ia/sugerir-resposta', async (req, res) => {
    const { id_cliente } = req.body;

    if (!id_cliente) {
        return res.status(400).json({ success: false, message: 'ID do cliente é obrigatório.' });
    }

    try {
        const conversa = await SessionService.obterConversa(id_cliente);
        const sugestao = await GeminiService.sugerirResposta(conversa.historicoMensagens, conversa.nome_contato);
        res.json({ success: true, sugestao });
    } catch (err) {
        console.error('❌ Erro ao gerar sugestão com Gemini:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Erro ao consultar IA Gemini.' });
    }
});

// 8. IA GEMINI: RESUMO DA CONVERSA
router.post('/ia/resumir-conversa', async (req, res) => {
    const { id_cliente } = req.body;

    if (!id_cliente) {
        return res.status(400).json({ success: false, message: 'ID do cliente é obrigatório.' });
    }

    try {
        const conversa = await SessionService.obterConversa(id_cliente);
        const resumo = await GeminiService.resumirConversa(conversa.historicoMensagens, conversa.nome_contato);
        res.json({ success: true, resumo });
    } catch (err) {
        console.error('❌ Erro ao gerar resumo com Gemini:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Erro ao gerar resumo da conversa.' });
    }
});

// 9. ALTERNAR MODO DE ATENDIMENTO (COPILOTO / HUMANO)
router.post('/conversa/:id_cliente/alternar-modo', async (req, res) => {
    const { id_cliente } = req.params;
    const { modo } = req.body; // 'copiloto' ou 'humano'

    if (!id_cliente || !modo) {
        return res.status(400).json({ success: false, message: 'ID e modo de atendimento são obrigatórios.' });
    }

    try {
        const conversa = await SessionService.alternarModoAtendimento(id_cliente, modo);
        res.json({ success: true, modo: conversa.modo_atendimento });
    } catch (err) {
        console.error('❌ Erro ao alternar modo de atendimento:', err);
        res.status(500).json({ success: false, message: 'Erro ao alternar modo.' });
    }
});

// 9.1. ALTERAR ETAPA / DEVOLVER CLIENTE AO BOT
router.post('/alterar-status', async (req, res) => {
    const { id_cliente, novaEtapa, resetarCarrinho } = req.body;
    if (!id_cliente || !novaEtapa) {
        return res.status(400).json({ success: false, message: 'ID do cliente e nova etapa são obrigatórios.' });
    }

    try {
        const conversa = await SessionService.alterarEtapa(id_cliente, novaEtapa, resetarCarrinho);
        await SessionService.alternarModoAtendimento(id_cliente, 'bot');
        res.json({ success: true, message: 'Cliente transferido para o bot com sucesso!', data: conversa });
    } catch (err) {
        console.error('❌ Erro ao alterar etapa do cliente:', err);
        res.status(500).json({ success: false, message: 'Erro ao transferir etapa do bot.' });
    }
});

// 10. STATUS DA CONEXÃO COM A EVOLUTION API (INSTÂNCIA ViP)
router.get('/instance-status', async (req, res) => {
    try {
        const data = await EvolutionService.obterStatusInstancia();
        
        if (!data) {
            return res.json({ success: false, status: 'offline' });
        }

        let status = data?.instance?.state || 'desconhecido';
        let qrCodeBase64 = null;

        // Se estiver desconectado, tenta buscar QR Code
        if (status === 'close' || status === 'connecting') {
            const qrResponse = await fetch(`${EvolutionService.baseUrl}/instance/connect/${EvolutionService.instanceName}`, {
                headers: { 'apikey': EvolutionService.apiKey },
                signal: AbortSignal.timeout(5000)
            });
            
            if (qrResponse.ok) {
                const qrData = await qrResponse.json();
                if (qrData?.base64) {
                    qrCodeBase64 = qrData.base64;
                    status = 'qrcode'; 
                }
            }
        }

        res.json({ success: true, status, qrCodeBase64, instance: EvolutionService.instanceName });
    } catch (err) {
        console.error('❌ Erro de conexão com Evolution API:', err.message);
        res.json({ success: false, status: 'offline' });
    }
});

// 11. VERIFICAR SE NÚMERO EXISTE NO WHATSAPP
router.post('/verificar-numero', async (req, res) => {
    const { numero, ddi } = req.body;
    if (!numero || !numero.trim()) {
        return res.status(400).json({ success: false, message: 'Número de telefone é obrigatório.' });
    }

    try {
        let numeroLimpo = numero.replace(/\D/g, '');
        const ddiPadrao = (ddi || '55').replace(/\D/g, '');

        // Auto-anexa o DDI se o usuário informar apenas DDD + número (10 ou 11 dígitos)
        if ((numeroLimpo.length === 10 || numeroLimpo.length === 11) && !numeroLimpo.startsWith(ddiPadrao)) {
            numeroLimpo = `${ddiPadrao}${numeroLimpo}`;
        }

        const resultado = await EvolutionService.verificarNumeroWhatsApp(numeroLimpo);
        res.json({ success: true, ...resultado });
    } catch (err) {
        console.error('❌ Erro ao verificar número WhatsApp:', err);
        res.status(500).json({ success: false, message: 'Falha ao verificar número no WhatsApp.' });
    }
});

// 12. INICIAR NOVA CONVERSA DIRETA POR NÚMERO
router.post('/novo-chat', async (req, res) => {
    const { numero, nome, mensagemInicial, ddi } = req.body;

    if (!numero || !numero.trim()) {
        return res.status(400).json({ success: false, message: 'Número do WhatsApp é obrigatório.' });
    }

    try {
        let numeroLimpo = numero.replace(/\D/g, '');
        const ddiPadrao = (ddi || '55').replace(/\D/g, '');

        if ((numeroLimpo.length === 10 || numeroLimpo.length === 11) && !numeroLimpo.startsWith(ddiPadrao)) {
            numeroLimpo = `${ddiPadrao}${numeroLimpo}`;
        }

        if (numeroLimpo.length < 10) {
            return res.status(400).json({ success: false, message: 'Número de telefone inválido. Inclua DDD (Ex: 79999999999).' });
        }

        // Verifica conta no WhatsApp
        const verif = await EvolutionService.verificarNumeroWhatsApp(numeroLimpo);
        if (!verif.existe) {
            return res.status(400).json({ success: false, message: 'Este número não possui uma conta ativa no WhatsApp.' });
        }

        const idCliente = verif.jid;
        const nomeFinal = (nome && nome.trim()) ? nome.trim() : `Contato (${numeroLimpo})`;
        
        // Obtém ou inicializa a conversa
        const conversa = await SessionService.obterConversa(idCliente);
        conversa.nome_contato = nomeFinal;
        await SessionService.salvarConversa(idCliente, conversa);

        // Se houver mensagem inicial, já dispara e registra
        if (mensagemInicial && mensagemInicial.trim()) {
            const nomeAtendente = req.user?.name || 'Atendente';
            const textoFinal = mensagemInicial.trim();
            
            await EvolutionService.enviarMensagemText(verif.numero, textoFinal);
            await SessionService.adicionarMensagem(idCliente, 'atendente', textoFinal, nomeFinal, {
                tipo: 'texto',
                atendenteNome: nomeAtendente
            });
        }

        res.json({
            success: true,
            message: 'Conversa iniciada com sucesso!',
            id_cliente: idCliente,
            nome_contato: nomeFinal
        });
    } catch (err) {
        console.error('❌ Erro ao iniciar nova conversa:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao iniciar conversa.' });
    }
});

// 13. CRIAR NOVO CONTATO E ABRIR ATENDIMENTO
router.post('/novo-contato', async (req, res) => {
    const { nome, numero, mensagemInicial, ddi } = req.body;

    if (!nome || !nome.trim()) {
        return res.status(400).json({ success: false, message: 'O nome do contato é obrigatório.' });
    }
    if (!numero || !numero.trim()) {
        return res.status(400).json({ success: false, message: 'O número de telefone é obrigatório.' });
    }

    try {
        let numeroLimpo = numero.replace(/\D/g, '');
        const ddiPadrao = (ddi || '55').replace(/\D/g, '');

        if ((numeroLimpo.length === 10 || numeroLimpo.length === 11) && !numeroLimpo.startsWith(ddiPadrao)) {
            numeroLimpo = `${ddiPadrao}${numeroLimpo}`;
        }

        if (numeroLimpo.length < 10) {
            return res.status(400).json({ success: false, message: 'Número de telefone inválido. Inclua DDD.' });
        }

        const verif = await EvolutionService.verificarNumeroWhatsApp(numeroLimpo);
        if (!verif.existe) {
            return res.status(400).json({ success: false, message: 'Este número não possui uma conta ativa no WhatsApp.' });
        }

        const idCliente = verif.jid;
        const nomeFinal = nome.trim();

        const conversa = await SessionService.obterConversa(idCliente);
        conversa.nome_contato = nomeFinal;
        await SessionService.salvarConversa(idCliente, conversa);

        if (mensagemInicial && mensagemInicial.trim()) {
            const nomeAtendente = req.user?.name || 'Atendente';
            const textoFinal = mensagemInicial.trim();
            
            await EvolutionService.enviarMensagemText(verif.numero, textoFinal);
            await SessionService.adicionarMensagem(idCliente, 'atendente', textoFinal, nomeFinal, {
                tipo: 'texto',
                atendenteNome: nomeAtendente
            });
        }

        res.json({
            success: true,
            message: 'Contato cadastrado com sucesso!',
            id_cliente: idCliente,
            nome_contato: nomeFinal
        });
    } catch (err) {
        console.error('❌ Erro ao cadastrar novo contato:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao criar contato.' });
    }
});

// 14. CRIAR NOVO GRUPO NO WHATSAPP
router.post('/novo-grupo', async (req, res) => {
    const { nomeGrupo, participantes, descricao, mensagemInicial } = req.body;

    if (!nomeGrupo || !nomeGrupo.trim()) {
        return res.status(400).json({ success: false, message: 'O nome do grupo (assunto) é obrigatório.' });
    }

    let lista = [];
    if (Array.isArray(participantes)) {
        lista = participantes;
    } else if (typeof participantes === 'string') {
        lista = participantes.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
    }

    if (lista.length === 0) {
        return res.status(400).json({ success: false, message: 'Adicione ao menos um participante para criar o grupo.' });
    }

    // Auto-anexa 55 para participantes do Brasil sem código de país
    lista = lista.map(p => {
        let limpo = p.replace(/\D/g, '');
        if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) {
            return '55' + limpo;
        }
        return limpo;
    });

    try {
        const grupoCriado = await EvolutionService.criarGrupo(nomeGrupo.trim(), lista, descricao);
        const grupoJid = grupoCriado?.id;

        if (!grupoJid) {
            return res.status(500).json({ success: false, message: 'Não foi possível obter o identificador do grupo criado.' });
        }

        const conversa = await SessionService.obterConversa(grupoJid);
        conversa.nome_contato = nomeGrupo.trim();
        await SessionService.salvarConversa(grupoJid, conversa);

        if (mensagemInicial && mensagemInicial.trim()) {
            const nomeAtendente = req.user?.name || 'Atendente';
            const textoFinal = mensagemInicial.trim();
            
            await EvolutionService.enviarMensagemText(grupoJid, textoFinal);
            await SessionService.adicionarMensagem(grupoJid, 'atendente', textoFinal, nomeGrupo.trim(), {
                tipo: 'texto',
                atendenteNome: nomeAtendente
            });
        }

        res.json({
            success: true,
            message: 'Grupo criado com sucesso no WhatsApp!',
            id_cliente: grupoJid,
            nome_contato: nomeGrupo.trim(),
            grupo: grupoCriado
        });
    } catch (err) {
        console.error('❌ Erro ao criar novo grupo:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao criar grupo no WhatsApp.' });
    }
});

// ==========================================
// 15. GESTÃO DE CATÁLOGO & PRODUTOS (CRUD)
// ==========================================

// 15.1. Listar todos os produtos (com filtros opcionais)
router.get('/produtos', async (req, res) => {
    try {
        const { busca } = req.query;
        const produtos = await CatalogoService.listarTodosOsProdutos(busca);
        res.json({ success: true, data: produtos });
    } catch (err) {
        console.error('❌ Erro ao buscar produtos:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar lista de produtos.' });
    }
});

// 15.2. Criar novo produto
router.post('/produtos', async (req, res) => {
    try {
        const { categoria_id, nome, preco, descricao, foto, estoque, ativo } = req.body;
        if (!categoria_id || !nome || preco === undefined) {
            return res.status(400).json({ success: false, message: 'Categoria, Nome e Preço são obrigatórios.' });
        }
        const produto = await CatalogoService.criarProduto({
            categoria_id,
            nome,
            preco,
            descricao,
            foto: foto || null,
            estoque,
            ativo
        });
        res.json({ success: true, message: 'Produto cadastrado com sucesso!', data: produto });
    } catch (err) {
        console.error('❌ Erro ao criar produto:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao cadastrar produto.' });
    }
});

// 15.3. Atualizar produto existente
router.put('/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const dados = req.body;
        const produto = await CatalogoService.atualizarProduto(id, dados);
        res.json({ success: true, message: 'Produto atualizado com sucesso!', data: produto });
    } catch (err) {
        console.error('❌ Erro ao atualizar produto:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao atualizar produto.' });
    }
});

// 15.4. Excluir produto
router.delete('/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const produto = await CatalogoService.deletarProduto(id);
        res.json({ success: true, message: `Produto "${produto.nome}" removido com sucesso!` });
    } catch (err) {
        console.error('❌ Erro ao excluir produto:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao excluir produto.' });
    }
});

// 15.5. Listar categorias
router.get('/categorias', async (req, res) => {
    try {
        const categorias = await CatalogoService.listarCategorias();
        res.json({ success: true, data: categorias });
    } catch (err) {
        console.error('❌ Erro ao buscar categorias:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar categorias.' });
    }
});

// 15.6. Criar nova categoria
router.post('/categorias', async (req, res) => {
    try {
        const { id, nome, descricao, icone, ordem, ativo } = req.body;
        if (!id || !nome) {
            return res.status(400).json({ success: false, message: 'ID e Nome da categoria são obrigatórios.' });
        }
        const categoria = await CatalogoService.criarCategoria({ id, nome, descricao, icone, ordem, ativo });
        res.json({ success: true, message: 'Categoria cadastrada com sucesso!', data: categoria });
    } catch (err) {
        console.error('❌ Erro ao criar categoria:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao criar categoria.' });
    }
});

// 15.7. Atualizar categoria
router.put('/categorias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await CatalogoService.atualizarCategoria(id, req.body);
        res.json({ success: true, message: 'Categoria atualizada com sucesso!', data: categoria });
    } catch (err) {
        console.error('❌ Erro ao atualizar categoria:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao atualizar categoria.' });
    }
});

// 15.8. Excluir categoria
router.delete('/categorias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await CatalogoService.deletarCategoria(id);
        res.json({ success: true, message: `Categoria "${categoria.nome}" removida com sucesso!` });
    } catch (err) {
        console.error('❌ Erro ao excluir categoria:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao excluir categoria.' });
    }
});

// ==========================================
// 16. CONTROLE DO BOT & MÉTRICAS (Painel Antigo Integrado)
// ==========================================

// 16.1. Status Global do Bot (Pausar/Ativar)
router.get('/bot-status', async (req, res) => {
    try {
        const config = await DatabaseService.obterConfig('bot_global_status');
        res.json({ success: true, pausado: Boolean(config?.pausado) });
    } catch (err) {
        console.error('❌ Erro ao consultar status do bot:', err);
        res.status(500).json({ success: false, pausado: false });
    }
});

router.post('/bot-status', async (req, res) => {
    try {
        const { pausado } = req.body;
        await DatabaseService.salvarConfig('bot_global_status', { pausado: Boolean(pausado) });
        res.json({ 
            success: true, 
            message: pausado ? 'Bot global pausado com sucesso!' : 'Bot global reativado com sucesso!',
            pausado: Boolean(pausado)
        });
    } catch (err) {
        console.error('❌ Erro ao alterar status global do bot:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configuração do bot.' });
    }
});

// 16.2. Estatísticas do Painel
router.get('/estatisticas', async (req, res) => {
    try {
        const sql = `
            SELECT 
                etapa, 
                COUNT(*) as total 
            FROM tb_bot_sessoes 
            WHERE id_cliente NOT LIKE '%@lid%'
            GROUP BY etapa
        `;
        const result = await DatabaseService.executar(sql);
        const etapas = result.rows.map(r => ({ etapa: r.etapa || 'inicio', total: parseInt(r.total, 10) }));

        let totalGeral = 0;
        let totalHumano = 0;
        let totalIa = 0;
        let totalCarrinho = 0;
        let totalBot = 0;

        etapas.forEach(item => {
            totalGeral += item.total;
            if (item.etapa === 'em_atendimento_humano') totalHumano += item.total;
            else if (item.etapa === 'conversando_com_ia') totalIa += item.total;
            else if (item.etapa === 'carrinho_opcoes' || item.etapa === 'aguardando_quantidade') totalCarrinho += item.total;
            else totalBot += item.total;
        });

        res.json({
            success: true,
            resumo: {
                totalGeral,
                totalHumano,
                totalIa,
                totalCarrinho,
                totalBot
            },
            etapas
        });
    } catch (err) {
        console.error('❌ Erro ao buscar estatísticas:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar estatísticas.' });
    }
});

// 16.3. Alterar Etapa do Cliente
router.post('/alterar-status', async (req, res) => {
    const { id_cliente, novaEtapa, resetarCarrinho } = req.body;
    if (!id_cliente || !novaEtapa) {
        return res.status(400).json({ success: false, message: 'ID do cliente e nova etapa são obrigatórios.' });
    }

    try {
        await SessionService.alterarEtapa(id_cliente, novaEtapa, Boolean(resetarCarrinho));
        const numeroLimpo = id_cliente.split('@')[0];

        if (novaEtapa === 'em_atendimento_humano') {
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '8', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '7', 'add').catch(() => {});
        } else {
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '7', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '8', 'add').catch(() => {});
        }

        res.json({ success: true, message: `Cliente transferido para etapa: ${novaEtapa}` });
    } catch (err) {
        console.error('❌ Erro ao alterar etapa:', err);
        res.status(500).json({ success: false, message: 'Erro ao alterar etapa.' });
    }
});

// 16.4. Limpar Carrinho do Cliente
router.post('/limpar-carrinho', async (req, res) => {
    const { id_cliente } = req.body;
    if (!id_cliente) {
        return res.status(400).json({ success: false, message: 'ID do cliente é obrigatório.' });
    }

    try {
        await SessionService.limparCarrinho(id_cliente);
        res.json({ success: true, message: 'Carrinho do cliente foi esvaziado com sucesso.' });
    } catch (err) {
        console.error('❌ Erro ao limpar carrinho:', err);
        res.status(500).json({ success: false, message: 'Erro ao limpar carrinho.' });
    }
});

// 16.5. Monitorar Conexão da Instância Evolution API
router.get('/instance-status', async (req, res) => {
    try {
        const evolutionUrl = process.env.EVOLUTION_URL || 'http://localhost:8081';
        const apikey = process.env.EVOLUTION_API_KEY;
        const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'FavoDeMel';

        if (!apikey) {
            return res.json({ success: false, status: 'offline', message: 'API Key ausente' });
        }

        const stateResponse = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
            headers: { 'apikey': apikey },
            signal: AbortSignal.timeout(5000) 
        });
        
        if (!stateResponse.ok) {
            return res.json({ success: false, status: 'desconhecido' });
        }
        
        const stateData = await stateResponse.json();
        let status = stateData?.instance?.state || 'desconhecido';
        let qrCodeBase64 = null;

        if (status !== 'open') {
            const qrResponse = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
                headers: { 'apikey': apikey },
                signal: AbortSignal.timeout(6000)
            });
            
            if (qrResponse.ok) {
                const qrData = await qrResponse.json();
                qrCodeBase64 = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code || null;
                if (qrCodeBase64) {
                    status = 'qrcode'; 
                }
            }
        }

        res.json({ success: true, status, qrCodeBase64 });
    } catch (err) {
        res.json({ success: false, status: 'offline', message: err.message });
    }
});

// ==========================================
// 17. CONFIGURAÇÃO DE USUÁRIO / PERFIL & SENHA
// ==========================================
router.get('/perfil', (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user?.id,
            name: req.user?.name || 'Favo de Mel',
            email: req.user?.email || 'admin@favodemel.com',
            login: req.user?.login || 'admin'
        }
    });
});

router.post('/perfil', async (req, res) => {
    const { nome, email, senhaAtual, novaSenha } = req.body;
    try {
        const userAtual = req.user;
        const updated = await atualizarPerfilUsuario(userAtual.email, { nome, email, senhaAtual, novaSenha });

        // Gera novo token de sessão e atualiza cookie
        const novoToken = gerarTokenSessao(updated);
        res.setHeader('Set-Cookie', `vip_auth=${novoToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

        res.json({
            success: true,
            message: 'Configurações de usuário e senha salvas com sucesso!',
            user: updated
        });
    } catch (err) {
        console.error('❌ Erro ao atualizar perfil:', err.message);
        res.status(400).json({ success: false, message: err.message || 'Erro ao atualizar dados do usuário.' });
    }
});

module.exports = router;