import Link from 'next/link';

interface Category {
  name: string;
  slug: string;
  count?: number;
}

interface CategoryGridProps {
  categories: Category[];
}

const categoryColors = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-amber-500 to-amber-600',
  'from-purple-500 to-purple-600',
  'from-rose-500 to-rose-600',
  'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600',
  'from-orange-500 to-orange-600',
  'from-teal-500 to-teal-600',
  'from-pink-500 to-pink-600',
  'from-lime-500 to-lime-600',
  'from-sky-500 to-sky-600',
];

export default function CategoryGrid({ categories }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {categories.map((category, index) => (
        <Link
          key={category.slug}
          href={`/search?category=${category.slug}`}
          className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200"
        >
          {/* Avatar with first letter */}
          <div
            className={`
              flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br
              ${categoryColors[index % categoryColors.length]}
              text-xl font-bold text-white shadow-sm
              group-hover:scale-110 transition-transform duration-200
            `}
          >
            {category.name.charAt(0).toUpperCase()}
          </div>

          {/* Category Name */}
          <h3 className="mt-3 text-sm font-medium text-gray-900 text-center group-hover:text-brand-600 transition-colors line-clamp-2">
            {category.name}
          </h3>

          {/* Listing Count */}
          {category.count !== undefined && (
            <span className="mt-1 text-xs text-gray-500">
              {category.count} listing{category.count !== 1 ? 's' : ''}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
