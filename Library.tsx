import React from 'react';
import { LibraryBook } from '../types';
import { LibraryIcon, ExportIcon } from './icons';

interface LibraryProps {
  library: LibraryBook[];
  onSelectBook: (book: LibraryBook) => void;
  onExport: () => void;
}

const Library: React.FC<LibraryProps> = ({ library, onSelectBook, onExport }) => {
  return (
    <div className="w-full p-4 mt-6 bg-gray-800 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white flex items-center">
          <LibraryIcon className="w-6 h-6 mr-2" />
          My Library ({library.length})
        </h2>
        <button
          onClick={onExport}
          disabled={library.length === 0}
          className="flex items-center px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          aria-label="Export library to CSV"
        >
          <ExportIcon className="w-4 h-4 mr-1.5" />
          Export
        </button>
      </div>
      {library.length === 0 ? (
        <p className="text-gray-400 text-center py-8">Your library is empty. Scan a book to add it!</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {library.map((book, index) => (
            <div 
              key={`${book.isbn}-${index}`}
              className="group cursor-pointer aspect-[2/3] transform transition-transform hover:scale-105"
              onClick={() => onSelectBook(book)}
            >
              <img 
                src={book.thumbnail} 
                alt={book.title} 
                className="w-full h-full object-cover rounded-md shadow-lg group-hover:shadow-indigo-500/50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;