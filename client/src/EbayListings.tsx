import { useCallback, useEffect, useState } from 'react'
import { fetchListings, type Listing } from './api'
import { ListingDetailModal } from './ListingDetailModal'

function profitColor(value: number): string {
  return value >= 0 ? '#16a34a' : '#dc2626'
}

export function EbayListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailListing, setDetailListing] = useState<Listing | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchListings('listed_on_ebay')
      setListings(data)
    } catch (err) {
      setListings([])
      setError(err instanceof Error ? err.message : 'Failed to load listings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section>
      <div className="section-header">
        <h2>eBay Listings</h2>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && listings.length === 0 && !error && (
        <p className="loading-state">Loading listings…</p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && listings.length === 0 && (
        <p className="empty-state">No eBay listings yet.</p>
      )}

      <ul className="listing-grid">
        {listings.map((listing) => {
          const color = profitColor(listing.netProfit)
          return (
            <li key={listing.vintedId} className="listing-card">
              <div className="listing-card-photo">
                {listing.photos[0] ? <img src={listing.photos[0]} alt="" /> : 'photo'}
              </div>
              <div className="listing-card-body">
                <a
                  href={listing.ebayListing?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="listing-card-title"
                >
                  {listing.ebayListing?.title}
                </a>
                <div className="listing-card-meta">
                  {listing.brand} · {listing.condition} · Size {listing.size}
                  {listing.listedAt && ` · Listed ${listing.listedAt.slice(0, 10)}`}
                </div>
                <div className="listing-card-stats">
                  <div className="stat-label">Vinted</div>
                  <div className="stat-value">
                    {listing.vintedPrice.amount.toFixed(2)} {listing.vintedPrice.currency}
                  </div>
                  <div className="stat-label">eBay price</div>
                  <div className="stat-value">{listing.ebayListing?.price.toFixed(2)}</div>
                  <div className="stat-label">Profit</div>
                  <div className="stat-value emphasis" style={{ color }}>
                    {listing.netProfit.toFixed(2)}
                  </div>
                  <div className="stat-label">Margin</div>
                  <div className="stat-value emphasis" style={{ color }}>
                    {listing.marginPercent.toFixed(1)}%
                  </div>
                </div>
                <div className="listing-card-footer">
                  <button type="button" className="view-details-link" onClick={() => setDetailListing(listing)}>
                    View details
                  </button>
                  <a href={listing.vintedUrl} target="_blank" rel="noreferrer" className="secondary-link">
                    View original Vinted listing →
                  </a>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {detailListing && (
        <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} />
      )}
    </section>
  )
}
