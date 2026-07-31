import { useEffect, useState } from 'react'
import { fetchListingHistory, type Listing, type PriceSnapshot } from './api'

interface ListingDetailModalProps {
  listing: Listing
  onClose: () => void
}

function profitColor(value: number): string {
  return value >= 0 ? '#16a34a' : '#dc2626'
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

  const listingProfitColor = profitColor(listing.netProfit)

  return (
    <div className="fullscreen-modal-overlay" onClick={onClose}>
      <div
        className="fullscreen-modal"
        role="dialog"
        aria-modal="true"
        aria-label={listing.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fullscreen-modal-header">
          <h2>Listing details</h2>
          <button type="button" className="fullscreen-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fullscreen-modal-detail">
          <div className="fullscreen-modal-photo">
            {listing.photos[0] ? <img src={listing.photos[0]} alt="" /> : 'photo'}
          </div>
          <div className="fullscreen-modal-detail-body">
            <a
              href={listing.vintedUrl}
              target="_blank"
              rel="noreferrer"
              className="fullscreen-modal-title"
            >
              {listing.title}
            </a>
            <div className="fullscreen-modal-meta">
              {listing.brand} · {listing.condition} · Size {listing.size}
            </div>
            <div className="fullscreen-modal-links">
              <a href={listing.vintedUrl} target="_blank" rel="noreferrer">
                Vinted listing ↗
              </a>
              {listing.ebayListing && (
                <a href={listing.ebayListing.url} target="_blank" rel="noreferrer">
                  eBay listing ↗
                </a>
              )}
            </div>
            <div className="fullscreen-modal-stats">
              <div>
                <div>Vinted price</div>
                <div>
                  {listing.vintedPrice.amount.toFixed(2)} {listing.vintedPrice.currency}
                </div>
              </div>
              <div>
                <div>eBay est.</div>
                <div>{listing.ebayMedianPrice.toFixed(2)}</div>
              </div>
              <div>
                <div>Profit</div>
                <div style={{ color: listingProfitColor }}>{listing.netProfit.toFixed(2)}</div>
              </div>
              <div>
                <div>Margin</div>
                <div style={{ color: listingProfitColor }}>{listing.marginPercent.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="price-history-section">
          <h3>Price history</h3>

          {loading && <p className="loading-state">Loading history…</p>}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && history.length === 0 && (
            <p className="price-history-empty">No price history yet.</p>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="price-history-timeline">
              {history.map((snapshot, index) => {
                const isLast = index === history.length - 1
                const snapshotColor = profitColor(snapshot.netProfit)
                return (
                  <div
                    key={index}
                    className={isLast ? 'price-history-item is-last' : 'price-history-item'}
                  >
                    <div className="price-history-summary">
                      <span className="price-history-date">{snapshot.recordedAt.slice(0, 10)}</span>
                      <span className="price-history-comp-count">
                        {snapshot.ebayComparableCount} comps
                      </span>
                    </div>
                    <div className="price-history-stats">
                      <div>
                        <div>eBay median</div>
                        <div>{snapshot.ebayMedianPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div>Shipping</div>
                        <div>{snapshot.ebayMedianShippingPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div>Profit</div>
                        <div style={{ color: snapshotColor }}>{snapshot.netProfit.toFixed(2)}</div>
                      </div>
                      <div>
                        <div>Margin</div>
                        <div style={{ color: snapshotColor }}>
                          {snapshot.marginPercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <ul className="price-history-comps">
                      {snapshot.comps.map((comp) => (
                        <li key={comp.itemId}>
                          <a href={comp.url} target="_blank" rel="noreferrer">
                            {comp.title}
                          </a>
                          <span className="comp-price">{comp.soldPrice.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
