const assert = require('assert');

// Test suite para validação da correção de mensagens do vendedor/atendente e desduplicação
async function runVendedorTests() {
    console.log('🧪 Iniciando testes de mensagens do vendedor e desduplicação de webhook...\n');

    const WebhookController = require('../src/controllers/WebhookController');
    const SessionService = require('../src/services/SessionService');
    const BotController = require('../src/controllers/BotController');

    // Mocks
    const mensagensSalvas = [];
    const modosAlterados = [];

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
            remetente,
            texto,
            atendenteNome: extraData.atendenteNome,
            timestamp: new Date().toISOString()
        };
        mensagensSalvas.push(msg);
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
    // Teste 1: Mensagem enviada pelo vendedor no celular (fromMe = true) DEVE ser salva
    // -------------------------------------------------------------
    const payloadVendedor1 = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'VENDEDOR_MSG_001',
                remoteJid: '5579999999999@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: 'Olá! Seu pedido já foi despachado para entrega!'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadVendedor1 }, mockRes);

    assert.strictEqual(mensagensSalvas.length, 1, 'A mensagem do vendedor deve ser salva no histórico');
    assert.strictEqual(mensagensSalvas[0].remetente, 'atendente', 'Remetente deve ser atendente');
    assert.strictEqual(mensagensSalvas[0].texto, 'Olá! Seu pedido já foi despachado para entrega!');
    assert.strictEqual(mensagensSalvas[0].whatsappMessageId, 'VENDEDOR_MSG_001');
    assert.strictEqual(mensagensSalvas[0].atendenteNome, 'Vendedor / WhatsApp');
    assert.strictEqual(modosAlterados.length, 1, 'Modo de atendimento deve alternar para humano');
    assert.strictEqual(modosAlterados[0].modo, 'humano');
    console.log('✅ Teste 1: Mensagem do vendedor via WhatsApp salva com sucesso no painel!');

    // -------------------------------------------------------------
    // Teste 2: Webhook duplicado da mesma mensagem do vendedor NÃO deve duplicar
    // -------------------------------------------------------------
    await WebhookController.handleEvolutionWebhook({ body: payloadVendedor1 }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 1, 'Webhook duplicado com mesmo ID NÃO deve salvar segunda mensagem');
    console.log('✅ Teste 2: Webhook duplicado do vendedor descartado sem duplicidade!');

    // -------------------------------------------------------------
    // Teste 3: Segunda mensagem diferente enviada pelo vendedor DEVE ser salva
    // -------------------------------------------------------------
    const payloadVendedor2 = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'VENDEDOR_MSG_002',
                remoteJid: '5579999999999@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: 'Segue o código de rastreio: BR123456789'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadVendedor2 }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 2, 'Segunda mensagem diferente do vendedor deve ser salva');
    assert.strictEqual(mensagensSalvas[1].whatsappMessageId, 'VENDEDOR_MSG_002');
    console.log('✅ Teste 3: Múltiplas mensagens do vendedor salvas com sucesso!');

    // -------------------------------------------------------------
    // Teste 4: Eco de mensagem enviada pelo robô NÃO deve duplicar no painel
    // -------------------------------------------------------------
    const botMsgId = 'BOT_MSG_999';
    WebhookController.registrarMensagemEnviadaPeloBot(botMsgId);

    const payloadEchoBot = {
        event: 'messages.upsert',
        data: {
            key: {
                id: botMsgId,
                remoteJid: '5579999999999@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: '🐝 Olá! Bem-vindo ao Apiário Favo de Mel!'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadEchoBot }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 2, 'Eco da mensagem do robô NÃO deve ser adicionado como duplicata');
    console.log('✅ Teste 4: Eco de mensagem do robô ignorado com sucesso!');

    // -------------------------------------------------------------
    // Teste 5: Eco de mensagem enviada pelo painel administrativo NÃO deve duplicar
    // -------------------------------------------------------------
    const painelMsgId = 'PAINEL_MSG_888';
    WebhookController.registrarMensagemEnviadaPeloSistema(painelMsgId);

    const payloadEchoPainel = {
        event: 'messages.upsert',
        data: {
            key: {
                id: painelMsgId,
                remoteJid: '5579999999999@s.whatsapp.net',
                fromMe: true
            },
            message: {
                conversation: 'Mensagem digitada pelo atendente no painel web'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadEchoPainel }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 2, 'Eco de mensagem do painel administrativo NÃO deve duplicar');
    console.log('✅ Teste 5: Eco do painel administrativo ignorado com sucesso!');

    // -------------------------------------------------------------
    // Teste 6: Mensagem recebida do cliente DEVE ser salva normalmente
    // -------------------------------------------------------------
    const payloadCliente = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'CLIENTE_MSG_001',
                remoteJid: '5579999999999@s.whatsapp.net',
                fromMe: false
            },
            message: {
                conversation: 'Muito obrigado, atendimento excelente!'
            }
        }
    };

    await WebhookController.handleEvolutionWebhook({ body: payloadCliente }, mockRes);
    assert.strictEqual(mensagensSalvas.length, 3, 'Mensagem do cliente deve ser salva');
    assert.strictEqual(mensagensSalvas[2].remetente, 'cliente');
    console.log('✅ Teste 6: Mensagem do cliente recebida e salva com sucesso!');

    console.log('\n🎉 TODOS OS TESTES DE VALIDAÇÃO PASSARAM COM SUCESSO!');
}

runVendedorTests().catch(err => {
    console.error('❌ Falha nos testes:', err);
    process.exit(1);
});
