import { getDb, saveDb, schedulesDb } from '../src/database/index.js';

async function testClaim() {
    const db = await getDb();

    // Create a dummy pending schedule
    db.run("INSERT INTO schedules (id, status, content_id, account_id, scheduled_at) VALUES (999, 'pending', 1, 1, '2026-01-01 00:00:00')");
    await saveDb();
    console.log("Created dummy schedule 999 with status 'pending'");

    // Try to claim it using the exact logic from the code
    // The code does:
    /*
        const result = database.run(sql, [id]);
        await saveDb();
        return database.getRowsModified() > 0;
    */

    // We will simulate this manually to see values

    // 1. Run UPDATE
    console.log("Running UPDATE...");
    db.run("UPDATE schedules SET status = 'running' WHERE id = 999 AND status = 'pending'");

    // Check rows modified immediately
    const immediateRows = db.getRowsModified();
    console.log(`Rows modified immediately after UPDATE: ${immediateRows}`);

    // 2. Run saveDb()
    console.log("Running saveDb()...");
    await saveDb();

    // 3. Check rows modified after saveDb
    const afterSaveRows = db.getRowsModified();
    console.log(`Rows modified after saveDb(): ${afterSaveRows}`);

    if (immediateRows > 0 && afterSaveRows === 0) {
        console.log("❌ FAILURE CONFIRMED: saveDb() clears getRowsModified()!");
    } else if (immediateRows > 0 && afterSaveRows > 0) {
        console.log("✅ getRowsModified() persists after saveDb()");
    } else {
        console.log("❓ Something else is wrong. Update didn't happen?");
    }

    // Cleanup
    db.run("DELETE FROM schedules WHERE id = 999");
    await saveDb();
}

testClaim().catch(console.error);
