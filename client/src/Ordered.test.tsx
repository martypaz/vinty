import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Ordered } from './Ordered'
import type { Listing } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const listing: Listing = {
  vintedId: 456,
  title: 'North Face Puffer',
  brand: 'The North Face',
  condition: 'Like new',
  vintedPrice: { amount: 15, currency: 'GBP' },
  size: 'L',
  vintedUrl: 'https://www.vinted.co.uk/items/456',
  photos: ['https://images.vinted.net/456.jpg'],
  ebayMedianPrice: 60,
  ebayMedianShippingPrice: 5,
  ebayComparableCount: 5,
  vintedCostBasis: 17,
  postageCost: 5,
  ebayFees: 0,
  netProfit: 38,
  marginPercent: 63.3,
  status: 'ordered',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  orderedAt: '2026-07-28T09:00:00.000Z',
  listedAt: null,
  ebayListing: null,
}

async function openModal() {
  const button = await screen.findByRole('button', { name: 'List on eBay' })
  fireEvent.click(button)
  return screen.findByRole('dialog')
}

describe('Ordered', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders ordered cards with the documented fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([listing])))

    render(<Ordered />)

    const titleLink = await screen.findByRole('link', { name: listing.title })
    expect(titleLink).toHaveAttribute('href', listing.vintedUrl)
    expect(titleLink).toHaveAttribute('target', '_blank')
    expect(screen.getByText(listing.brand)).toBeInTheDocument()
    expect(screen.getByText(listing.condition)).toBeInTheDocument()
    expect(screen.getByText(listing.size)).toBeInTheDocument()
    expect(screen.getByText('2026-07-28')).toBeInTheDocument()
    expect(screen.getByText('15.00 GBP')).toBeInTheDocument()
    expect(screen.getByText('60.00')).toBeInTheDocument()
    expect(screen.getByText('38.00')).toBeInTheDocument()
    expect(screen.getByText('63.3%')).toBeInTheDocument()
  })

  it('shows an empty state for an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<Ordered />)

    expect(await screen.findByText('No ordered listings.')).toBeInTheDocument()
  })

  it('shows an error state when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)))

    render(<Ordered />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('opens the modal with the price field pre-filled to the eBay estimated price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([listing])))

    render(<Ordered />)
    await openModal()

    const priceInput = screen.getByLabelText('eBay price') as HTMLInputElement
    expect(priceInput.value).toBe('60.00')
  })

  it('blocks submit with validation errors and makes no API call for invalid input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([listing]))
    vi.stubGlobal('fetch', fetchMock)

    render(<Ordered />)
    await openModal()

    fireEvent.change(screen.getByLabelText('eBay price'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByText('URL is required.')).toBeInTheDocument()
    expect(screen.getByText('Price must be a number.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('submits valid input, closes the modal, and removes the item after refetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse({ ...listing, status: 'listed_on_ebay' }))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<Ordered />)
    await openModal()

    fireEvent.change(screen.getByLabelText('eBay title'), {
      target: { value: 'North Face Puffer - Mens L' },
    })
    fireEvent.change(screen.getByLabelText('eBay URL'), {
      target: { value: 'https://www.ebay.co.uk/itm/999' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('No ordered listings.')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [patchUrl, patchInit] = fetchMock.mock.calls[1]
    expect(String(patchUrl)).toContain(`/api/listings/${listing.vintedId}/ebay-listing`)
    expect(patchInit).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(patchInit.body as string)).toEqual({
      title: 'North Face Puffer - Mens L',
      price: 60,
      url: 'https://www.ebay.co.uk/itm/999',
    })
  })

  it('shows an inline error and keeps the modal + item on a failed submit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(<Ordered />)
    await openModal()

    fireEvent.change(screen.getByLabelText('eBay title'), { target: { value: 'Title' } })
    fireEvent.change(screen.getByLabelText('eBay URL'), { target: { value: 'https://ebay.co.uk/1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: listing.title })).toBeInTheDocument()
  })

  it('closes the modal without calling the API when Cancel is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([listing]))
    vi.stubGlobal('fetch', fetchMock)

    render(<Ordered />)
    await openModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('opens the listing detail modal when View details is clicked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([listing]))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<Ordered />)

    const detailsButton = await screen.findByRole('button', { name: 'View details' })
    fireEvent.click(detailsButton)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: listing.title })).toBeInTheDocument()
  })
})
