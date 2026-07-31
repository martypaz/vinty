import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import request from "supertest";

import { createApp } from "../src/server.js";
import { initSchema } from "../src/db.js";

function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

interface SeedOverrides {
  vintedId?: number;
  status?: string;
  title?: string;
  createdAt?: string;
  listedAt?: string;
}

function seedListing(db: Database.Database, overrides: SeedOverrides = {}): number {
  const vintedId = overrides.vintedId ?? 1;
  const createdAt = overrides.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO listings (
      vinted_id, title, brand, condition, vinted_price_amount, vinted_price_currency,
      size, vinted_url, photos, ebay_median_price, ebay_median_shipping_price,
      ebay_comparable_count, vinted_cost_basis, postage_cost, ebay_fees,
      net_profit, margin_percent, status, created_at, updated_at, listed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    vintedId,
    overrides.title ?? "Barbour Puffer coat",
    "Barbour",
    "Very good",
    15,
    "GBP",
    "M",
    "https://www.vinted.co.uk/items/" + vintedId,
    JSON.stringify(["https://images1.vinted.net/1.jpeg"]),
    75,
    11,
    4,
    17,
    11,
    0,
    47,
    62.67,
    overrides.status ?? "new",
    createdAt,
    createdAt,
    overrides.listedAt ?? null
  );
  return vintedId;
}

describe("GET /api/listings", () => {
  it("returns all listings, camelCase-mapped, newest first (AC-3)", async () => {
    const db = makeTestDb();
    seedListing(db, { vintedId: 1, createdAt: "2026-01-01T00:00:00.000Z" });
    seedListing(db, { vintedId: 2, createdAt: "2026-02-01T00:00:00.000Z" });
    const app = createApp(db);

    const res = await request(app).get("/api/listings");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].vintedId).toBe(2); // newest first
    expect(res.body[1].vintedId).toBe(1);
    const listing = res.body[0];
    expect(listing.vintedPrice).toEqual({ amount: 15, currency: "GBP" });
    expect(listing.photos).toEqual(["https://images1.vinted.net/1.jpeg"]);
    expect(listing.status).toBe("new");
    expect(listing.orderedAt).toBeNull();
    expect(listing.listedAt).toBeNull();
    expect(listing.ebayListing).toBeNull();
  });

  it("filters by status query param (AC-3)", async () => {
    const db = makeTestDb();
    seedListing(db, { vintedId: 1, status: "new" });
    seedListing(db, { vintedId: 2, status: "ordered" });
    const app = createApp(db);

    const res = await request(app).get("/api/listings?status=ordered");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vintedId).toBe(2);
  });

  it("orders status=listed_on_ebay results by listed_at descending (AC-2)", async () => {
    const db = makeTestDb();
    seedListing(db, {
      vintedId: 1,
      status: "listed_on_ebay",
      createdAt: "2026-02-01T00:00:00.000Z",
      listedAt: "2026-02-05T00:00:00.000Z",
    });
    seedListing(db, {
      vintedId: 2,
      status: "listed_on_ebay",
      createdAt: "2026-01-01T00:00:00.000Z",
      listedAt: "2026-03-10T00:00:00.000Z",
    });
    const app = createApp(db);

    const res = await request(app).get("/api/listings?status=listed_on_ebay");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // vintedId 2 has an earlier createdAt but a later listedAt, so it must come first
    expect(res.body[0].vintedId).toBe(2);
    expect(res.body[1].vintedId).toBe(1);
  });

  it("keeps created_at descending order for other statuses and no filter (AC-2 regression)", async () => {
    const db = makeTestDb();
    seedListing(db, { vintedId: 1, status: "ordered", createdAt: "2026-01-01T00:00:00.000Z" });
    seedListing(db, { vintedId: 2, status: "ordered", createdAt: "2026-02-01T00:00:00.000Z" });
    const app = createApp(db);

    const orderedRes = await request(app).get("/api/listings?status=ordered");
    expect(orderedRes.body[0].vintedId).toBe(2);
    expect(orderedRes.body[1].vintedId).toBe(1);

    const allRes = await request(app).get("/api/listings");
    expect(allRes.body[0].vintedId).toBe(2);
    expect(allRes.body[1].vintedId).toBe(1);
  });
});

describe("PATCH /api/listings/:id/order", () => {
  it("marks a 'new' listing as ordered (AC-4)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "new" });
    const app = createApp(db);

    const res = await request(app).patch(`/api/listings/${id}/order`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");
    expect(res.body.orderedAt).toBeTruthy();
  });

  it("returns 409 when the listing isn't 'new' (AC-4)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "ordered" });
    const app = createApp(db);

    const res = await request(app).patch(`/api/listings/${id}/order`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 404 for an unknown id (AC-6)", async () => {
    const db = makeTestDb();
    const app = createApp(db);

    const res = await request(app).patch("/api/listings/999/order");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/listings/:id/ebay-listing", () => {
  it("lists an 'ordered' listing on eBay (AC-5)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "ordered" });
    const app = createApp(db);

    const res = await request(app)
      .patch(`/api/listings/${id}/ebay-listing`)
      .send({ title: "Barbour coat, great condition", price: 60, url: "https://www.ebay.co.uk/itm/1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("listed_on_ebay");
    expect(res.body.listedAt).toBeTruthy();
    expect(res.body.ebayListing).toEqual({
      title: "Barbour coat, great condition",
      price: 60,
      url: "https://www.ebay.co.uk/itm/1",
    });
  });

  it("returns 409 when the listing isn't 'ordered' (AC-5)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "new" });
    const app = createApp(db);

    const res = await request(app)
      .patch(`/api/listings/${id}/ebay-listing`)
      .send({ title: "x", price: 10, url: "https://example.com" });

    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown id (AC-6)", async () => {
    const db = makeTestDb();
    const app = createApp(db);

    const res = await request(app)
      .patch("/api/listings/999/ebay-listing")
      .send({ title: "x", price: 10, url: "https://example.com" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a missing title without touching the database (AC-6)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "ordered" });
    const app = createApp(db);

    const res = await request(app)
      .patch(`/api/listings/${id}/ebay-listing`)
      .send({ price: 10, url: "https://example.com" });

    expect(res.status).toBe(400);
    const row = db.prepare("SELECT status FROM listings WHERE vinted_id = ?").get(id) as {
      status: string;
    };
    expect(row.status).toBe("ordered");
  });

  it("returns 400 for a non-numeric price (AC-6)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "ordered" });
    const app = createApp(db);

    const res = await request(app)
      .patch(`/api/listings/${id}/ebay-listing`)
      .send({ title: "x", price: "not a number", url: "https://example.com" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing url (AC-6)", async () => {
    const db = makeTestDb();
    const id = seedListing(db, { status: "ordered" });
    const app = createApp(db);

    const res = await request(app)
      .patch(`/api/listings/${id}/ebay-listing`)
      .send({ title: "x", price: 10 });

    expect(res.status).toBe(400);
  });
});
