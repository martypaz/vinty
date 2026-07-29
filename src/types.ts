export interface CandidateItem {
  id: number;
  title: string;
  brand: string;
  condition: string;
  price: { amount: number; currency: string };
  size: string;
  sellerCountry: string;
  url: string;
  photos: string[];
}

export interface VintedRawPhoto {
  url: string;
}

export interface VintedRawItem {
  id: number;
  title: string;
  brand_title: string;
  status: string;
  price: { amount: string; currency_code: string };
  size_title: string;
  url: string;
  photos?: VintedRawPhoto[];
  photo?: VintedRawPhoto | null;
}

export interface VintedPagination {
  current_page: number;
  total_pages: number;
  total_entries: number;
  per_page: number;
}

export interface VintedSearchResponse {
  items: VintedRawItem[];
  pagination: VintedPagination;
}

export interface SoldCompsRawItem {
  itemId: string;
  title: string;
  soldPrice: string;
  soldCurrency: string;
  shippingPrice: string;
  shippingCurrency: string;
  url: string;
}

export interface SoldCompsResponse {
  keyword: string;
  totalItems: number;
  items: SoldCompsRawItem[];
}

export interface EbayPriceEstimate {
  available: boolean;
  medianPrice: number | null;
  medianShippingPrice: number | null;
  currency: string | null;
  comparableCount: number;
  reason: null | "capped" | "insufficient_comps";
}

export interface EnrichedCandidateItem extends CandidateItem {
  ebayPriceEstimate: EbayPriceEstimate;
}

export interface ProfitEvaluation {
  eligible: boolean;
  vintedCostBasis: number | null;
  postageCost: number | null;
  ebayFees: number | null;
  netProfit: number | null;
  marginPercent: number | null;
  meetsThreshold: boolean;
}

export interface EvaluatedCandidateItem extends EnrichedCandidateItem {
  profitEvaluation: ProfitEvaluation;
}
