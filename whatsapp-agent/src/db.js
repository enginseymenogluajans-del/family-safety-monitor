'use strict';

const fs = require('fs');
const path = require('path');
const Datastore = require('nedb-promises');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'messages.db'); // NeDB will handle this as a file

let db;

async function initDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = Datastore.create({
        filename: DB_PATH,
        autoload: true
    });
    // Create indexes
    await db.ensureIndex({ fieldName: 'id', unique: true });
    await db.ensureIndex({ fieldName: 'profile_id' });
    await db.ensureIndex({ fieldName: 'timestamp' });
    
    console.log(`[DB] NeDB messages.db açıldı: ${DB_PATH}`);
}

async function insertMessage(row) {
    try {
        // NeDB insert returns the inserted document
        // Using update with upsert:true to emulate INSERT OR IGNORE / REPLACE
        return await db.update({ id: row.id }, row, { upsert: true });
    } catch (err) {
        console.error('[DB] insertMessage hatası:', err.message);
    }
}

async function markDeleted(id) {
    const info = await db.update({ id: id }, { $set: { is_deleted: 1 } }, { multi: false });
    return info; // returns number of affected documents
}

async function insertTombstone(row) {
    // Tombstone is basically an update or insert
    return await db.update({ id: row.id }, row, { upsert: true });
}

async function getMessages(profileId, limit = 100) {
    return await db.find({ profile_id: profileId })
                   .sort({ timestamp: -1 })
                   .limit(limit);
}

async function getFlaggedMessages(profileId, limit = 200) {
    return await db.find({ 
        profile_id: profileId,
        $or: [
            { risk_level: { $ne: 'none' } },
            { is_deleted: 1 }
        ]
    })
    .sort({ timestamp: -1 })
    .limit(limit);
}

module.exports = { initDb, insertMessage, markDeleted, insertTombstone, getMessages, getFlaggedMessages };
