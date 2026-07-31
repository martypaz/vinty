export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export type ListingStatus = 'new' | 'ordered' | 'listed_on_ebay'

export interface Money {
  amount: number
  currency: string
}

export interface EbayListingDetails {
  title: string
  price: number
  url: string
}

export interface Listing {
  vintedId: number
  title: string
  brand: string
  condition: string
  vintedPrice: Money
  size: string
  vintedUrl: string
  photos: string[]
  ebayMedianPrice: number
  ebayMedianShippingPrice: number
  ebayComparableCount: number
  vintedCostBasis: number
  postageCost: number
  ebayFees: number
  netProfit: number
  marginPercent: number
  status: ListingStatus
  createdAt: string
  updatedAt: string
  orderedAt: string | null
  listedAt: string | null
  ebayListing: EbayListingDetails | null
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? fallback
  } catch {
    return fallback
  }
}

export async function fetchListings(status?: ListingStatus): Promise<Listing[]> {
  const url = new URL('/api/listings', API_BASE_URL)
  if (status) {
    url.searchParams.set('status', status)
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to fetch listings (${res.status})`))
  }
  return (await res.json()) as Listing[]
}

export async function markAsOrdered(vintedId: number): Promise<Listing> {
  const res = await fetch(new URL(`/api/listings/${vintedId}/order`, API_BASE_URL), {
    method: 'PATCH',
  })
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to mark listing ${vintedId} as ordered (${res.status})`)
    )
  }
  return (await res.json()) as Listing
}

export async function submitEbayListing(
  vintedId: number,
  details: EbayListingDetails
): Promise<Listing> {
  const res = await fetch(new URL(`/api/listings/${vintedId}/ebay-listing`, API_BASE_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to record eBay listing for ${vintedId} (${res.status})`)
    )
  }
  return (await res.json()) as Listing
}

export interface SoldComp {
  itemId: string
  title: string
  soldPrice: number
  soldCurrency: string
  shippingPrice: number
  shippingCurrency: string | null
  url: string
}

export interface PriceSnapshot {
  recordedAt: string
  ebayMedianPrice: number
  ebayMedianShippingPrice: number
  ebayComparableCount: number
  ebayCurrency: string
  netProfit: number
  marginPercent: number
  comps: SoldComp[]
}

export async function fetchListingHistory(vintedId: number): Promise<PriceSnapshot[]> {
  const res = await fetch(new URL(`/api/listings/${vintedId}/history`, API_BASE_URL))
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to fetch price history for ${vintedId} (${res.status})`)
    )
  }
  return (await res.json()) as PriceSnapshot[]
}

export interface ClearApprovalsResult {
  deletedCount: number
  failedCount: number
  errors: string[]
}

export async function clearApprovalsPosts(): Promise<ClearApprovalsResult> {
  const res = await fetch(new URL('/api/tools/clear-approvals-posts', API_BASE_URL), {
    method: 'POST',
  })
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to clear #approvals posts (${res.status})`))
  }
  return (await res.json()) as ClearApprovalsResult
}
