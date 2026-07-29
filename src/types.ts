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
