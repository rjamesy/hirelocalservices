/**
 * Region presets with anchor points for seed extraction.
 *
 * Each region has multiple overlapping anchors to maximize
 * Google Places coverage (20 results per query × multiple anchors).
 */

export interface Anchor {
  name: string
  lat: number
  lng: number
  radius: number // meters
}

export interface Region {
  id: string
  name: string
  state: string
  anchors: Anchor[]
}

export const REGIONS: Region[] = [
  {
    id: 'seq',
    name: 'South East Queensland',
    state: 'QLD',
    anchors: [
      { name: 'Brisbane CBD',        lat: -27.4698, lng: 153.0251, radius: 20000 },
      { name: 'Ipswich',             lat: -27.6144, lng: 152.7601, radius: 20000 },
      { name: 'Springfield Central', lat: -27.6793, lng: 152.9147, radius: 20000 },
      { name: 'Logan/Browns Plains', lat: -27.6626, lng: 153.0410, radius: 20000 },
      { name: 'Redland Bay',         lat: -27.6110, lng: 153.3036, radius: 20000 },
      { name: 'North Lakes',         lat: -27.2345, lng: 153.0200, radius: 20000 },
      { name: 'Caboolture',          lat: -27.0840, lng: 152.9510, radius: 20000 },
    ],
  },
]

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id)
}
