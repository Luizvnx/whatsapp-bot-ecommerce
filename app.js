const config = require('./src/config'); // Centralizando configurações
const http = require('http');
const express = require('express');
const path = require('path');
const authMiddleware = require('./src/middlewares/auth');
const { autenticarUsuario, gerarTokenSessao, verificarTokenSessao } = require('./src/config/users');
const DatabaseService = require('./src/services/DatabaseService');
const SocketService = require('./src/services/SocketService');

const webhookRoutes = require('./src/routes/webhookRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();
const server = http.createServer(app);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ROTA DE LOGIN (GET)
app.get('/login', (req, res) => {
    // Se já estiver logado, vai direto pro admin
    const cookies = req.headers.cookie ? req.headers.cookie.split(';').reduce((acc, c) => {
        const [k, v] = c.trim().split('=');
        acc[k] = decodeURIComponent(v || '');
        return acc;
    }, {}) : {};

    if (cookies['vip_auth'] && verificarTokenSessao(cookies['vip_auth'])) {
        return res.redirect('/admin');
    }
    res.render('login');
});

// ROTA DE LOGIN (POST)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await autenticarUsuario(email, password);

        if (!user) {
            return res.render('login', { error: 'Usuário/e-mail ou senha incorretos. Verifique suas credenciais.' });
        }

        const token = gerarTokenSessao(user);
        res.setHeader('Set-Cookie', `vip_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
        return res.redirect('/admin');
    } catch (err) {
        console.error('Erro no login:', err);
        return res.render('login', { error: 'Ocorreu um erro ao processar o login. Tente novamente.' });
    }
});

// ROTA DE LOGOUT (GET)
app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'vip_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.redirect('/login');
});

app.get('/', (req, res) => res.redirect('/admin'));
app.use('/webhook', webhookRoutes);
app.use('/admin', authMiddleware, adminRoutes);

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
        
        // Inicializa WebSocket (Socket.io)
        SocketService.inicializar(server);

        server.listen(config.server.port, '0.0.0.0', () => {
            console.log(`\n🍯 Favo de Mel - Painel de Atendimento Iniciado com Sucesso!`);
            console.log(`📡 Servidor de Atendimento: Porta ${config.server.port}`);
            console.log(`🔗 Webhook URL (Evolution API): ${config.server.url}/webhook/evolution`);
            console.log(`🔒 Painel de Controle: ${config.server.url}/admin\n`);
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