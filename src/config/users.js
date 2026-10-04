const crypto = require('crypto');
const DatabaseService = require('../services/DatabaseService');

// Secret para assinatura de cookies HTTP-Only
const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'favodemel_whatsapp_secure_auth_secret_key_2026';

const DEFAULT_USERS = [
    {
        login: 'admin',
        email: 'admin@favodemel.com',
        pass: 'admin',
        name: 'Favo de Mel'
    },
    {
        login: 'luiz',
        email: 'luizvnx@vipcodex.com',
        pass: 'Luiz1227!',
        name: 'Luiz'
    }
];

/**
 * Autentica usuário buscando primeiro no PostgreSQL (tb_usuarios) com fallback local
 */
async function autenticarUsuario(loginOuEmail, pass) {
    if (!loginOuEmail || !pass) return null;
    const termo = loginOuEmail.trim().toLowerCase();

    try {
        const sql = `
            SELECT id, login, email, nome, senha 
            FROM tb_usuarios 
            WHERE LOWER(login) = $1 OR LOWER(email) = $1
            LIMIT 1
        `;
        const res = await DatabaseService.executar(sql, [termo]);
        if (res && res.rows.length > 0) {
            const userDb = res.rows[0];
            if (userDb.senha === pass) {
                return {
                    id: userDb.id,
                    login: userDb.login,
                    email: userDb.email,
                    name: userDb.nome
                };
            }
            return null; // Senha incorreta
        }
    } catch (err) {
        console.warn('⚠️ Falha ao consultar tb_usuarios no banco, usando fallback:', err.message);
    }

    // Fallback para admin/admin caso tabela ainda não tenha sido criada
    const fallbackUser = DEFAULT_USERS.find(u => 
        (u.login.toLowerCase() === termo || u.email.toLowerCase() === termo) && u.pass === pass
    );

    if (fallbackUser) {
        return {
            id: 1,
            login: fallbackUser.login,
            email: fallbackUser.email,
            name: fallbackUser.name
        };
    }

    return null;
}

/**
 * Obtém os dados completos do usuário logado
 */
async function obterUsuarioPorEmailOuLogin(termo) {
    if (!termo) return null;
    const cleanTermo = termo.trim().toLowerCase();

    try {
        const sql = `
            SELECT id, login, email, nome 
            FROM tb_usuarios 
            WHERE LOWER(email) = $1 OR LOWER(login) = $1
            LIMIT 1
        `;
        const res = await DatabaseService.executar(sql, [cleanTermo]);
        if (res && res.rows.length > 0) {
            const row = res.rows[0];
            return { id: row.id, login: row.login, email: row.email, name: row.nome };
        }
    } catch (err) {
        console.warn('⚠️ Erro ao buscar usuário no banco:', err.message);
    }

    const fallbackUser = DEFAULT_USERS.find(u => 
        u.email.toLowerCase() === cleanTermo || u.login.toLowerCase() === cleanTermo
    );
    if (fallbackUser) {
        return { id: 1, login: fallbackUser.login, email: fallbackUser.email, name: fallbackUser.name };
    }

    return null;
}

/**
 * Atualiza nome, e-mail e/ou senha do usuário no banco de dados PostgreSQL
 */
async function atualizarPerfilUsuario(emailAtual, { nome, email, senhaAtual, novaSenha }) {
    if (!emailAtual) throw new Error('Usuário não identificado.');

    // 1. Localiza usuário atual no banco
    const sqlBusca = `
        SELECT id, login, email, nome, senha 
        FROM tb_usuarios 
        WHERE LOWER(email) = LOWER($1) OR LOWER(login) = LOWER($1)
        LIMIT 1
    `;
    let res = await DatabaseService.executar(sqlBusca, [emailAtual]);

    // Se o usuário ainda não existir na tabela (ex: primeiro acesso fallback), insere agora
    if (!res || res.rows.length === 0) {
        await DatabaseService.executar(`
            INSERT INTO tb_usuarios (login, email, nome, senha)
            VALUES ('admin', 'admin@favodemel.com', 'Favo de Mel', 'admin')
            ON CONFLICT DO NOTHING
        `);
        res = await DatabaseService.executar(sqlBusca, [emailAtual]);
    }

    if (!res || res.rows.length === 0) {
        throw new Error('Usuário não encontrado para atualização.');
    }

    const user = res.rows[0];

    // 2. Se for alterar a senha, valida a senha atual
    let senhaFinal = user.senha;
    if (novaSenha && novaSenha.trim()) {
        if (!senhaAtual) {
            throw new Error('Informe a senha atual para autorizar a troca de senha.');
        }
        if (user.senha !== senhaAtual) {
            throw new Error('A senha atual informada está incorreta.');
        }
        if (novaSenha.trim().length < 3) {
            throw new Error('A nova senha deve ter pelo menos 3 caracteres.');
        }
        senhaFinal = novaSenha.trim();
    }

    const nomeFinal = (nome && nome.trim()) ? nome.trim() : user.nome;
    const emailFinal = (email && email.trim()) ? email.trim().toLowerCase() : user.email;

    // 3. Executa a atualização
    const sqlUpdate = `
        UPDATE tb_usuarios 
        SET nome = $1, email = $2, senha = $3, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id, login, email, nome
    `;
    const updateRes = await DatabaseService.executar(sqlUpdate, [nomeFinal, emailFinal, senhaFinal, user.id]);
    const updated = updateRes.rows[0];

    return {
        id: updated.id,
        login: updated.login,
        email: updated.email,
        name: updated.nome
    };
}

function gerarTokenSessao(user) {
    const payload = JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        created: Date.now()
    });
    const base64Payload = Buffer.from(payload).toString('base64url');
    const signature = crypto.createHmac('sha256', SECRET).update(base64Payload).digest('base64url');
    return `${base64Payload}.${signature}`;
}

function verificarTokenSessao(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64Payload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(base64Payload).digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
    }

    try {
        const payloadStr = Buffer.from(base64Payload, 'base64url').toString('utf8');
        const payload = JSON.parse(payloadStr);
        // Token válido por 30 dias
        if (Date.now() - payload.created > 30 * 24 * 60 * 60 * 1000) {
            return null;
        }
        return { id: payload.id, email: payload.email, name: payload.name };
    } catch (e) {
        return null;
    }
}

module.exports = {
    DEFAULT_USERS,
    autenticarUsuario,
    obterUsuarioPorEmailOuLogin,
    atualizarPerfilUsuario,
    gerarTokenSessao,
    verificarTokenSessao
};
