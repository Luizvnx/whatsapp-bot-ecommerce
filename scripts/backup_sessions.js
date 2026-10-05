const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function backup() {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:llbuAXXpaNwGWyioNCaGczteJxuglzhA@mainline.proxy.rlwy.net:58753/railway';
    const client = new Client({ connectionString: dbUrl });
    
    console.log('🔄 Conectando ao PostgreSQL para backup das instâncias ativas...');
    await client.connect();

    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const instances = await client.query('SELECT * FROM "Instance"');
    const sessions = await client.query('SELECT * FROM "Session"');
    const settings = await client.query('SELECT * FROM "Setting"');

    const backupData = {
        timestamp: new Date().toISOString(),
        instancesCount: instances.rows.length,
        sessionsCount: sessions.rows.length,
        settingsCount: settings.rows.length,
        instances: instances.rows,
        sessions: sessions.rows,
        settings: settings.rows
    };

    const filePath = path.join(backupDir, `sessions_backup_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

    console.log(`✅ Backup concluído com sucesso em: ${filePath}`);
    console.log(`📦 Instâncias salvas (${instances.rows.length}):`, instances.rows.map(i => `${i.name} (${i.connectionStatus})`));
    console.log(`🔑 Sessões de autenticação salvas: ${sessions.rows.length}`);

    await client.end();
}

backup().catch(err => {
    console.error('❌ Erro durante o backup:', err);
    process.exit(1);
});
