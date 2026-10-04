class HumanoStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();
        if (t === '/voltar' || t === '/bot' || t === 'menu' || t === '#') {
            sessao.etapa = 'menu_principal';
            sessao.errosConsecutivos = 0;
            const InicioStage = require('./InicioStage');
            await msg.reply("🤖 *Atendimento automático reativado!* 🐝");
            return await InicioStage.executar(msg, '', sessao);
        }
    }
}
module.exports = HumanoStage;