
import React from 'react';
import { Book } from '../types';
import { BookOpenIcon, SaveIcon } from './icons';

interface BookDetailsProps {
  book: Book;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  isLoading: boolean;
  error?: string | null;
}

const SkeletonLoader: React.FC = () => (
    <div className="animate-pulse flex flex-col items-center text-center">
        <div className="w-32 h-48 bg-gray-700 rounded-md mb-4"></div>
        <div className="h-6 w-3/4 bg-gray-700 rounded mb-2"></div>
        <div className="h-4 w-1/2 bg-gray-700 rounded mb-4"></div>
        <div className="h-4 w-full bg-gray-700 rounded mb-2"></div>
        <div className="h-4 w-full bg-gray-700 rounded mb-2"></div>
        <div className="h-4 w-5/6 bg-gray-700 rounded"></div>
    </div>
);

const BookDetails: React.FC<BookDetailsProps> = ({ book, notes, onNotesChange, onSave, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <BookOpenIcon className="w-8 h-8 mr-3"/>
            Fetching Book...
        </h2>
        <SkeletonLoader />
      </div>
    );
  }

  if (error) {
    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg text-center">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Scan Error</h2>
            <p className="text-gray-300">{error}</p>
        </div>
    );
  }

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <BookOpenIcon className="w-8 h-8 mr-3"/>
            Book Details
        </h2>
        <div className="flex flex-col md:flex-row gap-6">
            <img 
                src={book.thumbnail} 
                alt={`Cover of ${book.title}`} 
                className="w-32 h-48 object-cover rounded-md flex-shrink-0 mx-auto md:mx-0 shadow-md"
            />
            <div className="flex-grow">
                <h3 className="text-2xl font-bold text-white">{book.title}</h3>
                <p className="text-lg text-gray-300">{book.authors.join(', ')}</p>
                <p className="text-sm text-gray-400 mt-1">Published: {book.publishedDate}</p>
                 {book.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {book.categories.map(cat => (
                            <span key={cat} className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-full">{cat}</span>
                        ))}
                    </div>
                 )}
            </div>
        </div>
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-2">Notes</h4>
            <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Add your personal notes here..."
                className="w-full h-28 p-3 bg-gray-700 text-gray-200 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
            ></textarea>
        </div>
        <div className="mt-4">
            <p className="text-sm text-gray-400 mb-2">ISBN: {book.isbn}</p>
            <button
                onClick={onSave}
                className="w-full flex items-center justify-center py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
                <SaveIcon className="w-6 h-6 mr-2" />
                Save to Library
            </button>
        </div>
    </div>
  );
};

export default BookDetails;
