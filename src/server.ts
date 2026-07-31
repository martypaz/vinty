import express, { Request, Response } from "express";
import cors from "cors";
import type Database from "better-sqlite3";

import { openDb } from "./db.js";
import { clearApprovalsPosts } from "./slackTools.js";

const DEFAULT_PORT = 3001;

interface ListingRow {
  vinted_id: number;
  title: string;
  brand: string;
  condition: string;
  vinted_price_amount: number;
  vinted_price_currency: string;
  size: string;
  vinted_url: string;
  photos: string;
  ebay_median_price: number;
  ebay_median_shipping_price: number;
  ebay_comparable_count: number;
  vinted_cost_basis: number;
  postage_cost: number;
  ebay_fees: number;
  net_profit: number;
  margin_percent: number;
  status: string;
  created_at: string;
  updated_at: string;
  ordered_at: string | null;
  listed_at: string | null;
  ebay_listing_title: string | null;
  ebay_listing_price: number | null;
  ebay_listing_url: string | null;
}

function toApiListing(row: ListingRow) {
  return {
    vintedId: row.vinted_id,
    title: row.title,
    brand: row.brand,
    condition: row.condition,
    vintedPrice: { amount: row.vinted_price_amount, currency: row.vinted_price_currency },
    size: row.size,
    vintedUrl: row.vinted_url,
    photos: JSON.parse(row.photos) as string[],
    ebayMedianPrice: row.ebay_median_price,
    ebayMedianShippingPrice: row.ebay_median_shipping_price,
    ebayComparableCount: row.ebay_comparable_count,
    vintedCostBasis: row.vinted_cost_basis,
    postageCost: row.postage_cost,
    ebayFees: row.ebay_fees,
    netProfit: row.net_profit,
    marginPercent: row.margin_percent,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderedAt: row.ordered_at,
    listedAt: row.listed_at,
    ebayListing:
      row.ebay_listing_title !== null &&
      row.ebay_listing_price !== null &&
      row.ebay_listing_url !== null
        ? { title: row.ebay_listing_title, price: row.ebay_listing_price, url: row.ebay_listing_url }
        : null,
  };
}

function getListingRow(db: Database.Database, id: number): ListingRow | undefined {
  return db.prepare("SELECT * FROM listings WHERE vinted_id = ?").get(id) as ListingRow | undefined;
}

interface PriceSnapshotRow {
  id: number;
  vinted_id: number;
  recorded_at: string;
  ebay_median_price: number;
  ebay_median_shipping_price: number;
  ebay_comparable_count: number;
  ebay_currency: string;
  net_profit: number;
  margin_percent: number;
}

interface PriceSnapshotCompRow {
  id: number;
  snapshot_id: number;
  item_id: string;
  title: string;
  sold_price: number;
  sold_currency: string;
  shipping_price: number;
  shipping_currency: string | null;
  url: string;
}

function toApiComp(row: PriceSnapshotCompRow) {
  return {
    itemId: row.item_id,
    title: row.title,
    soldPrice: row.sold_price,
    soldCurrency: row.sold_currency,
    shippingPrice: row.shipping_price,
    shippingCurrency: row.shipping_currency,
    url: row.url,
  };
}

export function createApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/listings", (req: Request, res: Response) => {
    const status = req.query.status;
    const rows =
      typeof status === "string"
        ? status === "listed_on_ebay"
          ? (db
              .prepare("SELECT * FROM listings WHERE status = ? ORDER BY listed_at DESC")
              .all(status) as ListingRow[])
          : (db
              .prepare("SELECT * FROM listings WHERE status = ? ORDER BY created_at DESC")
              .all(status) as ListingRow[])
        : (db.prepare("SELECT * FROM listings ORDER BY created_at DESC").all() as ListingRow[]);

    res.json(rows.map(toApiListing));
  });

  app.get("/api/listings/:id/history", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const listingRow = getListingRow(db, id);
    if (!listingRow) {
      res.status(404).json({ error: `Listing ${id} not found` });
      return;
    }

    const snapshots = db
      .prepare("SELECT * FROM price_snapshots WHERE vinted_id = ? ORDER BY recorded_at ASC")
      .all(id) as PriceSnapshotRow[];
    const compsStatement = db.prepare(
      "SELECT * FROM price_snapshot_comps WHERE snapshot_id = ? ORDER BY id ASC"
    );

    res.json(
      snapshots.map((snapshot) => ({
        recordedAt: snapshot.recorded_at,
        ebayMedianPrice: snapshot.ebay_median_price,
        ebayMedianShippingPrice: snapshot.ebay_median_shipping_price,
        ebayComparableCount: snapshot.ebay_comparable_count,
        ebayCurrency: snapshot.ebay_currency,
        netProfit: snapshot.net_profit,
        marginPercent: snapshot.margin_percent,
        comps: (compsStatement.all(snapshot.id) as PriceSnapshotCompRow[]).map(toApiComp),
      }))
    );
  });

  app.patch("/api/listings/:id/order", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = getListingRow(db, id);
    if (!row) {
      res.status(404).json({ error: `Listing ${id} not found` });
      return;
    }
    if (row.status !== "new") {
      res
        .status(409)
        .json({ error: `Listing ${id} is not in "new" status (currently "${row.status}")` });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE listings SET status = 'ordered', ordered_at = ?, updated_at = ? WHERE vinted_id = ?"
    ).run(now, now, id);

    res.json(toApiListing(getListingRow(db, id) as ListingRow));
  });

  app.patch("/api/listings/:id/ebay-listing", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { title, price, url } = body;

    if (typeof title !== "string" || title.length === 0) {
      res.status(400).json({ error: "title is required and must be a non-empty string" });
      return;
    }
    if (typeof price !== "number" || !Number.isFinite(price)) {
      res.status(400).json({ error: "price is required and must be a number" });
      return;
    }
    if (typeof url !== "string" || url.length === 0) {
      res.status(400).json({ error: "url is required and must be a non-empty string" });
      return;
    }

    const row = getListingRow(db, id);
    if (!row) {
      res.status(404).json({ error: `Listing ${id} not found` });
      return;
    }
    if (row.status !== "ordered") {
      res
        .status(409)
        .json({ error: `Listing ${id} is not in "ordered" status (currently "${row.status}")` });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE listings SET
        status = 'listed_on_ebay', listed_at = ?, ebay_listing_title = ?,
        ebay_listing_price = ?, ebay_listing_url = ?, updated_at = ?
      WHERE vinted_id = ?`
    ).run(now, title, price, url, now, id);

    res.json(toApiListing(getListingRow(db, id) as ListingRow));
  });

  app.post("/api/tools/clear-approvals-posts", async (_req: Request, res: Response) => {
    try {
      const result = await clearApprovalsPosts();
      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error clearing #approvals posts";
      res.status(500).json({ error: message });
    }
  });

  return app;
}

export function main(): void {
  const db = openDb();
  const app = createApp(db);
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  app.listen(port, "localhost", () => {
    process.stdout.write(`Listening on http://localhost:${port}\n`);
  });
}
