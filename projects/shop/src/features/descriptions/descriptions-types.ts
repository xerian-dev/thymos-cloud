export interface DescriptionEntry {
  canonical: string;
  aliases: string[];
}

export interface DescriptionCategory {
  categoryId: string | null;
  categoryName: string;
  descriptions: DescriptionEntry[];
}
