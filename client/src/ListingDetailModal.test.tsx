import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListingDetailModal } from './ListingDetailModal'
import type { Listing } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const listing: Listing = {
  vintedId: 111,
  title: 'Barbour Wax Jacket',
  brand: 'Barbour',
  condition: 'Very good',
  vintedPrice: { amount: 18.5, currency: 'GBP' },
  size: 'M',
  vintedUrl: 'https://www.vinted.co.uk/items/111',
  photos: ['https://images.vinted.net/111.jpg'],
  ebayMedianPrice: 60,
  ebayMedianShippingPrice: 4.5,
  ebayComparableCount: 8,
  vintedCostBasis: 20.6,
  postageCost: 4.5,
  ebayFees: 0,
  netProfit: 34.9,
  marginPercent: 58.2,
  status: 'listed_on_ebay',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  orderedAt: '2026-07-25T00:00:00.000Z',
  listedAt: '2026-07-29T10:00:00.000Z',
  ebayListing: {
    title: 'Barbour Beaufort Wax Jacket - Mens M',
    price: 65,
    url: 'https://www.ebay.co.uk/itm/999888',
  },
}

const snapshot1 = {
  recordedAt: '2026-07-20T00:00:00.000Z',
  ebayMedianPrice: 55,
  ebayMedianShippingPrice: 4,
  ebayComparableCount: 5,
  ebayCurrency: 'GBP',
  netProfit: 30,
  marginPercent: 54.5,
  comps: [
    {
      itemId: '1',
      title: 'Older sold coat',
      soldPrice: 55,
      soldCurrency: 'GBP',
      shippingPrice: 4,
      shippingCurrency: 'GBP',
      url: 'https://www.ebay.co.uk/itm/1',
    },
  ],
}

const snapshot2 = {
  recordedAt: '2026-07-29T00:00:00.000Z',
  ebayMedianPrice: 60,
  ebayMedianShippingPrice: 4.5,
  ebayComparableCount: 8,
  ebayCurrency: 'GBP',
  netProfit: 34.9,
  marginPercent: 58.2,
  comps: [
    {
      itemId: '2',
      title: 'Newer sold coat',
      soldPrice: 60,
      soldCurrency: 'GBP',
      shippingPrice: 4.5,
      shippingCurrency: 'GBP',
      url: 'https://www.ebay.co.uk/itm/2',
    },
  ],
}

describe('ListingDetailModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the listing details and both Vinted/eBay links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const onClose = vi.fn()

    render(<ListingDetailModal listing={listing} onClose={onClose} />)

    expect(screen.getByRole('heading', { name: listing.title })).toBeInTheDocument()
    expect(screen.getByText(listing.brand)).toBeInTheDocument()
    expect(screen.getByText(listing.condition)).toBeInTheDocument()
    expect(screen.getByText('18.50 GBP')).toBeInTheDocument()

    const vintedLink = screen.getByRole('link', { name: /view on vinted/i })
    expect(vintedLink).toHaveAttribute('href', listing.vintedUrl)
    const ebayLink = screen.getByRole('link', { name: /view on ebay/i })
    expect(ebayLink).toHaveAttribute('href', listing.ebayListing!.url)
  })

  it('fetches and renders price history snapshots oldest-first with comp links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([snapshot1, snapshot2])))

    render(<ListingDetailModal listing={listing} onClose={vi.fn()} />)

    const items = await screen.findAllByRole('listitem')
    const compLinks = screen.getAllByRole('link', { name: /sold coat/i })
    expect(compLinks).toHaveLength(2)
    expect(compLinks[0]).toHaveTextContent('Older sold coat')
    expect(compLinks[0]).toHaveAttribute('href', 'https://www.ebay.co.uk/itm/1')
    expect(compLinks[1]).toHaveTextContent('Newer sold coat')
    expect(items.length).toBeGreaterThan(0)
  })

  it('shows an empty state when there is no history yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<ListingDetailModal listing={listing} onClose={vi.fn()} />)

    expect(await screen.findByText('No price history yet.')).toBeInTheDocument()
  })

  it('shows an error state when the history fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)))

    render(<ListingDetailModal listing={listing} onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('closes when the Close button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const onClose = vi.fn()

    render(<ListingDetailModal listing={listing} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is clicked, but not when the dialog content is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const onClose = vi.fn()

    render(<ListingDetailModal listing={listing} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when Escape is pressed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const onClose = vi.fn()

    render(<ListingDetailModal listing={listing} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
