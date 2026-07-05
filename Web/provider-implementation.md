Yes, entirely TMDB. It's called **Networks** for TV and **Production Companies** for movies.

---

## The Two Endpoints

**Discover by Network (TV shows):**
```
GET /discover/tv?with_networks={networkId}
```

**Discover by Company (Movies):**
```
GET /discover/movie?with_companies={companyId}
```

The IDs you'd actually use for the providers you mentioned:

| Provider | Type | TMDB ID |
|---|---|---|
| HBO | Network | 49 |
| Netflix | Network | 213 |
| Disney+ | Network | 2739 |
| Apple TV+ | Network | 2552 |
| Amazon | Network | 1024 |
| Warner Bros | Company | 174 |
| Marvel Studios | Company | 420 |
| Pixar | Company | 3 |
| Lucasfilm (Star Wars) | Company | 1 |
| A24 | Company | 41077 |
| DreamWorks | Company | 521 |

---

## The Sub-Brand Structure

The "Disney has Marvel, Star Wars, Pixar" structure you see in apps isn't a TMDB feature — that's **manually curated** by the app. Disney+ as a network on TMDB just returns everything on Disney+. The sub-collections (Marvel Cinematic Universe, Star Wars, Pixar) come from TMDB **Collections** which is a separate endpoint:

```
GET /collection/{collectionId}
```

Key collection IDs:
| Collection | TMDB ID |
|---|---|
| Marvel Cinematic Universe | 131292 |
| Star Wars | 10 |
| Harry Potter | 1241 |
| The Lord of the Rings | 119 |
| Fast & Furious | 9485 |
| James Bond | 645 |
| Jurassic Park | 328 |

---

## How to Build the Full Feature

**Step 1 — The providers screen:**
```js
// Hardcode the top providers with their TMDB IDs and branding
const PROVIDERS = [
  {
    id: 'hbo',
    name: 'HBO',
    networkId: 49,
    color: '#000000',
    logo: '/logos/hbo.png',
    subBrands: [
      { name: 'HBO Original', companyId: 3268 },
      { name: 'Warner Bros', companyId: 174 },
      { name: 'Harry Potter', collectionId: 1241 }
    ]
  },
  {
    id: 'disney',
    name: 'Disney+',
    networkId: 2739,
    color: '#113CCF',
    logo: '/logos/disney.png',
    subBrands: [
      { name: 'Marvel', companyId: 420 },
      { name: 'Star Wars', collectionId: 10 },
      { name: 'Pixar', companyId: 3 },
      { name: 'National Geographic', networkId: 2081 }
    ]
  },
  {
    id: 'netflix',
    name: 'Netflix',
    networkId: 213,
    color: '#E50914',
    logo: '/logos/netflix.png',
    subBrands: [
      { name: 'Netflix Original', companyId: 126929 },
      { name: 'Anime', genreId: 16 },
      { name: 'Stand-up', genreId: 35 }
    ]
  }
]
```

**Step 2 — Fetching content per provider or sub-brand:**
```js
const fetchProviderContent = async ({ networkId, companyId, collectionId, genreId }) => {
  // Collection is a different endpoint entirely
  if (collectionId) {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${KEY}`
    )
    const { parts } = await res.json()
    return parts.sort((a, b) => b.popularity - a.popularity)
  }

  // Everything else uses discover
  const params = new URLSearchParams({
    api_key: KEY,
    sort_by: 'popularity.desc',
    ...(networkId && { with_networks: networkId }),
    ...(companyId && { with_companies: companyId }),
    ...(genreId && { with_genres: genreId })
  })

  const type = networkId ? 'tv' : 'movie'
  const res = await fetch(
    `https://api.themoviedb.org/3/discover/${type}?${params}`
  )
  const { results } = await res.json()
  return results
}
```

**Step 3 — The UI pattern:**
```jsx
// Provider detail page
export default function ProviderPage({ provider }) {
  const [activeSubBrand, setActiveSubBrand] = useState(null)
  const [content, setContent] = useState([])

  useEffect(() => {
    const target = activeSubBrand ?? { networkId: provider.networkId }
    fetchProviderContent(target).then(setContent)
  }, [activeSubBrand, provider])

  return (
    <div>
      {/* Sub-brand pills */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        <button
          onClick={() => setActiveSubBrand(null)}
          className={!activeSubBrand ? 'bg-white text-black' : 'text-white border border-white/30'}
        >
          All
        </button>
        {provider.subBrands.map(sub => (
          <button
            key={sub.name}
            onClick={() => setActiveSubBrand(sub)}
            className={activeSubBrand?.name === sub.name ? 'bg-white text-black' : 'text-white border border-white/30'}
          >
            {sub.name}
          </button>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-3 gap-2 px-4">
        {content.map(item => (
          <MovieCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
```

---

## One Nuance Worth Knowing

TMDB's network/company data reflects what's in their database, not what's currently available to stream. A Warner Bros movie might not be on HBO Max right now — it could be on Netflix. If you want **actual current streaming availability** (what's actually on which platform today), that's a different API called **JustWatch**, which TMDB integrates with:

```
GET /movie/{id}/watch/providers
```

Returns exactly which platforms have the film right now, by country. Nigerian availability is limited but it's the accurate data if you need it.

For the provider/studio browsing feature you described though — purely based on studio identity, not current streaming rights — the network and company IDs are all you need.