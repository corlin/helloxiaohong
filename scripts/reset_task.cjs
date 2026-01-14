
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../src/config');

const dbPath = path.join(config.dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("UPDATE schedules SET status = 'pending', error_message = NULL WHERE id = 7", function (err) {
        if (err) {
            return console.error(err.message);
        }
        console.log(`Row(s) updated: ${this.changes}`);
    });
});

db.close();
