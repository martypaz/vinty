import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { EvaluatedCandidateItem, SoldComp } from "./types.js";

const DEFAULT_DB_PATH = "data/vinty.sqlite3";

export class ListingSaveError extends Error {}

const ADDED_COLUMNS: Array<[string, string]> = [
  ["ordered_at", "TEXT"],
  ["listed_at", "TEXT"],
  ["ebay_listing_title", "TEXT"],
  ["ebay_listing_price", "REAL"],
  ["ebay_listing_url", "TEXT"],
];

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      vinted_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      brand TEXT NOT NULL,
      condition TEXT NOT NULL,
      vinted_price_amount REAL NOT NULL,
      vinted_price_currency TEXT NOT NULL,
      size TEXT NOT NULL,
      vinted_url TEXT NOT NULL,
      photos TEXT NOT NULL,
      ebay_median_price REAL NOT NULL,
      ebay_median_shipping_price REAL NOT NULL,
      ebay_comparable_count INTEGER NOT NULL,
      vinted_cost_basis REAL NOT NULL,
      postage_cost REAL NOT NULL,
      ebay_fees REAL NOT NULL,
      net_profit REAL NOT NULL,
      margin_percent REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(listings)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );
  for (const [name, type] of ADDED_COLUMNS) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vinted_id INTEGER NOT NULL REFERENCES listings(vinted_id),
      recorded_at TEXT NOT NULL,
      ebay_median_price REAL NOT NULL,
      ebay_median_shipping_price REAL NOT NULL,
      ebay_comparable_count INTEGER NOT NULL,
      ebay_currency TEXT NOT NULL,
      net_profit REAL NOT NULL,
      margin_percent REAL NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS price_snapshot_comps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES price_snapshots(id),
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      sold_price REAL NOT NULL,
      sold_currency TEXT NOT NULL,
      shipping_price REAL NOT NULL,
      shipping_currency TEXT,
      url TEXT NOT NULL
    )
  `);
}

export function openDb(dbPath: string = process.env.VINTY_DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  const dir = path.dirname(dbPath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

export function upsertListing(db: Database.Database, candidate: EvaluatedCandidateItem): void {
  const { id, title, brand, condition, price, size, url, photos, ebayPriceEstimate, profitEvaluation } =
    candidate;
  const now = new Date().toISOString();

  try {
    const existing = db.prepare("SELECT vinted_id FROM listings WHERE vinted_id = ?").get(id);

    if (existing) {
      db.prepare(
        `UPDATE listings SET
          title = ?, brand = ?, condition = ?, vinted_price_amount = ?, vinted_price_currency = ?,
          size = ?, vinted_url = ?, photos = ?, ebay_median_price = ?, ebay_median_shipping_price = ?,
          ebay_comparable_count = ?, vinted_cost_basis = ?, postage_cost = ?, ebay_fees = ?,
          net_profit = ?, margin_percent = ?, updated_at = ?
        WHERE vinted_id = ?`
      ).run(
        title,
        brand,
        condition,
        price.amount,
        price.currency,
        size,
        url,
        JSON.stringify(photos),
        ebayPriceEstimate.medianPrice,
        ebayPriceEstimate.medianShippingPrice,
        ebayPriceEstimate.comparableCount,
        profitEvaluation.vintedCostBasis,
        profitEvaluation.postageCost,
        profitEvaluation.ebayFees,
        profitEvaluation.netProfit,
        profitEvaluation.marginPercent,
        now,
        id
      );
    } else {
      db.prepare(
        `INSERT INTO listings (
          vinted_id, title, brand, condition, vinted_price_amount, vinted_price_currency,
          size, vinted_url, photos, ebay_median_price, ebay_median_shipping_price,
          ebay_comparable_count, vinted_cost_basis, postage_cost, ebay_fees,
          net_profit, margin_percent, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
      ).run(
        id,
        title,
        brand,
        condition,
        price.amount,
        price.currency,
        size,
        url,
        JSON.stringify(photos),
        ebayPriceEstimate.medianPrice,
        ebayPriceEstimate.medianShippingPrice,
        ebayPriceEstimate.comparableCount,
        profitEvaluation.vintedCostBasis,
        profitEvaluation.postageCost,
        profitEvaluation.ebayFees,
        profitEvaluation.netProfit,
        profitEvaluation.marginPercent,
        now,
        now
      );
    }
  } catch (err) {
    throw new ListingSaveError(
      `Could not save listing ${id} to database: ${(err as Error).message}`
    );
  }
}

export function recordPriceSnapshot(db: Database.Database, candidate: EvaluatedCandidateItem): void {
  const { id, ebayPriceEstimate, profitEvaluation, soldComps } = candidate;
  const now = new Date().toISOString();

  try {
    const { lastInsertRowid: snapshotId } = db
      .prepare(
        `INSERT INTO price_snapshots (
          vinted_id, recorded_at, ebay_median_price, ebay_median_shipping_price,
          ebay_comparable_count, ebay_currency, net_profit, margin_percent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        now,
        ebayPriceEstimate.medianPrice,
        ebayPriceEstimate.medianShippingPrice,
        ebayPriceEstimate.comparableCount,
        ebayPriceEstimate.currency,
        profitEvaluation.netProfit,
        profitEvaluation.marginPercent
      );

    const insertComp = db.prepare(
      `INSERT INTO price_snapshot_comps (
        snapshot_id, item_id, title, sold_price, sold_currency, shipping_price, shipping_currency, url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const comp of soldComps as SoldComp[]) {
      insertComp.run(
        snapshotId,
        comp.itemId,
        comp.title,
        comp.soldPrice,
        comp.soldCurrency,
        comp.shippingPrice,
        comp.shippingCurrency,
        comp.url
      );
    }
  } catch (err) {
    throw new ListingSaveError(
      `Could not save price snapshot for listing ${id} to database: ${(err as Error).message}`
    );
  }
}
