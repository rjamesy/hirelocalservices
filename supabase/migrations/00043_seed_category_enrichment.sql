-- =============================================================================
-- 00043_seed_category_enrichment.sql
-- Populate synonyms, keywords, and sort_order for all categories
-- =============================================================================

-- ── Parent group sort order ──────────────────────────────────────────────────

UPDATE categories SET sort_order = 1  WHERE slug = 'cleaning'         AND parent_id IS NULL;
UPDATE categories SET sort_order = 2  WHERE slug = 'home-maintenance' AND parent_id IS NULL;
UPDATE categories SET sort_order = 3  WHERE slug = 'outdoor'          AND parent_id IS NULL;
UPDATE categories SET sort_order = 4  WHERE slug = 'automotive'       AND parent_id IS NULL;
UPDATE categories SET sort_order = 5  WHERE slug = 'moving-delivery'  AND parent_id IS NULL;
UPDATE categories SET sort_order = 6  WHERE slug = 'pest-control'     AND parent_id IS NULL;
UPDATE categories SET sort_order = 7  WHERE slug = 'pet-services'     AND parent_id IS NULL;
UPDATE categories SET sort_order = 8  WHERE slug = 'beauty-wellness'  AND parent_id IS NULL;
UPDATE categories SET sort_order = 9  WHERE slug = 'it-tech'          AND parent_id IS NULL;
UPDATE categories SET sort_order = 10 WHERE slug = 'events'           AND parent_id IS NULL;

-- ── Cleaning children ────────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['House Cleaner', 'Home Cleaning', 'Domestic Cleaning', 'Housekeeper'],
  keywords   = ARRAY['maid', 'regular clean', 'deep clean', 'spring clean', 'weekly clean'],
  sort_order = 1
WHERE slug = 'house-cleaning';

UPDATE categories SET
  synonyms   = ARRAY['Office Cleaner', 'Commercial Cleaning', 'Commercial Cleaner'],
  keywords   = ARRAY['workplace', 'corporate', 'shop clean', 'retail clean', 'strata'],
  sort_order = 2
WHERE slug = 'office-cleaning';

UPDATE categories SET
  synonyms   = ARRAY['Carpet Cleaner', 'Rug Cleaning', 'Rug Cleaner'],
  keywords   = ARRAY['steam clean', 'stain removal', 'upholstery', 'fabric'],
  sort_order = 3
WHERE slug = 'carpet-cleaning';

UPDATE categories SET
  synonyms   = ARRAY['Window Cleaner', 'Glass Cleaning'],
  keywords   = ARRAY['exterior windows', 'high rise', 'screen clean', 'glass'],
  sort_order = 4
WHERE slug = 'window-cleaning';

UPDATE categories SET
  synonyms   = ARRAY['Bond Cleaning', 'Vacate Cleaning', 'Exit Cleaning', 'Move Out Cleaning'],
  keywords   = ARRAY['bond back', 'rental clean', 'tenant', 'lease', 'moving out'],
  sort_order = 5
WHERE slug = 'end-of-lease-cleaning';

UPDATE categories SET
  synonyms   = ARRAY['Aircon Cleaner', 'AC Cleaning', 'Air Conditioning Cleaning'],
  keywords   = ARRAY['split system', 'ducted', 'filter clean', 'air conditioner', 'HVAC'],
  sort_order = 6
WHERE slug = 'aircon-cleaning';

-- ── Home Maintenance children ────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Handyperson', 'Odd Jobs', 'General Repairs', 'Mr Fix It'],
  keywords   = ARRAY['fix', 'repair', 'install', 'mount', 'assemble', 'maintenance', 'shelves', 'doors'],
  sort_order = 1
WHERE slug = 'handyman';

UPDATE categories SET
  synonyms   = ARRAY['Painter', 'House Painter', 'Interior Painter', 'Exterior Painter'],
  keywords   = ARRAY['interior', 'exterior', 'walls', 'ceiling', 'spray paint', 'colour', 'feature wall'],
  sort_order = 2
WHERE slug = 'painting';

UPDATE categories SET
  synonyms   = ARRAY['Plumber', 'Plumbers'],
  keywords   = ARRAY['drain', 'drains', 'leaks', 'pipes', 'taps', 'hot water', 'toilet', 'blocked drain', 'burst pipe', 'gas fitting'],
  sort_order = 3
WHERE slug = 'plumbing';

UPDATE categories SET
  synonyms   = ARRAY['Electrician', 'Electricians', 'Sparky'],
  keywords   = ARRAY['wiring', 'lights', 'power points', 'switchboard', 'fan install', 'safety switch', 'rewire', 'downlights'],
  sort_order = 4
WHERE slug = 'electrical';

UPDATE categories SET
  synonyms   = ARRAY['Carpenter', 'Carpenters', 'Joiner'],
  keywords   = ARRAY['timber', 'wood', 'deck', 'decking', 'pergola', 'cabinetry', 'shelving', 'doors', 'frames'],
  sort_order = 5
WHERE slug = 'carpentry';

UPDATE categories SET
  synonyms   = ARRAY['Fencer', 'Fence Builder', 'Fence Installer'],
  keywords   = ARRAY['colorbond', 'timber fence', 'pool fence', 'gate', 'paling', 'picket', 'boundary'],
  sort_order = 6
WHERE slug = 'fencing';

UPDATE categories SET
  synonyms   = ARRAY['Roofer', 'Roof Repairs', 'Roof Plumber'],
  keywords   = ARRAY['tiles', 'tin roof', 'leak', 'gutters', 'ridge capping', 'metal roof', 'roof restoration'],
  sort_order = 7
WHERE slug = 'roofing';

UPDATE categories SET
  synonyms   = ARRAY['Gutter Cleaner', 'Gutter Guard', 'Gutter Installer'],
  keywords   = ARRAY['downpipes', 'leaf guard', 'gutter replacement', 'fascia', 'spouting'],
  sort_order = 8
WHERE slug = 'guttering';

-- ── Outdoor children ─────────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Lawn Mower', 'Lawn Care', 'Grass Cutting', 'Mowing Service'],
  keywords   = ARRAY['grass', 'trim', 'edging', 'whipper snipper', 'ride on', 'yard'],
  sort_order = 1
WHERE slug = 'lawn-mowing';

UPDATE categories SET
  synonyms   = ARRAY['Gardener', 'Garden Maintenance', 'Garden Care'],
  keywords   = ARRAY['weeding', 'pruning', 'mulch', 'planting', 'hedge trimming', 'garden bed', 'plants'],
  sort_order = 2
WHERE slug = 'gardening';

UPDATE categories SET
  synonyms   = ARRAY['Tree Lopper', 'Arborist', 'Tree Trimming', 'Tree Surgeon'],
  keywords   = ARRAY['stump removal', 'stump grinding', 'branches', 'palm removal', 'pruning', 'dead tree'],
  sort_order = 3
WHERE slug = 'tree-removal';

UPDATE categories SET
  synonyms   = ARRAY['Landscaper', 'Landscape Designer', 'Garden Design'],
  keywords   = ARRAY['retaining wall', 'paving', 'turf', 'irrigation', 'outdoor living', 'garden design', 'hardscape'],
  sort_order = 4
WHERE slug = 'landscaping';

UPDATE categories SET
  synonyms   = ARRAY['Pressure Washer', 'High Pressure Cleaning', 'Water Blasting'],
  keywords   = ARRAY['driveway', 'concrete', 'deck wash', 'path', 'patio', 'graffiti removal'],
  sort_order = 5
WHERE slug = 'pressure-washing';

-- ── Automotive children ──────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Mobile Car Mechanic', 'Auto Mechanic', 'Car Mechanic'],
  keywords   = ARRAY['service', 'brakes', 'oil change', 'logbook', 'battery', 'engine', 'diagnostic'],
  sort_order = 1
WHERE slug = 'mobile-mechanic';

UPDATE categories SET
  synonyms   = ARRAY['Car Wash', 'Auto Detailing', 'Vehicle Detailing', 'Mobile Car Wash'],
  keywords   = ARRAY['polish', 'wax', 'interior clean', 'paint correction', 'ceramic coating', 'cut and polish'],
  sort_order = 2
WHERE slug = 'car-detailing';

UPDATE categories SET
  synonyms   = ARRAY['Tow Truck', 'Roadside Assistance', 'Vehicle Towing'],
  keywords   = ARRAY['breakdown', 'flat tyre', 'accident', 'transport', 'car transport'],
  sort_order = 3
WHERE slug = 'towing';

-- ── Moving & Delivery children ───────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Removalist', 'Movers', 'Moving Company', 'Furniture Removals'],
  keywords   = ARRAY['house move', 'office move', 'packing', 'interstate', 'local move', 'storage'],
  sort_order = 1
WHERE slug = 'removalists';

UPDATE categories SET
  synonyms   = ARRAY['Flat Pack Assembly', 'IKEA Assembly', 'Furniture Assembler'],
  keywords   = ARRAY['ikea', 'flatpack', 'desk', 'bookshelf', 'wardrobe', 'bed frame'],
  sort_order = 2
WHERE slug = 'furniture-assembly';

UPDATE categories SET
  synonyms   = ARRAY['Delivery Driver', 'Courier Service', 'Freight'],
  keywords   = ARRAY['parcel', 'same day', 'express', 'pickup', 'delivery'],
  sort_order = 3
WHERE slug = 'courier';

UPDATE categories SET
  synonyms   = ARRAY['Junk Removal', 'Waste Removal', 'Skip Bin', 'Tip Run'],
  keywords   = ARRAY['demolition', 'green waste', 'building waste', 'old furniture', 'cleanup', 'hoarder'],
  sort_order = 4
WHERE slug = 'rubbish-removal';

-- ── Pest Control children ────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Pest Exterminator', 'Bug Spray', 'Pest Management'],
  keywords   = ARRAY['cockroach', 'ants', 'spiders', 'fleas', 'bed bugs', 'insects', 'fumigation'],
  sort_order = 1
WHERE slug = 'general-pest-control';

UPDATE categories SET
  synonyms   = ARRAY['Termite Treatment', 'White Ant Inspection', 'Termite Control'],
  keywords   = ARRAY['white ants', 'timber pest', 'barrier', 'pre-purchase', 'building inspection'],
  sort_order = 2
WHERE slug = 'termite-inspection';

UPDATE categories SET
  synonyms   = ARRAY['Rat Control', 'Mouse Control', 'Rodent Removal'],
  keywords   = ARRAY['rats', 'mice', 'possum', 'bait', 'trapping', 'roof rats'],
  sort_order = 3
WHERE slug = 'rodent-control';

-- ── Pet Services children ────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Dog Walker', 'Pet Walking', 'Dog Exercise'],
  keywords   = ARRAY['puppy', 'exercise', 'park', 'daily walk', 'group walk'],
  sort_order = 1
WHERE slug = 'dog-walking';

UPDATE categories SET
  synonyms   = ARRAY['Dog Groomer', 'Pet Groomer', 'Dog Wash', 'Mobile Pet Grooming'],
  keywords   = ARRAY['bath', 'clip', 'trim', 'nails', 'deshed', 'shampoo', 'breed cut'],
  sort_order = 2
WHERE slug = 'pet-grooming';

UPDATE categories SET
  synonyms   = ARRAY['Pet Sitter', 'House Sitter', 'Dog Sitter', 'Cat Sitter'],
  keywords   = ARRAY['overnight', 'holiday', 'boarding', 'home visit', 'feeding'],
  sort_order = 3
WHERE slug = 'pet-sitting';

-- ── Beauty & Wellness children ───────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Mobile Hair Stylist', 'Home Hairdresser', 'Mobile Hair Dresser'],
  keywords   = ARRAY['haircut', 'colour', 'blowdry', 'balayage', 'highlights', 'cut and colour'],
  sort_order = 1
WHERE slug = 'mobile-hairdresser';

UPDATE categories SET
  synonyms   = ARRAY['Mobile Beautician', 'Beauty Therapist', 'Mobile Makeup Artist'],
  keywords   = ARRAY['facial', 'waxing', 'nails', 'lashes', 'brows', 'spray tan', 'makeup'],
  sort_order = 2
WHERE slug = 'mobile-beauty';

UPDATE categories SET
  synonyms   = ARRAY['Massage', 'Remedial Massage', 'Mobile Massage'],
  keywords   = ARRAY['deep tissue', 'sports massage', 'relaxation', 'physio', 'trigger point', 'back pain'],
  sort_order = 3
WHERE slug = 'massage-therapist';

-- ── IT & Tech children ───────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['PC Repair', 'Laptop Repair', 'IT Support', 'Computer Tech'],
  keywords   = ARRAY['virus', 'data recovery', 'slow computer', 'broken screen', 'upgrade', 'hardware', 'software'],
  sort_order = 1
WHERE slug = 'computer-repair';

UPDATE categories SET
  synonyms   = ARRAY['Mobile Phone Repair', 'Screen Repair', 'iPhone Repair', 'Samsung Repair'],
  keywords   = ARRAY['cracked screen', 'battery replacement', 'water damage', 'tablet repair'],
  sort_order = 2
WHERE slug = 'phone-repair';

UPDATE categories SET
  synonyms   = ARRAY['Home Automation', 'Smart Home Installer', 'IoT Setup'],
  keywords   = ARRAY['alexa', 'google home', 'smart lights', 'security camera', 'wifi', 'home theatre', 'automation'],
  sort_order = 3
WHERE slug = 'smart-home-setup';

-- ── Events children ──────────────────────────────────────────────────────────

UPDATE categories SET
  synonyms   = ARRAY['Photographer', 'Event Photographer', 'Wedding Photographer'],
  keywords   = ARRAY['portrait', 'wedding', 'corporate', 'headshots', 'family photos', 'product photography'],
  sort_order = 1
WHERE slug = 'photography';

UPDATE categories SET
  synonyms   = ARRAY['Disc Jockey', 'Music', 'Mobile DJ'],
  keywords   = ARRAY['wedding dj', 'party', 'music', 'sound system', 'karaoke', 'entertainment'],
  sort_order = 2
WHERE slug = 'dj';

UPDATE categories SET
  synonyms   = ARRAY['Caterer', 'Food Service', 'Event Catering'],
  keywords   = ARRAY['party food', 'wedding catering', 'corporate catering', 'buffet', 'canapes', 'BBQ'],
  sort_order = 3
WHERE slug = 'catering';

UPDATE categories SET
  synonyms   = ARRAY['Party Equipment', 'Event Hire', 'Party Rental'],
  keywords   = ARRAY['marquee', 'tables', 'chairs', 'jumping castle', 'photo booth', 'lighting', 'stage'],
  sort_order = 4
WHERE slug = 'party-hire';
