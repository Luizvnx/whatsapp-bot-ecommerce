const mysql = require('mysql2/promise'); 

const pool = mysql.createPool({ 
    host: process.env.DB_HOST_TEST,
    user: process.env.DB_USER_TEST,
    password: process.env.DB_PASSWORD_TEST,
    database: process.env.DB_NAME_TEST,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
 });

module.exports = pool;