import { useCallback, useEffect, useState } from 'react'
import { fetchListings, type Listing } from './api'

export function EbayListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        {listings.map((listing) => (
          <li key={listing.vintedId} className="listing-card">
            {listing.photos[0] && <img src={listing.photos[0]} alt="" className="listing-photo" />}
            <a
              href={listing.ebayListing?.url}
              target="_blank"
              rel="noreferrer"
              className="listing-title"
            >
              {listing.ebayListing?.title}
            </a>
            <dl className="listing-details">
              <div>
                <dt>Listed</dt>
                <dd>{listing.listedAt?.slice(0, 10)}</dd>
              </div>
              <div>
                <dt>eBay price</dt>
                <dd>{listing.ebayListing?.price.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Vinted price</dt>
                <dd>
                  {listing.vintedPrice.amount.toFixed(2)} {listing.vintedPrice.currency}
                </dd>
              </div>
              <div>
                <dt>Net profit</dt>
                <dd>{listing.netProfit.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{listing.marginPercent.toFixed(1)}%</dd>
              </div>
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
            </dl>
            <a href={listing.vintedUrl} target="_blank" rel="noreferrer" className="secondary-link">
              View original Vinted listing →
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
