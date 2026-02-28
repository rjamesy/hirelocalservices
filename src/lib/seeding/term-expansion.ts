/**
 * Maps category slugs to multiple Google Places search terms
 * for broader coverage. Categories not listed here fall back
 * to their single googleQuery from CATEGORY_QUERIES.
 */

export const TERM_EXPANSION: Record<string, string[]> = {
  // Cleaning
  'house-cleaning': [
    'house cleaning',
    'domestic cleaning',
    'end of lease cleaning',
    'bond cleaning',
    'cleaners',
  ],
  'office-cleaning': [
    'office cleaning',
    'commercial cleaning',
    'janitorial service',
  ],
  'carpet-cleaning': [
    'carpet cleaning',
    'carpet steam cleaning',
    'upholstery cleaning',
  ],
  'window-cleaning': [
    'window cleaning',
    'window washer',
  ],
  'end-of-lease-cleaning': [
    'end of lease cleaning',
    'bond cleaning',
    'vacate cleaning',
  ],
  'aircon-cleaning': [
    'air conditioning cleaning',
    'aircon service',
    'air conditioning maintenance',
  ],

  // Home Maintenance
  'handyman': [
    'handyman',
    'handyman service',
    'home repairs',
    'odd jobs',
  ],
  'painting': [
    'house painter',
    'painting service',
    'interior painter',
    'exterior painter',
  ],
  'plumbing': [
    'plumber',
    'plumbing service',
    'emergency plumber',
    'blocked drain plumber',
  ],
  'electrical': [
    'electrician',
    'electrical service',
    'emergency electrician',
  ],
  'carpentry': [
    'carpenter',
    'carpentry service',
    'cabinet maker',
  ],
  'fencing': [
    'fencing contractor',
    'fence builder',
    'fencing installation',
  ],
  'roofing': [
    'roofing contractor',
    'roof repair',
    'roof restoration',
  ],
  'guttering': [
    'gutter cleaning',
    'gutter repair',
    'gutter installation',
  ],

  // Outdoor
  'lawn-mowing': [
    'lawn mowing',
    'lawn care service',
    'grass cutting',
  ],
  'gardening': [
    'gardening service',
    'garden maintenance',
    'gardener',
  ],
  'tree-removal': [
    'tree removal',
    'tree lopping',
    'arborist',
    'tree cutting service',
  ],
  'landscaping': [
    'landscaping',
    'landscape design',
    'landscaper',
  ],
  'pressure-washing': [
    'pressure washing',
    'pressure cleaning',
    'high pressure cleaning',
  ],

  // Automotive
  'mobile-mechanic': [
    'mobile mechanic',
    'mobile auto repair',
    'car mechanic',
  ],
  'car-detailing': [
    'car detailing',
    'mobile car wash',
    'auto detailing',
  ],
  'towing': [
    'towing service',
    'tow truck',
    'roadside assistance',
  ],

  // Moving & Delivery
  'removalists': [
    'removalist',
    'moving service',
    'furniture removals',
  ],
  'furniture-assembly': [
    'furniture assembly',
    'flat pack assembly',
    'ikea assembly',
  ],
  'courier': [
    'courier service',
    'delivery service',
    'same day courier',
  ],
  'rubbish-removal': [
    'rubbish removal',
    'junk removal',
    'skip bin hire',
    'waste removal',
  ],

  // Pest Control
  'general-pest-control': [
    'pest control',
    'pest exterminator',
    'bug spray service',
  ],
  'termite-inspection': [
    'termite inspection',
    'termite treatment',
    'white ant inspection',
  ],
  'rodent-control': [
    'rodent control',
    'rat exterminator',
    'mouse control',
  ],

  // Pet Services
  'dog-walking': [
    'dog walking',
    'dog walker',
    'pet walking service',
  ],
  'pet-grooming': [
    'pet grooming',
    'dog grooming',
    'mobile pet grooming',
  ],
  'pet-sitting': [
    'pet sitting',
    'pet minding',
    'house sitting pets',
  ],

  // Beauty & Wellness
  'mobile-hairdresser': [
    'mobile hairdresser',
    'mobile hair stylist',
  ],
  'mobile-beauty': [
    'mobile beauty therapist',
    'mobile beauty service',
    'mobile nails',
  ],
  'massage-therapist': [
    'massage therapist',
    'remedial massage',
    'mobile massage',
  ],

  // IT & Tech
  'computer-repair': [
    'computer repair',
    'laptop repair',
    'PC repair service',
  ],
  'phone-repair': [
    'phone repair',
    'mobile phone repair',
    'screen repair',
  ],
  'smart-home-setup': [
    'smart home installation',
    'home automation',
    'smart home setup',
  ],

  // Events
  'photography': [
    'photographer',
    'event photographer',
    'portrait photographer',
  ],
  'dj': [
    'DJ hire',
    'wedding DJ',
    'party DJ',
  ],
  'catering': [
    'catering service',
    'event catering',
    'party catering',
  ],
  'party-hire': [
    'party hire',
    'event hire equipment',
    'party equipment rental',
  ],
}
