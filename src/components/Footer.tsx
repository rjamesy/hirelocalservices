import Link from 'next/link';
import packageJson from '../../package.json';

const categoryLinks = [
  { name: 'Cleaning', slug: 'cleaning' },
  { name: 'Plumbing', slug: 'plumbing' },
  { name: 'Electrical', slug: 'electrical' },
  { name: 'Gardening', slug: 'gardening' },
  { name: 'Handyman', slug: 'handyman' },
  { name: 'Pest Control', slug: 'pest-control' },
];

const stateLinks = [
  { name: 'QLD', slug: 'qld' },
  { name: 'NSW', slug: 'nsw' },
  { name: 'VIC', slug: 'vic' },
  { name: 'SA', slug: 'sa' },
  { name: 'WA', slug: 'wa' },
  { name: 'TAS', slug: 'tas' },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-lg font-bold text-white"
            >
              <svg
                className="h-7 w-7 text-brand-400"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="32" height="32" rx="8" fill="currentColor" />
                <path
                  d="M8 16L14 22L24 10"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              HireLocalServices
            </Link>
            <div className="mt-3 space-y-1 text-sm text-gray-400 leading-relaxed">
              <p>ABN 42 329 061 077</p>
              <p>Greenbank, QLD 4124</p>
              <p>Queensland, Australia</p>
              <p>
                <a
                  href="mailto:support@hirelocalservices.com.au"
                  className="hover:text-white transition-colors"
                >
                  support@hirelocalservices.com.au
                </a>
              </p>
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Company
            </h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/disclaimer"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/claim"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Claim Listing
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Popular Categories
            </h3>
            <ul className="mt-4 space-y-2">
              {categoryLinks.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/search?category=${cat.slug}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* States */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Browse by State
            </h3>
            <ul className="mt-4 space-y-2">
              {stateLinks.map((state) => (
                <li key={state.slug}>
                  <Link
                    href={`/search?state=${state.slug}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-gray-800 pt-8 text-center space-y-2">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} HireLocalServices. All rights reserved.
          </p>
          <p className="text-xs text-gray-600" data-testid="footer-version">
            v{packageJson.version}
          </p>
          <p className="text-xs text-gray-600">
            Some location and mapping data may be sourced from publicly
            available geographic data providers to improve search functionality
            and accuracy.
          </p>
        </div>
      </div>
    </footer>
  );
}
