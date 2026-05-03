// src/config/index.js
require('dotenv').config();

const config = {
    server: {
        port: process.env.PORT || 8080,
        url: process.env.SERVER_URL || 'http://localhost:8080'
    },
    database: {
        // Prioridade 1: DATABASE_URL (Railway) 
        // Prioridade 2: DATABASE_CONNECTION_URI (Seu .env antigo)
        url: process.env.DATABASE_URL || process.env.DATABASE_CONNECTION_URI || null,
        
        // Peças individuais caso a URL não exista
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        pass: process.env.DB_PASSWORD ?? '', 
        name: process.env.DB_NAME || 'evolution_db',
        port: process.env.DB_PORT || 5432
    },
    evolution: {
        url: process.env.EVOLUTION_URL?.replace(/\/$/, ''),
        apiKey: process.env.EVOLUTION_API_KEY,
        instance: process.env.EVOLUTION_INSTANCE_NAME || 'FavoDeMel'
    },
    admin: {
        user: process.env.ADMIN_USER || 'admin',
        pass: process.env.ADMIN_PASS || 'admin'
    }
};

module.exports = config;