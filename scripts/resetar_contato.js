const SessionService = require('../src/services/SessionService');
const DatabaseService = require('../src/services/DatabaseService');
const EvolutionService = require('../src/services/EvolutionService');

async function main() {
    const rawNumero = process.argv[2] || '79988562587';
    console.log(`🔄 [RESET] Iniciando reset completo de atendimento para o contato: ${rawNumero}...`);

    try {
        const resultado = await SessionService.reiniciarEstagioContato(rawNumero);
        console.log(`✅ [RESET] Sessão do contato ${rawNumero} reiniciada com sucesso!`);
        console.log(`📌 ID Canônico: ${resultado.id_cliente}`);
        console.log(`📌 Etapa: ${resultado.etapa}`);
        console.log(`📌 Modo de Atendimento: ${resultado.modo_atendimento}`);
        console.log(`📌 Carrinho: ${JSON.stringify(resultado.carrinho)}`);
        console.log(`📌 Histórico IA: ${resultado.historicoIa?.length || 0} mensagens`);
    } catch (err) {
        console.error(`❌ [RESET] Erro ao reiniciar estágio do contato:`, err.message);
    } finally {
        try {
            await DatabaseService.pool.end();
        } catch (_) {}
        process.exit(0);
    }
}

main();
