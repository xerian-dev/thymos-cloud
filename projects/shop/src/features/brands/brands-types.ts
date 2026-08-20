export interface BrandEntry {
  canonical: string;
  aliases: string[];
}

export interface BrandCategory {
  categoryId: string | null;
  categoryName: string;
  brands: BrandEntry[];
}
