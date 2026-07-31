import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EbayListings } from './EbayListings'
import type { Listing } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const listing: Listing = {
  vintedId: 789,
  title: 'Barbour Wax Jacket',
  brand: 'Barbour',
  condition: 'Very good',
  vintedPrice: { amount: 18.5, currency: 'GBP' },
  size: 'M',
  vintedUrl: 'https://www.vinted.co.uk/items/789',
  photos: ['https://images.vinted.net/789.jpg'],
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

describe('EbayListings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders eBay listing cards with the documented fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([listing])))

    render(<EbayListings />)

    const titleLink = await screen.findByRole('link', { name: listing.ebayListing!.title })
    expect(titleLink).toHaveAttribute('href', listing.ebayListing!.url)
    expect(titleLink).toHaveAttribute('target', '_blank')

    const vintedLink = screen.getByRole('link', { name: /view original vinted listing/i })
    expect(vintedLink).toHaveAttribute('href', listing.vintedUrl)
    expect(vintedLink).toHaveAttribute('target', '_blank')

    expect(screen.getByText('2026-07-29')).toBeInTheDocument()
    expect(screen.getByText('65.00')).toBeInTheDocument()
    expect(screen.getByText('18.50 GBP')).toBeInTheDocument()
    expect(screen.getByText('34.90')).toBeInTheDocument()
    expect(screen.getByText('58.2%')).toBeInTheDocument()
    expect(screen.getByText(listing.brand)).toBeInTheDocument()
    expect(screen.getByText(listing.condition)).toBeInTheDocument()
    expect(screen.getByText(listing.size)).toBeInTheDocument()
  })

  it('shows an empty state for an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<EbayListings />)

    expect(await screen.findByText('No eBay listings yet.')).toBeInTheDocument()
  })

  it('shows an error state when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)))

    render(<EbayListings />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('opens the listing detail modal when View details is clicked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<EbayListings />)

    const detailsButton = await screen.findByRole('button', { name: 'View details' })
    fireEvent.click(detailsButton)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: listing.title })).toBeInTheDocument()
  })
})
