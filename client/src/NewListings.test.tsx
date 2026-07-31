import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewListings } from './NewListings'
import type { Listing } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const listing: Listing = {
  vintedId: 123,
  title: 'Barbour Wax Jacket',
  brand: 'Barbour',
  condition: 'Very good',
  vintedPrice: { amount: 20, currency: 'GBP' },
  size: 'M',
  vintedUrl: 'https://www.vinted.co.uk/items/123',
  photos: ['https://images.vinted.net/123.jpg'],
  ebayMedianPrice: 55,
  ebayMedianShippingPrice: 4.5,
  ebayComparableCount: 6,
  vintedCostBasis: 22.4,
  postageCost: 4.5,
  ebayFees: 0,
  netProfit: 28.1,
  marginPercent: 51.1,
  status: 'new',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  orderedAt: null,
  listedAt: null,
  ebayListing: null,
}

describe('NewListings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders listing cards with the documented fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([listing])))

    render(<NewListings />)

    const titleLink = await screen.findByRole('link', { name: listing.title })
    expect(titleLink).toHaveAttribute('href', listing.vintedUrl)
    expect(titleLink).toHaveAttribute('target', '_blank')
    expect(screen.getByText(listing.brand)).toBeInTheDocument()
    expect(screen.getByText(listing.condition)).toBeInTheDocument()
    expect(screen.getByText(listing.size)).toBeInTheDocument()
    expect(screen.getByText('20.00 GBP')).toBeInTheDocument()
    expect(screen.getByText('55.00')).toBeInTheDocument()
    expect(screen.getByText('28.10')).toBeInTheDocument()
    expect(screen.getByText('51.1%')).toBeInTheDocument()
  })

  it('shows an empty state for an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<NewListings />)

    expect(await screen.findByText('No new listings.')).toBeInTheDocument()
  })

  it('shows an error state when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)))

    render(<NewListings />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('marks a listing as ordered and removes it from the list after refetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse({ ...listing, status: 'ordered' }))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<NewListings />)

    const orderButton = await screen.findByRole('button', { name: 'Mark as Ordered' })
    fireEvent.click(orderButton)

    await waitFor(() => expect(screen.getByText('No new listings.')).toBeInTheDocument())

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [patchUrl, patchInit] = fetchMock.mock.calls[1]
    expect(String(patchUrl)).toContain(`/api/listings/${listing.vintedId}/order`)
    expect(patchInit).toMatchObject({ method: 'PATCH' })
  })

  it('opens the listing detail modal when View details is clicked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<NewListings />)

    const detailsButton = await screen.findByRole('button', { name: 'View details' })
    fireEvent.click(detailsButton)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: listing.title })).toBeInTheDocument()
  })
})
