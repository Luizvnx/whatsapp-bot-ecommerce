class HumanoStage {
    static async executar(msg, texto, sessao) {
        if (texto === '/voltar' || texto === '/bot') {
            sessao.etapa = 'inicio';
            await msg.reply("🤖 Atendimento automático reativado! Digite qualquer coisa para ver o menu.");
        }
    }
}
module.exports = HumanoStage;