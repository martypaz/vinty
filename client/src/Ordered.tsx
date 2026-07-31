import { useCallback, useEffect, useState } from 'react'
import { fetchListings, submitEbayListing, type Listing } from './api'
import { ListingDetailModal } from './ListingDetailModal'

interface ModalState {
  vintedId: number
  title: string
  price: string
  url: string
}

interface ValidationErrors {
  title?: string
  price?: string
  url?: string
}

function validate(modal: ModalState): ValidationErrors {
  const errors: ValidationErrors = {}
  if (modal.title.trim() === '') {
    errors.title = 'Title is required.'
  }
  if (modal.url.trim() === '') {
    errors.url = 'URL is required.'
  }
  const parsedPrice = Number(modal.price)
  if (modal.price.trim() === '' || !Number.isFinite(parsedPrice)) {
    errors.price = 'Price must be a number.'
  }
  return errors
}

export function Ordered() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modal, setModal] = useState<ModalState | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [detailListing, setDetailListing] = useState<Listing | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchListings('ordered')
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

  const openModal = (listing: Listing) => {
    setModal({
      vintedId: listing.vintedId,
      title: '',
      price: listing.ebayMedianPrice.toFixed(2),
      url: '',
    })
    setValidationErrors({})
    setSubmitError(null)
  }

  const closeModal = () => {
    setModal(null)
    setValidationErrors({})
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (!modal) return

    const errors = validate(modal)
    setValidationErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitEbayListing(modal.vintedId, {
        title: modal.title.trim(),
        price: Number(modal.price),
        url: modal.url.trim(),
      })
      setModal(null)
      await load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record eBay listing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <div className="section-header">
        <h2>Ordered</h2>
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
        <p className="empty-state">No ordered listings.</p>
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
                <dt>Ordered</dt>
                <dd>{listing.orderedAt?.slice(0, 10)}</dd>
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
            <button type="button" onClick={() => openModal(listing)}>
              List on eBay
            </button>
            <button type="button" onClick={() => setDetailListing(listing)}>
              View details
            </button>
          </li>
        ))}
      </ul>

      {detailListing && (
        <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} />
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-label="List on eBay">
            <h3>List on eBay</h3>

            <label>
              eBay title
              <input
                type="text"
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
              />
            </label>
            {validationErrors.title && (
              <p className="error" role="alert">
                {validationErrors.title}
              </p>
            )}

            <label>
              eBay price
              <input
                type="text"
                value={modal.price}
                onChange={(e) => setModal({ ...modal, price: e.target.value })}
              />
            </label>
            {validationErrors.price && (
              <p className="error" role="alert">
                {validationErrors.price}
              </p>
            )}

            <label>
              eBay URL
              <input
                type="text"
                value={modal.url}
                onChange={(e) => setModal({ ...modal, url: e.target.value })}
              />
            </label>
            {validationErrors.url && (
              <p className="error" role="alert">
                {validationErrors.url}
              </p>
            )}

            {submitError && (
              <p className="error" role="alert">
                {submitError}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" onClick={closeModal} disabled={submitting}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
