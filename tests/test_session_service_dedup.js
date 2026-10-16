const assert = require('assert');

async function testSessionServiceDedup() {
    console.log('🧪 Iniciando testes de desduplicação do SessionService...\n');

    const SessionService = require('../src/services/SessionService');
    const DatabaseService = require('../src/services/DatabaseService');

    // Mock do DatabaseService para rodar em memória
    let bancoSessoes = {};
    DatabaseService.executar = async (sql, params) => {
        if (sql.includes('SELECT dados_sessao')) {
            const id = params[0];
            const row = bancoSessoes[id];
            return { rows: row ? [{ dados_sessao: row }] : [] };
        }
        if (sql.includes('INSERT INTO tb_bot_sessoes')) {
            const id = params[0];
            const dados = params[2];
            bancoSessoes[id] = dados;
            return { rows: [] };
        }
        return { rows: [] };
    };

    const idCliente = '5579888888888@s.whatsapp.net';

    // 1. Adicionar mensagem 1
    const msg1 = await SessionService.adicionarMensagem(idCliente, 'atendente', 'Ok', null, {
        messageId: 'MSG_ID_1',
        whatsappMessageId: 'WPP_ID_1'
    });
    assert.strictEqual(msg1.whatsappMessageId, 'WPP_ID_1');

    const conv1 = await SessionService.obterConversa(idCliente);
    assert.strictEqual(conv1.historicoMensagens.length, 1);
    console.log('✅ 1. Mensagem 1 adicionada com sucesso');

    // 2. Tentar adicionar mensagem 1 novamente com mesmo ID (deve desduplicar)
    const msg1Dup = await SessionService.adicionarMensagem(idCliente, 'atendente', 'Ok', null, {
        messageId: 'MSG_ID_1',
        whatsappMessageId: 'WPP_ID_1'
    });
    const conv2 = await SessionService.obterConversa(idCliente);
    assert.strictEqual(conv2.historicoMensagens.length, 1, 'Mesmo whatsappMessageId NÃO deve duplicar');
    console.log('✅ 2. Mensagem com mesmo ID desduplicada deterministicamente');

    // 3. Adicionar mensagem consecutiva com mesmo texto 'Ok', mas ID de WhatsApp diferente (ex: atendente digitou 'Ok' 2x no celular)
    const msg2 = await SessionService.adicionarMensagem(idCliente, 'atendente', 'Ok', null, {
        messageId: 'MSG_ID_2',
        whatsappMessageId: 'WPP_ID_2'
    });
    const conv3 = await SessionService.obterConversa(idCliente);
    assert.strictEqual(conv3.historicoMensagens.length, 2, 'Mensagens consecutivas com IDs diferentes do WhatsApp DEVEM ser mantidas');
    assert.strictEqual(conv3.historicoMensagens[1].whatsappMessageId, 'WPP_ID_2');
    console.log('✅ 3. Mensagens consecutivas legítimas com IDs distintos preservadas');

    // 4. Mensagem enviada localmente sem ID do WhatsApp, e posterior chegada de eco com ID do WhatsApp
    const msgLocal = await SessionService.adicionarMensagem(idCliente, 'atendente', 'Aguarde um momento', null, {
        id: 'LOCAL_TEMP_1'
        // sem whatsappMessageId nem messageId
    });
    const conv4 = await SessionService.obterConversa(idCliente);
    assert.strictEqual(conv4.historicoMensagens.length, 3);

    // Chega o eco via webhook da mensagem local com o ID do WhatsApp
    const msgEco = await SessionService.adicionarMensagem(idCliente, 'atendente', 'Aguarde um momento', null, {
        messageId: 'WPP_OFFICIAL_1',
        whatsappMessageId: 'WPP_OFFICIAL_1'
    });
    const conv5 = await SessionService.obterConversa(idCliente);
    assert.strictEqual(conv5.historicoMensagens.length, 3, 'Eco deve enriquecer mensagem local sem criar bolha duplicada');
    assert.strictEqual(conv5.historicoMensagens[2].whatsappMessageId, 'WPP_OFFICIAL_1');
    console.log('✅ 4. Eco enriquecendo mensagem local sem duplicação validado com sucesso');

    console.log('\n🎉 TODOS OS TESTES DO SESSION SERVICE PASSARAM!');
}

testSessionServiceDedup().catch(err => {
    console.error('❌ Falha:', err);
    process.exit(1);
});
