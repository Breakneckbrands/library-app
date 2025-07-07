
import { Book } from '../types';

export async function fetchBookByIsbn(isbn: string): Promise<Book | null> {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (!response.ok) {
      console.error("Google Books API request failed:", response.statusText);
      return null;
    }

    const data = await response.json();
    if (data.totalItems === 0 || !data.items || data.items.length === 0) {
      console.log(`No book found for ISBN: ${isbn}`);
      return null;
    }

    const item = data.items[0];
    const volumeInfo = item.volumeInfo;

    const book: Book = {
      isbn: isbn,
      title: volumeInfo.title || "No Title",
      authors: volumeInfo.authors || [],
      publishedDate: volumeInfo.publishedDate || "N/A",
      description: volumeInfo.description || "No description available.",
      pageCount: volumeInfo.pageCount || 0,
      categories: volumeInfo.categories || [],
      thumbnail: volumeInfo.imageLinks?.thumbnail || `https://picsum.photos/seed/${isbn}/128/192`,
    };

    return book;
  } catch (error) {
    console.error("Error fetching book data:", error);
    return null;
  }
}
