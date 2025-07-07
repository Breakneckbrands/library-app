
export interface Book {
  isbn: string;
  title: string;
  authors: string[];
  publishedDate: string;
  description: string;
  pageCount: number;
  categories: string[];
  thumbnail: string;
}

export interface LibraryBook extends Book {
  notes: string;
}
