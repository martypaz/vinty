import { useCallback, useEffect, useState } from 'react'
import { fetchListings, markAsOrdered, type Listing } from './api'
import { ListingDetailModal } from './ListingDetailModal'

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
        {listings.map((listing) => (
          <li key={listing.vintedId} className="listing-card">
            {listing.photos[0] && <img src={listing.photos[0]} alt="" className="listing-photo" />}
            <a
              href={listing.vintedUrl}
              target="_blank"
              rel="noreferrer"
              className="listing-title"
            >
              {listing.title}
            </a>
            <dl className="listing-details">
              <div>
                <dt>Brand</dt>
                <dd>{listing.brand}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{listing.condition}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{listing.size}</dd>
              </div>
              <div>
                <dt>Vinted price</dt>
                <dd>
                  {listing.vintedPrice.amount.toFixed(2)} {listing.vintedPrice.currency}
                </dd>
              </div>
              <div>
                <dt>eBay est. price</dt>
                <dd>{listing.ebayMedianPrice.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Net profit</dt>
                <dd>{listing.netProfit.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{listing.marginPercent.toFixed(1)}%</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => handleMarkAsOrdered(listing.vintedId)}
              disabled={orderingId === listing.vintedId}
            >
              {orderingId === listing.vintedId ? 'Marking…' : 'Mark as Ordered'}
            </button>
            <button type="button" onClick={() => setDetailListing(listing)}>
              View details
            </button>
            {orderErrors[listing.vintedId] && (
              <p className="error" role="alert">
                {orderErrors[listing.vintedId]}
              </p>
            )}
          </li>
        ))}
      </ul>

      {detailListing && (
        <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} />
      )}
    </section>
  )
}
