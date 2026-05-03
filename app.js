const config = require('./src/config'); // Centralizando configurações
const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');
const DatabaseService = require('./src/services/DatabaseService');

const webhookRoutes = require('./src/routes/webhookRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); 

const travaSeguranca = basicAuth({
    users: { [config.admin.user]: config.admin.pass },
    challenge: true,
    unauthorizedResponse: 'Acesso Negado. Você não tem permissão para acessar a colmeia.'
});

app.use('/webhook', webhookRoutes);
app.use('/admin', travaSeguranca, adminRoutes);

const iniciarRotinasDeLimpeza = () => {
    setInterval(async () => {
        try {
            if (typeof DatabaseService.limparSessoesInativas === 'function') {
                await DatabaseService.limparSessoesInativas();
            }
        } catch (err) {
            console.error('❌ Erro na rotina de limpeza:', err.message);
        }
    }, 24 * 60 * 60 * 1000);
};

const bootstrap = async () => {
    try {
        await DatabaseService.inicializar();
        
        const server = app.listen(config.server.port, '0.0.0.0', () => {
            console.log(`\n🚀 Sistema Favo de Mel Iniciado!`);
            console.log(`🤖 Cérebro do Bot: Porta ${config.server.port}`);
            console.log(`🔗 Webhook URL: ${config.server.url}/webhook/evolution`);
            console.log(`🔒 Painel Admin: ${config.server.url}/admin\n`);
        });

        iniciarRotinasDeLimpeza();

        // Graceful Shutdown
        const encerrar = async () => {
            console.log('\n🛑 Desligando servidor...');
            server.close(async () => {
                await DatabaseService.pool.end(); // Fecha conexão com banco
                console.log('✅ Banco de dados desconectado!');
                process.exit(0);
            });
        };

        process.on('SIGINT', encerrar);
        process.on('SIGTERM', encerrar);

    } catch (error) {
        console.error('Erro fatal na inicialização:', error.message);
        process.exit(1);
    }
};

bootstrap();