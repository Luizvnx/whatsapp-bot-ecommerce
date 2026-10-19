const assert = require('assert');
const SessionService = require('../src/services/SessionService');
const HumanoStage = require('../src/stages/HumanoStage');
const InicioStage = require('../src/stages/InicioStage');

async function testFluxoAtendimentoHumano24h() {
    console.log('🧪 Iniciando testes da Regra de 24h de Atendimento Humano e Reset de Contato...\n');

    // -----------------------------------------------------------------
    // TESTE 1: deveBotAssumirAtendimento em modo normal (bot ativo)
    // -----------------------------------------------------------------
    {
        const conversaBot = {
            modo_atendimento: 'bot',
            etapa: 'menu_principal',
            historicoMensagens: []
        };
        const deve = SessionService.deveBotAssumirAtendimento(conversaBot);
        assert.strictEqual(deve, false, 'Não deve assumir se o bot já está ativo');
        console.log('✅ Teste 1: deveBotAssumirAtendimento retorna false para modo bot normal OK');
    }

    // -----------------------------------------------------------------
    // TESTE 2: Atendimento humano recente (< 24h desde último envio ao cliente)
    // -----------------------------------------------------------------
    {
        const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const conversaHumanoRecente = {
            modo_atendimento: 'humano',
            etapa: 'em_atendimento_humano',
            ultimaMensagemEnviadaAoCliente: duasHorasAtras,
            historicoMensagens: [
                {
                    remetente: 'atendente',
                    texto: 'Olá, estou separando seu pedido!',
                    timestamp: duasHorasAtras
                }
            ]
        };
        const deve = SessionService.deveBotAssumirAtendimento(conversaHumanoRecente);
        assert.strictEqual(deve, false, 'Não deve assumir se atendente enviou mensagem há menos de 24h');
        console.log('✅ Teste 2: Atendimento humano ativo recente (< 24h) é respeitado OK');
    }

    // -----------------------------------------------------------------
    // TESTE 3: Atendimento humano expirado (> 24h sem mensagem enviada ao cliente)
    // -----------------------------------------------------------------
    {
        const vinteECincoHorasAtras = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const conversaHumanoExpirada = {
            id_cliente: '5579999999999@s.whatsapp.net',
            modo_atendimento: 'humano',
            etapa: 'em_atendimento_humano',
            ultimaMensagemEnviadaAoCliente: vinteECincoHorasAtras,
            historicoMensagens: [
                {
                    remetente: 'atendente',
                    texto: 'Transferindo para nossa equipe humana...',
                    timestamp: vinteECincoHorasAtras
                },
                {
                    remetente: 'cliente',
                    texto: 'Oi, alguém?',
                    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
                }
            ]
        };
        const deve = SessionService.deveBotAssumirAtendimento(conversaHumanoExpirada);
        assert.strictEqual(deve, true, 'Deve assumir se passou mais de 24h sem mensagens enviadas ao cliente');
        console.log('✅ Teste 3: Atendimento humano sem mensagens enviadas há > 24h identificado para reassunção OK');
    }

    // -----------------------------------------------------------------
    // TESTE 4: assumirAtendimentoPeloBot reativa modo bot e menu principal
    // -----------------------------------------------------------------
    {
        const idCliente = '557988887777@s.whatsapp.net';
        const vinteECincoHorasAtras = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const conversa = {
            id_cliente: idCliente,
            modo_atendimento: 'humano',
            etapa: 'em_atendimento_humano',
            transferidoParaHumanoEm: vinteECincoHorasAtras,
            errosConsecutivos: 2,
            historicoIa: [{ role: 'user', parts: [{ text: 'ajuda' }] }],
            historicoMensagens: []
        };

        const atualizada = await SessionService.assumirAtendimentoPeloBot(idCliente, conversa);
        assert.strictEqual(atualizada.modo_atendimento, 'bot', 'Modo deve voltar para bot');
        assert.strictEqual(atualizada.etapa, 'menu_principal', 'Etapa deve voltar para menu_principal');
        assert.strictEqual(atualizada.errosConsecutivos, 0, 'Erros consecutivos devem ser zerados');
        assert.strictEqual(atualizada.historicoIa.length, 0, 'Histórico IA deve ser limpo para novo contexto');
        assert.strictEqual(atualizada.transferidoParaHumanoEm, undefined, 'transferidoParaHumanoEm deve ser removido');
        console.log('✅ Teste 4: assumirAtendimentoPeloBot normaliza modo, etapa e contexto OK');
    }

    // -----------------------------------------------------------------
    // TESTE 5: HumanoStage executando após 24h sem envio reassume e reenvia boas-vindas
    // -----------------------------------------------------------------
    {
        const vinteECincoHorasAtras = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const sessao = {
            id_cliente: '557999998888@s.whatsapp.net',
            etapa: 'em_atendimento_humano',
            modo_atendimento: 'humano',
            transferidoParaHumanoEm: vinteECincoHorasAtras,
            historicoMensagens: []
        };

        const respostas = [];
        const msgMock = {
            numeroReal: sessao.id_cliente,
            numeroCliente: '557999998888',
            reply: async (txt) => respostas.push(txt),
            replyButtons: async (opts, fallback) => respostas.push(opts.title + ': ' + opts.description)
        };

        await HumanoStage.executar(msgMock, 'Olá!', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal', 'Etapa deve ter mudado para menu_principal');
        assert.strictEqual(sessao.modo_atendimento, 'bot', 'Modo deve ter mudado para bot');
        assert(respostas.length > 0, 'Deve ter enviado resposta de boas-vindas/menu');
        assert(respostas[0].includes('Apiário Favo de Mel'), 'Mensagem enviada deve ser a de boas-vindas do Apiário');
        console.log('✅ Teste 5: HumanoStage após 24h reassume atendimento e envia menu do bot OK');
    }

    // -----------------------------------------------------------------
    // TESTE 6: Reiniciar estágio de atendimento do contato 79988562587
    // -----------------------------------------------------------------
    {
        const targetNumero = '79988562587';
        const res = await SessionService.reiniciarEstagioContato(targetNumero);
        assert.strictEqual(res.modo_atendimento, 'bot', 'Modo de atendimento deve ser bot');
        assert.strictEqual(res.etapa, 'menu_principal', 'Etapa deve ser menu_principal');
        assert.strictEqual(res.carrinho.length, 0, 'Carrinho deve estar vazio');
        assert.strictEqual(res.historicoIa.length, 0, 'Histórico IA deve estar zerado');
        assert.strictEqual(res.errosConsecutivos, 0, 'Erros consecutivos devem ser zero');
        console.log('✅ Teste 6: reiniciarEstagioContato(79988562587) executado com sucesso OK');
    }

    console.log('\n🎉 TODOS OS 6 TESTES DA REGRA DE 24H E RESET PASSARAM COM 100% DE SUCESSO!\n');
}

testFluxoAtendimentoHumano24h().catch(err => {
    console.error('❌ Falha nos testes de atendimento humano 24h:', err);
    process.exit(1);
});
