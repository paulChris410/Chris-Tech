/**
 * SQLITE DATABASE MODULE (db.js)
 * Implements WAL mode, Foreign Keys, and the 3-Invite Referral & Loyalty Schema:
 *  - customers
 *  - orders
 *  - admin_notifications
 *  - settings
 * Includes automatic JSON persistence fallback if native better-sqlite3 binary is not compiled.
 */

const fs = require('fs');
const path = require('path');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (e) {}

const SQLITE_FILE = path.join(__dirname, 'bpc_referral_crm.sqlite');
const JSON_FILE = path.join(__dirname, 'crm_database.json');

let db = null;

if (Database) {
  try {
    db = new Database(SQLITE_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        referral_code TEXT UNIQUE,
        confirmed_referrals INTEGER DEFAULT 0,
        reward_available INTEGER DEFAULT 0,
        total_rewards_redeemed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        customer_phone TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        category TEXT DEFAULT 'STREAMING',
        plan TEXT NOT NULL,
        base_price_xaf INTEGER NOT NULL,
        discount_xaf INTEGER DEFAULT 0,
        final_price_xaf INTEGER NOT NULL,
        referred_by_code TEXT,
        reward_redeemed INTEGER DEFAULT 0,
        free_netflix_eligible INTEGER DEFAULT 0,
        free_netflix_claimed INTEGER DEFAULT 0,
        account_email TEXT DEFAULT '',
        account_pin TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        activated_at DATETIME,
        expires_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS admin_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        customer_phone TEXT,
        referral_code TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  } catch (err) {
    db = null;
  }
}

// Helper to generate unique referral code: <FIRST_3_LETTERS_OF_NAME>-<3_RANDOM_DIGITS> (e.g. PAU-482)
function generateReferralCode(name, existingCodes = []) {
  const clean = (name || 'VIP').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = (clean.length >= 3 ? clean.substring(0, 3) : (clean + 'VIP').substring(0, 3));
  let code = '';
  do {
    const digits = Math.floor(100 + Math.random() * 900);
    code = `${prefix}-${digits}`;
  } while (existingCodes.includes(code));
  return code;
}

module.exports = {
  db,
  SQLITE_FILE,
  JSON_FILE,
  generateReferralCode
};
