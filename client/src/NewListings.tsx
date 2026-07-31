import { useCallback, useEffect, useState } from 'react'
import { fetchListings, markAsOrdered, type Listing } from './api'
import { ListingDetailModal } from './ListingDetailModal'

function profitColor(value: number): string {
  return value >= 0 ? '#16a34a' : '#dc2626'
}

export function NewListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orderingId, setOrderingId] = useState<number | null>(null)
  const [orderErrors, setOrderErrors] = useState<Record<number, string>>({})
  const [detailListing, setDetailListing] = useState<Listing | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchListings('new')
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

  const handleMarkAsOrdered = async (vintedId: number) => {
    setOrderingId(vintedId)
    setOrderErrors((prev) => {
      const next = { ...prev }
      delete next[vintedId]
      return next
    })
    try {
      await markAsOrdered(vintedId)
      await load()
    } catch (err) {
      setOrderErrors((prev) => ({
        ...prev,
        [vintedId]: err instanceof Error ? err.message : 'Failed to mark as ordered',
      }))
    } finally {
      setOrderingId(null)
    }
  }

  return (
    <section>
      <div className="section-header">
        <h2>New Listings</h2>
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
        <p className="empty-state">No new listings.</p>
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
                  href={listing.vintedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="listing-card-title"
                >
                  {listing.title}
                </a>
                <div className="listing-card-meta">
                  {listing.brand} · {listing.condition} · Size {listing.size}
                </div>
                <div className="listing-card-stats">
                  <div className="stat-label">Vinted</div>
                  <div className="stat-value">
                    {listing.vintedPrice.amount.toFixed(2)} {listing.vintedPrice.currency}
                  </div>
                  <div className="stat-label">eBay est.</div>
                  <div className="stat-value">{listing.ebayMedianPrice.toFixed(2)}</div>
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
                  <button
                    type="button"
                    className="card-action-button"
                    onClick={() => handleMarkAsOrdered(listing.vintedId)}
                    disabled={orderingId === listing.vintedId}
                  >
                    {orderingId === listing.vintedId ? 'Marking…' : 'Mark as Ordered'}
                  </button>
                </div>
                {orderErrors[listing.vintedId] && (
                  <p className="error" role="alert">
                    {orderErrors[listing.vintedId]}
                  </p>
                )}
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
