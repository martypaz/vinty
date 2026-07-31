import { useEffect, useState } from 'react'
import { fetchListingHistory, type Listing, type PriceSnapshot } from './api'

interface ListingDetailModalProps {
  listing: Listing
  onClose: () => void
}

export function ListingDetailModal({ listing, onClose }: ListingDetailModalProps) {
  const [history, setHistory] = useState<PriceSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchListingHistory(listing.vintedId)
      .then((data) => {
        if (!cancelled) setHistory(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setHistory([])
          setError(err instanceof Error ? err.message : 'Failed to load price history')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [listing.vintedId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fullscreen-modal-overlay" onClick={onClose}>
      <div
        className="fullscreen-modal"
        role="dialog"
        aria-modal="true"
        aria-label={listing.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="fullscreen-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {listing.photos[0] && (
          <img src={listing.photos[0]} alt="" className="fullscreen-modal-photo" />
        )}
        <h2>{listing.title}</h2>

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
          <div>
            <dt>Found</dt>
            <dd>{listing.createdAt.slice(0, 10)}</dd>
          </div>
          {listing.orderedAt && (
            <div>
              <dt>Ordered</dt>
              <dd>{listing.orderedAt.slice(0, 10)}</dd>
            </div>
          )}
          {listing.listedAt && (
            <div>
              <dt>Listed</dt>
              <dd>{listing.listedAt.slice(0, 10)}</dd>
            </div>
          )}
          {listing.ebayListing && (
            <>
              <div>
                <dt>eBay listing title</dt>
                <dd>{listing.ebayListing.title}</dd>
              </div>
              <div>
                <dt>eBay listing price</dt>
                <dd>{listing.ebayListing.price.toFixed(2)}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="fullscreen-modal-links">
          <a href={listing.vintedUrl} target="_blank" rel="noreferrer">
            View on Vinted →
          </a>
          {listing.ebayListing && (
            <a href={listing.ebayListing.url} target="_blank" rel="noreferrer">
              View on eBay →
            </a>
          )}
        </div>

        <h3>Price History</h3>

        {loading && <p className="loading-state">Loading history…</p>}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && history.length === 0 && (
          <p className="empty-state">No price history yet.</p>
        )}

        <ul className="price-history-list">
          {history.map((snapshot, index) => (
            <li key={index} className="price-history-item">
              <div className="price-history-summary">
                <span>{snapshot.recordedAt.slice(0, 10)}</span>
                <span>eBay median: {snapshot.ebayMedianPrice.toFixed(2)}</span>
                <span>Shipping: {snapshot.ebayMedianShippingPrice.toFixed(2)}</span>
                <span>{snapshot.ebayComparableCount} comps</span>
                <span>Net profit: {snapshot.netProfit.toFixed(2)}</span>
                <span>Margin: {snapshot.marginPercent.toFixed(1)}%</span>
              </div>
              <ul className="price-history-comps">
                {snapshot.comps.map((comp) => (
                  <li key={comp.itemId}>
                    <a href={comp.url} target="_blank" rel="noreferrer">
                      {comp.title} — {comp.soldPrice.toFixed(2)}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
