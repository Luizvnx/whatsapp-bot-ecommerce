const { verificarTokenSessao, autenticarUsuario } = require('../config/users');

function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
}

const authMiddleware = async (req, res, next) => {
    // 1. Tentar validar via Cookie HttpOnly ("vip_auth")
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['vip_auth'];

    if (token) {
        const user = verificarTokenSessao(token);
        if (user) {
            req.user = user;
            return next();
        }
    }

    // 2. Tentar validar via HTTP Basic Auth (caso utilizado por integrações/API)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
        try {
            const credentialsStr = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
            const [userEmail, pass] = credentialsStr.split(':');
            const user = await autenticarUsuario(userEmail, pass);
            if (user) {
                req.user = user;
                return next();
            }
        } catch (e) {
            // Falha na decodificação do basic auth
        }
    }

    // 3. Não autenticado: Se for requisição AJAX/API, responde 401 JSON; se for navegação visual, redireciona para /login
    const isApiRequest = req.xhr || 
                         req.headers.accept?.includes('application/json') || 
                         req.path.startsWith('/enviar-') || 
                         req.path.startsWith('/ia/') || 
                         req.path.startsWith('/conversa');

    if (isApiRequest) {
        return res.status(401).json({ success: false, message: 'Sessão expirada ou não autenticado. Faça login novamente.' });
    }

    return res.redirect('/login');
};

module.exports = authMiddleware;