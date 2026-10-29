/**
 * Countries an operator persona can come from, each with the languages people
 * there commonly write in (first = default) and major cities with city-center
 * coordinates (2 dp, the same precision the profile PATCH keeps).
 *
 * Pure data with no server imports: the admin pages receive it as props. A
 * persona always lives in its own country, so the stored location
 * (city, English country name, lower-case country code, coordinates) comes
 * from this table and never from the model or the browser.
 */

export type PersonaCity = {
  /** English name, stored as `locationCity` (viewers' apps re-localize it from the coordinates). */
  name: string
  latitude: number
  longitude: number
  /** Relative pick weight for generated drafts (bigger cities are picked more often). */
  weight: number
}

export type PersonaCountry = {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string
  /** Staff-facing name. */
  nameKo: string
  /** Stored as `locationCountry`. */
  nameEn: string
  /** STT language codes people there commonly write in; the first is the default. */
  languages: string[]
  cities: PersonaCity[]
}

function city(name: string, latitude: number, longitude: number, weight = 1): PersonaCity {
  return { name, latitude, longitude, weight }
}

export const PERSONA_COUNTRIES: readonly PersonaCountry[] = [
  {
    code: 'KR', nameKo: '대한민국', nameEn: 'South Korea', languages: ['ko'],
    cities: [city('Seoul', 37.57, 126.98, 5), city('Busan', 35.18, 129.08, 2), city('Incheon', 37.46, 126.71), city('Daegu', 35.87, 128.6), city('Daejeon', 36.35, 127.38), city('Gwangju', 35.16, 126.85)],
  },
  {
    code: 'JP', nameKo: '일본', nameEn: 'Japan', languages: ['ja'],
    cities: [city('Tokyo', 35.68, 139.69, 5), city('Osaka', 34.69, 135.5, 3), city('Yokohama', 35.44, 139.64, 2), city('Nagoya', 35.18, 136.91), city('Fukuoka', 33.59, 130.4), city('Sapporo', 43.06, 141.35), city('Kyoto', 35.01, 135.77)],
  },
  {
    code: 'TW', nameKo: '대만', nameEn: 'Taiwan', languages: ['zh-TW'],
    cities: [city('Taipei', 25.03, 121.57, 4), city('New Taipei', 25.01, 121.47, 2), city('Taichung', 24.15, 120.67, 2), city('Kaohsiung', 22.63, 120.3, 2), city('Tainan', 22.99, 120.21)],
  },
  {
    code: 'CN', nameKo: '중국', nameEn: 'China', languages: ['zh-CN'],
    cities: [city('Shanghai', 31.23, 121.47, 4), city('Beijing', 39.9, 116.41, 4), city('Guangzhou', 23.13, 113.26, 2), city('Shenzhen', 22.54, 114.06, 2), city('Chengdu', 30.57, 104.07), city('Hangzhou', 30.27, 120.16)],
  },
  {
    code: 'VN', nameKo: '베트남', nameEn: 'Vietnam', languages: ['vi'],
    cities: [city('Ho Chi Minh City', 10.82, 106.63, 4), city('Hanoi', 21.03, 105.85, 4), city('Da Nang', 16.05, 108.22), city('Hai Phong', 20.84, 106.69), city('Can Tho', 10.05, 105.75)],
  },
  {
    code: 'TH', nameKo: '태국', nameEn: 'Thailand', languages: ['th'],
    cities: [city('Bangkok', 13.76, 100.5, 5), city('Chiang Mai', 18.79, 98.98, 2), city('Phuket', 7.88, 98.39), city('Khon Kaen', 16.43, 102.83), city('Pattaya', 12.93, 100.88)],
  },
  {
    code: 'ID', nameKo: '인도네시아', nameEn: 'Indonesia', languages: ['id'],
    cities: [city('Jakarta', -6.21, 106.85, 5), city('Surabaya', -7.25, 112.75, 2), city('Bandung', -6.92, 107.62, 2), city('Medan', 3.6, 98.67), city('Denpasar', -8.65, 115.22), city('Yogyakarta', -7.8, 110.36)],
  },
  {
    code: 'PH', nameKo: '필리핀', nameEn: 'Philippines', languages: ['tl', 'en'],
    cities: [city('Manila', 14.6, 120.98, 3), city('Quezon City', 14.68, 121.04, 3), city('Cebu City', 10.32, 123.89, 2), city('Davao City', 7.19, 125.46), city('Makati', 14.55, 121.02)],
  },
  {
    code: 'MY', nameKo: '말레이시아', nameEn: 'Malaysia', languages: ['ms', 'en'],
    cities: [city('Kuala Lumpur', 3.14, 101.69, 4), city('George Town', 5.41, 100.33), city('Johor Bahru', 1.49, 103.74), city('Kota Kinabalu', 5.98, 116.07)],
  },
  {
    code: 'SG', nameKo: '싱가포르', nameEn: 'Singapore', languages: ['en', 'zh-CN'],
    cities: [city('Singapore', 1.29, 103.85)],
  },
  {
    code: 'IN', nameKo: '인도', nameEn: 'India', languages: ['hi', 'en'],
    cities: [city('Mumbai', 19.08, 72.88, 3), city('Delhi', 28.61, 77.21, 3), city('Bengaluru', 12.97, 77.59, 2), city('Hyderabad', 17.39, 78.49), city('Chennai', 13.08, 80.27), city('Kolkata', 22.57, 88.36), city('Pune', 18.52, 73.86)],
  },
  {
    code: 'US', nameKo: '미국', nameEn: 'United States', languages: ['en', 'es'],
    cities: [city('New York', 40.71, -74.01, 4), city('Los Angeles', 34.05, -118.24, 4), city('Chicago', 41.88, -87.63, 2), city('San Francisco', 37.77, -122.42, 2), city('Seattle', 47.61, -122.33), city('Houston', 29.76, -95.37), city('Austin', 30.27, -97.74), city('Boston', 42.36, -71.06), city('Atlanta', 33.75, -84.39)],
  },
  {
    code: 'CA', nameKo: '캐나다', nameEn: 'Canada', languages: ['en', 'fr'],
    cities: [city('Toronto', 43.65, -79.38, 4), city('Vancouver', 49.28, -123.12, 3), city('Montreal', 45.5, -73.57, 2), city('Calgary', 51.05, -114.07), city('Ottawa', 45.42, -75.7)],
  },
  {
    code: 'GB', nameKo: '영국', nameEn: 'United Kingdom', languages: ['en'],
    cities: [city('London', 51.51, -0.13, 5), city('Manchester', 53.48, -2.24, 2), city('Birmingham', 52.49, -1.89), city('Edinburgh', 55.95, -3.19), city('Glasgow', 55.86, -4.25), city('Bristol', 51.45, -2.59)],
  },
  {
    code: 'AU', nameKo: '호주', nameEn: 'Australia', languages: ['en'],
    cities: [city('Sydney', -33.87, 151.21, 4), city('Melbourne', -37.81, 144.96, 4), city('Brisbane', -27.47, 153.03, 2), city('Perth', -31.95, 115.86), city('Adelaide', -34.93, 138.6)],
  },
  {
    code: 'FR', nameKo: '프랑스', nameEn: 'France', languages: ['fr'],
    cities: [city('Paris', 48.86, 2.35, 5), city('Lyon', 45.76, 4.84, 2), city('Marseille', 43.3, 5.37, 2), city('Toulouse', 43.6, 1.44), city('Nice', 43.7, 7.27), city('Bordeaux', 44.84, -0.58)],
  },
  {
    code: 'DE', nameKo: '독일', nameEn: 'Germany', languages: ['de'],
    cities: [city('Berlin', 52.52, 13.4, 4), city('Munich', 48.14, 11.58, 2), city('Hamburg', 53.55, 9.99, 2), city('Cologne', 50.94, 6.96), city('Frankfurt', 50.11, 8.68), city('Leipzig', 51.34, 12.37)],
  },
  {
    code: 'ES', nameKo: '스페인', nameEn: 'Spain', languages: ['es'],
    cities: [city('Madrid', 40.42, -3.7, 4), city('Barcelona', 41.39, 2.17, 4), city('Valencia', 39.47, -0.38), city('Seville', 37.39, -5.98), city('Málaga', 36.72, -4.42)],
  },
  {
    code: 'IT', nameKo: '이탈리아', nameEn: 'Italy', languages: ['it'],
    cities: [city('Rome', 41.9, 12.5, 4), city('Milan', 45.46, 9.19, 4), city('Naples', 40.85, 14.27), city('Turin', 45.07, 7.69), city('Florence', 43.77, 11.26), city('Bologna', 44.49, 11.34)],
  },
  {
    code: 'BR', nameKo: '브라질', nameEn: 'Brazil', languages: ['pt'],
    cities: [city('São Paulo', -23.55, -46.63, 5), city('Rio de Janeiro', -22.91, -43.17, 3), city('Belo Horizonte', -19.92, -43.94), city('Brasília', -15.79, -47.88), city('Curitiba', -25.43, -49.27), city('Porto Alegre', -30.03, -51.23), city('Salvador', -12.97, -38.5)],
  },
  {
    code: 'MX', nameKo: '멕시코', nameEn: 'Mexico', languages: ['es'],
    cities: [city('Mexico City', 19.43, -99.13, 5), city('Guadalajara', 20.66, -103.35, 2), city('Monterrey', 25.69, -100.32, 2), city('Puebla', 19.04, -98.21), city('Tijuana', 32.51, -117.04)],
  },
  {
    code: 'AR', nameKo: '아르헨티나', nameEn: 'Argentina', languages: ['es'],
    cities: [city('Buenos Aires', -34.6, -58.38, 5), city('Córdoba', -31.42, -64.18), city('Rosario', -32.95, -60.64), city('Mendoza', -32.89, -68.83)],
  },
  {
    code: 'TR', nameKo: '튀르키예', nameEn: 'Türkiye', languages: ['tr'],
    cities: [city('Istanbul', 41.01, 28.98, 5), city('Ankara', 39.93, 32.86, 2), city('Izmir', 38.42, 27.14), city('Antalya', 36.9, 30.7)],
  },
]

export type PersonaCountryPreset = { id: string; label: string; codes: string[] }

/** One-tap groups in the creation wizard. */
export const PERSONA_COUNTRY_PRESETS: readonly PersonaCountryPreset[] = [
  { id: 'east-asia', label: '동아시아', codes: ['JP', 'TW', 'CN'] },
  { id: 'southeast-asia', label: '동남아시아', codes: ['VN', 'TH', 'ID', 'PH', 'MY', 'SG'] },
  { id: 'english', label: '영어권', codes: ['US', 'CA', 'GB', 'AU'] },
  { id: 'europe', label: '유럽', codes: ['FR', 'DE', 'ES', 'IT'] },
  { id: 'latin-america', label: '중남미', codes: ['BR', 'MX', 'AR'] },
]

const COUNTRY_BY_CODE = new Map(PERSONA_COUNTRIES.map(country => [country.code, country]))

export function findPersonaCountry(code: unknown): PersonaCountry | null {
  if (typeof code !== 'string') return null
  return COUNTRY_BY_CODE.get(code.trim().toUpperCase()) ?? null
}

function cityKey(name: string): string {
  return name.normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

/** The table city of `country` whose name matches (case and accents ignored), or null. */
export function findPersonaCity(country: PersonaCountry, name: unknown): PersonaCity | null {
  if (typeof name !== 'string' || !name.trim()) return null
  const key = cityKey(name)
  return country.cities.find(candidate => cityKey(candidate.name) === key) ?? null
}

/** Flag emoji from an ISO 3166-1 alpha-2 code ("JP" -> 🇯🇵); empty for anything else. */
export function countryFlagEmoji(code: string | null | undefined): string {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  return String.fromCodePoint(...[...normalized].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65))
}
