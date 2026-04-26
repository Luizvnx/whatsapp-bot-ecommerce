require('dotenv').config();
const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');
const DatabaseService = require('./src/services/DatabaseService');

const webhookRoutes = require('./src/routes/webhookRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. INICIALIZAÇÃO DE SERVIÇOS
// ==========================================
DatabaseService.inicializar();

// ==========================================
// 2. CONFIGURAÇÕES DA VIEW (FRONTEND)
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MIDDLEWARES GLOBAIS
// ==========================================
app.use(express.json()); 

// ==========================================
// 4. ROTAS PÚBLICAS (Sem restrição)
// ==========================================
app.use('/webhook', webhookRoutes);

// ==========================================
// 5. CONFIGURAÇÃO DE SEGURANÇA (Fail-Safe)
// ==========================================
const adminUser = process.env.ADMIN_USER;
const adminPass = process.env.ADMIN_PASS;

if (!adminUser || !adminPass) {
    console.warn('⚠️ AVISO CRÍTICO: Credenciais ADMIN_USER ou ADMIN_PASS não encontradas no .env!');
    console.warn('⚠️ O painel usará as credenciais padrão de emergência (admin / admin).');
}

const travaSeguranca = basicAuth({
    users: { [adminUser || 'admin']: adminPass || 'admin' },
    challenge: true,
    unauthorizedResponse: 'Acesso Negado. Você não tem permissão para acessar a colmeia.'
});

// ==========================================
// 6. ROTAS PROTEGIDAS (Admin)
// ==========================================
app.use('/admin', travaSeguranca, adminRoutes);

// ==========================================
// 7. TAREFAS EM BACKGROUND (Cron Jobs)
// ==========================================
const iniciarRotinasDeLimpeza = () => {
    // Roda a cada 24 horas
    setInterval(() => {
        DatabaseService.limparSessoesInativas();
    }, 24 * 60 * 60 * 1000);
};
iniciarRotinasDeLimpeza();

// ==========================================
// 8. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Sistema Iniciado com Sucesso!`);
    console.log(`🤖 Cérebro do Bot: Porta ${PORT}`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook/evolution`);
    console.log(`🔒 Painel Admin URL: http://localhost:${PORT}/admin\n`);
});

// ==========================================
// 9. GRACEFUL SHUTDOWN (Prevenção de Vazamento de Memória/Conexão)
// ==========================================
const encerrarAplicacao = async () => {
    console.log('\n🛑 Sinal de encerramento recebido. Desligando o servidor...');
    server.close(async () => {
        console.log('✅ Servidor HTTP fechado.');
        try {
            // Se o DatabaseService tiver um método para fechar o Pool, chame-o aqui
            // await DatabaseService.pool.end(); 
            console.log('✅ Conexões com o banco de dados encerradas.');
            process.exit(0);
        } catch (err) {
            console.error('❌ Erro ao fechar banco de dados:', err);
            process.exit(1);
        }
    });
};

process.on('SIGINT', encerrarAplicacao);  // Captura o CTRL+C no terminal
process.on('SIGTERM', encerrarAplicacao); // Captura o sinal de Stop de servidores como Railway