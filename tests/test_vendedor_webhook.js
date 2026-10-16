const assert = require('assert');

// Test suite para validação da persistência de mensagens enviadas pelo vendedor via celular e webhooks da Evolution
async function runVendedorTests() {
    console.log('🧪 Iniciando testes de mensagens do vendedor (celular/web) e desduplicação de webhook...\n');

    const WebhookController = require('../src/controllers/WebhookController');
    const SessionService = require('../src/services/SessionService');
    const BotController = require('../src/controllers/BotController');
    const EvolutionService = require('../src/services/EvolutionService');

    // Mocks
    const mensagensSalvas = [];
    const modosAlterados = [];
    const numerosRegistrados = [];

    SessionService.obterConversa = async (numero) => {
        return {
            id_cliente: numero,
            modo_atendimento: 'bot',
            historicoMensagens: [...mensagensSalvas]
        };
    };

    SessionService.salvarConversa = async (numero, conversa) => {
        return true;
    };

    SessionService.alternarModoAtendimento = async (numero, modo) => {
        modosAlterados.push({ numero, modo });
        return { success: true };
    };

    SessionService.adicionarMensagem = async (numero, remetente, texto, nomeContato, extraData) => {
        const msg = {
            id: extraData.messageId || 'ID_' + Date.now(),
            whatsappMessageId: extraData.whatsappMessageId || null,
            numeroDestino: numero,
            remetente,
            texto,
            tipo: extraData.tipo || 'texto',
            atendenteNome: extraData.atendenteNome,
            lid: extraData.lid || null,
            timestamp: new Date().toISOString()
        };
        mensagensSalvas.push(msg);
        numerosRegistrados.push(numero);
        return msg;
    };

    BotController.processarMensagem = async (data) => {
        return true;
    };

    const mockRes = {
        sendStatus: (code) => code,
        status: () => mockRes,
        json: () => mockRes
    };

    // -------------------------------------------------------------
    // Teste 1: Mensagem enviada pelo celular do vendedor em chat com @lid e remoteJidAlt
    // O payload da Evolution traz sender = loja e remoteJid = LID.
    // DEVE salvar sob o número do CLIENTE (remoteJidAlt) e NUNCA sob o número da loja!
    // -------------------------------------------------------------
    const payloadCelularLid = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'CELULAR_MSG_LID_001',
                remoteJid: '56023670861837@lid',
                fromMe: true,
                remoteJidAlt: '557988562587@s.whatsapp.net'
            },
            sender: '557988125726@s.whatsapp.net', // Número da loja
            source: 'android',
            message: {
                conversation: 'Olá! Já estou embalando seus potes de mel silvestre!'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadCelularLid }, mockRes);

    assert.strictEqual(mensagensSalvas.length, 1, 'A mensagem do vendedor no celular DEVE ser salva no histórico');
    assert.strictEqual(mensagensSalvas[0].remetente, 'atendente', 'Remetente deve ser atendente');
    assert.strictEqual(mensagensSalvas[0].numeroDestino, '557988562587@s.whatsapp.net', 'A mensagem DEVE ser salva na conversa do CLIENTE, não da loja!');
    assert.strictEqual(mensagensSalvas[0].texto, 'Olá! Já estou embalando seus potes de mel silvestre!');
    assert.strictEqual(mensagensSalvas[0].whatsappMessageId, 'CELULAR_MSG_LID_001');
    assert.strictEqual(mensagensSalvas[0].atendenteNome, 'Vendedor (Celular)');
    assert.strictEqual(mensagensSalvas[0].lid, '56023670861837', 'O LID de origem deve ser guardado na sessão');
    assert.strictEqual(modosAlterados.length, 1, 'Modo de atendimento deve alternar para humano ao vendedor responder');
    assert.strictEqual(modosAlterados[0].modo, 'humano');
    console.log('✅ Teste 1: Mensagem do vendedor enviada pelo celular Android com @lid salva com sucesso no chat do cliente!');

    // -------------------------------------------------------------
    // Teste 2: Áudio de voz gravado e enviado pelo celular do vendedor
    // -------------------------------------------------------------
    const payloadAudioCelular = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'CELULAR_AUDIO_002',
                remoteJid: '56023670861837@lid',
                fromMe: true,
                remoteJidAlt: '557988562587@s.whatsapp.net'
            },
            sender: '557988125726@s.whatsapp.net',
            source: 'android',
            message: {
                audioMessage: {
                    url: 'https://mmg.whatsapp.net/v/audio_teste.ogg',
                    mimetype: 'audio/ogg; codecs=opus'
                }
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadAudioCelular }, mockRes);

    assert.strictEqual(mensagensSalvas.length, 2, 'Áudio de voz do celular deve ser salvo');
    assert.strictEqual(mensagensSalvas[1].tipo, 'audio', 'Tipo de mensagem deve ser audio');
    assert.strictEqual(mensagensSalvas[1].texto, '[🎙️ Mensagem de Voz]');
    assert.strictEqual(mensagensSalvas[1].atendenteNome, 'Vendedor (Celular)');
    console.log('✅ Teste 2: Áudio de voz enviado pelo celular do vendedor salvo com sucesso!');

    // -------------------------------------------------------------
    // Teste 3: Foto/Imagem enviada pelo celular do vendedor
    // -------------------------------------------------------------
    const payloadFotoCelular = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'CELULAR_IMG_003',
                remoteJid: '56023670861837@lid',
                fromMe: true,
                remoteJidAlt: '557988562587@s.whatsapp.net'
            },
            sender: '557988125726@s.whatsapp.net',
            source: 'android',
            message: {
                imageMessage: {
                    caption: 'Aqui está a foto do lote de própolis verde!',
                    mimetype: 'image/jpeg',
                    jpegThumbnail: 'dGVzdGU='
                }
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadFotoCelular }, mockRes);

    assert.strictEqual(mensagensSalvas.length, 3, 'Foto enviada pelo celular deve ser salva');
    assert.strictEqual(mensagensSalvas[2].tipo, 'imagem', 'Tipo deve ser imagem');
    assert.strictEqual(mensagensSalvas[2].texto, 'Aqui está a foto do lote de própolis verde!');
    console.log('✅ Teste 3: Imagem com legenda enviada pelo celular do vendedor salva com sucesso!');

    // -------------------------------------------------------------
    // Teste 4: Webhook duplicado (retry da Evolution) NÃO deve duplicar
    // -------------------------------------------------------------
    await WebhookController.handleEvolutionWebhook({ body: payloadCelularLid }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 3, 'Webhook repetido da mesma mensagem NÃO deve salvar duplicata');
    console.log('✅ Teste 4: Webhook repetido do celular descartado sem duplicidade!');

    // -------------------------------------------------------------
    // Teste 5: Eco de mensagem enviada pelo robô NÃO deve duplicar no painel
    // -------------------------------------------------------------
    const botMsgId = 'BOT_MSG_999';
    WebhookController.registrarMensagemEnviadaPeloBot(botMsgId);

    const payloadEchoBot = {
        event: 'messages.upsert',
        data: {
            key: {
                id: botMsgId,
                remoteJid: '557988562587@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: '🐝 Olá! Bem-vindo ao Apiário Favo de Mel!'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadEchoBot }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 3, 'Eco da mensagem do robô NÃO deve ser adicionado como duplicata');
    console.log('✅ Teste 5: Eco de mensagem do robô ignorado com sucesso!');

    // -------------------------------------------------------------
    // Teste 6: Eco de mensagem enviada pelo painel administrativo NÃO deve duplicar
    // -------------------------------------------------------------
    const painelMsgId = 'PAINEL_MSG_888';
    WebhookController.registrarMensagemEnviadaPeloSistema(painelMsgId);

    const payloadEchoPainel = {
        event: 'messages.upsert',
        data: {
            key: {
                id: painelMsgId,
                remoteJid: '557988562587@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: 'Mensagem digitada pelo atendente no painel web'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadEchoPainel }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 3, 'Eco de mensagem do painel administrativo NÃO deve duplicar');
    console.log('✅ Teste 6: Eco do painel administrativo ignorado com sucesso!');

    // -------------------------------------------------------------
    // Teste 7: Mensagem recebida do cliente com @lid deve resolver pelo mapeamento aprendido
    // -------------------------------------------------------------
    const payloadClienteLid = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'CLIENTE_MSG_LID_004',
                remoteJid: '56023670861837@lid',
                fromMe: false
            },
            pushName: 'Maria Silva',
            message: {
                conversation: 'Maravilha! Pode me mandar o link do Pix para pagamento?'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadClienteLid }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 4, 'Mensagem do cliente deve ser salva');
    assert.strictEqual(mensagensSalvas[3].remetente, 'cliente');
    assert.strictEqual(mensagensSalvas[3].numeroDestino, '557988562587@s.whatsapp.net', 'LID do cliente deve ser resolvido para o telefone real já mapeado!');
    console.log('✅ Teste 7: Mensagem do cliente com @lid resolvida e salva na conversa correta!');

    console.log('\n🎉 TODOS OS TESTES DE VALIDAÇÃO PASSARAM COM 100% DE SUCESSO!');
}

runVendedorTests().catch(err => {
    console.error('❌ Falha nos testes:', err);
    process.exit(1);
});
