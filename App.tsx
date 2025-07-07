import React, { useState, useEffect, useCallback } from 'react';
import { Book, LibraryBook } from './types';
import { fetchBookByIsbn } from './services/googleBooksApi';
import Scanner from './components/Scanner';
import BookDetails from './components/BookDetails';
import Library from './components/Library';
import { BookOpenIcon, CameraIcon } from './components/icons';

const App: React.FC = () => {
  const [library, setLibrary] = useState<LibraryBook[]>(() => {
    try {
      const savedLibrary = localStorage.getItem('bookwiseLibrary');
      return savedLibrary ? JSON.parse(savedLibrary) : [];
    } catch (error) {
      console.error("Could not load library from localStorage", error);
      return [];
    }
  });
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'scanner' | 'details'>('scanner');

  useEffect(() => {
    try {
      localStorage.setItem('bookwiseLibrary', JSON.stringify(library));
    } catch (error)
    {
      console.error("Could not save library to localStorage", error);
    }
  }, [library]);

  const resetState = () => {
    setCurrentBook(null);
    setNotes('');
    setIsLoading(false);
    setError(null);
    setView('scanner');
  };

  const handleScanSuccess = useCallback(async (isbn: string) => {
    setIsLoading(true);
    setError(null);
    setCurrentBook(null);
    setNotes('');
    setView('details');

    const existingBook = library.find(b => b.isbn === isbn);
    if (existingBook) {
        setCurrentBook(existingBook);
        setNotes(existingBook.notes);
        setIsLoading(false);
        return;
    }

    const fetchedBook = await fetchBookByIsbn(isbn);
    if (fetchedBook) {
      setCurrentBook(fetchedBook);
    } else {
      setError(`Could not find a book with ISBN: ${isbn}. Please try another scan.`);
    }
    setIsLoading(false);
  }, [library]);

  const handleScanFailure = useCallback((scanError: string) => {
    setError(scanError);
    setView('details'); // show error in details pane
  }, []);

  const handleSaveBook = () => {
    if (!currentBook) return;

    const bookToSave: LibraryBook = { ...currentBook, notes };

    setLibrary(prevLibrary => {
        const existingIndex = prevLibrary.findIndex(b => b.isbn === bookToSave.isbn);
        if (existingIndex > -1) {
            const updatedLibrary = [...prevLibrary];
            updatedLibrary[existingIndex] = bookToSave;
            return updatedLibrary;
        }
        return [bookToSave, ...prevLibrary];
    });

    resetState();
  };
  
  const handleSelectBookFromLibrary = (book: LibraryBook) => {
    setCurrentBook(book);
    setNotes(book.notes);
    setView('details');
  };

  const handleExportToCsv = () => {
    if (library.length === 0) return;
  
    const headers = ['ISBN', 'Title', 'Authors', 'PublishedDate', 'PageCount', 'Categories', 'Notes', 'Thumbnail'];
    
    // Helper to format a value for CSV, handling commas and quotes
    const formatCsvField = (field: any): string => {
      const str = String(field ?? '');
      // If the string contains a comma, double quote, or newline, wrap it in double quotes.
      if (/[",\n]/.test(str)) {
        // Within a quoted field, double quotes must be escaped by another double quote.
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
  
    const csvContent = [
      headers.join(','),
      ...library.map(book => [
        formatCsvField(book.isbn),
        formatCsvField(book.title),
        formatCsvField(book.authors.join('; ')), // Join authors with a semicolon
        formatCsvField(book.publishedDate),
        formatCsvField(book.pageCount),
        formatCsvField(book.categories.join('; ')),
        formatCsvField(book.notes),
        formatCsvField(book.thumbnail),
      ].join(','))
    ].join('\n');
  
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "bookwise_library.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-6 lg:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
          BookWise Library Scanner
        </h1>
        <p className="text-gray-400 mt-2">Scan. Catalog. Remember.</p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-2">
          {view === 'scanner' && (
            <Scanner onScanSuccess={handleScanSuccess} onScanFailure={handleScanFailure} />
          )}
           {view === 'details' && (
             <button
                onClick={resetState}
                className="w-full flex items-center justify-center py-3 px-4 mb-6 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
                <CameraIcon className="w-6 h-6 mr-2" />
                Scan Next Book
            </button>
           )}
          <Library library={library} onSelectBook={handleSelectBookFromLibrary} onExport={handleExportToCsv} />
        </div>

        <div className="lg:col-span-3">
          {view === 'details' && currentBook && (
            <BookDetails
              book={currentBook}
              notes={notes}
              onNotesChange={setNotes}
              onSave={handleSaveBook}
              isLoading={isLoading}
              error={error}
            />
          )}
          {view === 'details' && !currentBook && (
             <div className="p-6 bg-gray-800 rounded-lg shadow-lg text-center h-full flex flex-col justify-center items-center">
                {isLoading ? (
                     <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                            <BookOpenIcon className="w-8 h-8 mr-3"/>
                            Fetching Book...
                        </h2>
                    </div>
                ): error ? (
                    <>
                        <h2 className="text-2xl font-bold text-red-400 mb-4">Scan Error</h2>
                        <p className="text-gray-300">{error}</p>
                    </>
                ) : null}
            </div>
          )}
          {view === 'scanner' && (
            <div className="p-6 bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-lg shadow-lg text-center h-full flex flex-col justify-center items-center">
                <BookOpenIcon className="w-16 h-16 text-gray-600 mb-4"/>
                <h2 className="text-2xl font-bold text-gray-400">Book Details Will Appear Here</h2>
                <p className="text-gray-500 mt-2">Scan an ISBN barcode to get started.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;