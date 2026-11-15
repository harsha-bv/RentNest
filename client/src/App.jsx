import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const SERVER_ROOT = API_BASE.startsWith('http') ? API_BASE.replace(/\/api\/?$/, '') : ''
const TOKEN_KEY = 'rentnest-token'
const USER_KEY = 'rentnest-user'
const formatRent = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0)
const formatAvailability = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  : value || 'Availability on request'

const sampleHomes = [
  {
    id: 'sample-1',
    title: 'Sunlit 1 BHK near Indiranagar Metro',
    description: 'A thoughtfully designed home with warm natural light, a quiet work nook, and cafés and metro access just around the corner.',
    city: 'Indiranagar, Bengaluru',
    address: '12th Main Road, Indiranagar',
    rent: 28000,
    deposit: 56000,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'Apartment',
    availableFrom: 'Available now',
    amenities: ['Lift', 'Balcony', 'Pet friendly'],
    media: [{ url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Jamie Rivera',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=12th+Main+Road+Indiranagar+Bengaluru',
    featured: true,
  },
  {
    id: 'sample-2',
    title: 'A garden home in Koramangala',
    description: 'A bright, character-filled home with a private garden, a renovated kitchen, and an easy commute to central Bengaluru.',
    city: 'Koramangala, Bengaluru',
    address: '5th Block, Koramangala',
    rent: 48000,
    deposit: 96000,
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'House',
    availableFrom: 'Available now',
    amenities: ['Private garden', 'Parking', 'Power backup'],
    media: [{ url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Alex Morgan',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=5th+Block+Koramangala+Bengaluru',
  },
  {
    id: 'sample-3',
    title: 'Quiet 2 BHK close to Whitefield tech parks',
    description: 'An airy, freshly updated apartment with leafy views, gated security, and easy access to Whitefield offices and transit.',
    city: 'Whitefield, Bengaluru',
    address: 'Near ITPL Main Road, Whitefield',
    rent: 36000,
    deposit: 72000,
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'Apartment',
    availableFrom: 'Dec 1',
    amenities: ['Lift', 'Park nearby', 'Power backup'],
    media: [{ url: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Taylor Chen',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=ITPL+Main+Road+Whitefield+Bengaluru',
  },
  {
    id: 'sample-4',
    title: 'A bright apartment in Jayanagar 4th Block',
    description: 'A well-kept apartment with generous windows, a flexible layout, and markets, parks, and the metro nearby.',
    city: 'Jayanagar, Bengaluru',
    address: '4th Block, Jayanagar',
    rent: 32000,
    deposit: 64000,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'Apartment',
    availableFrom: 'Dec 15',
    amenities: ['Balcony', 'Bike parking', 'Pet friendly'],
    media: [{ url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Jordan Lee',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=4th+Block+Jayanagar+Bengaluru',
  },
  {
    id: 'sample-5',
    title: 'Room to breathe in HSR Layout',
    description: 'A comfortable family home with a generous living room, a sunny balcony, and quick access to parks and local shops.',
    city: 'HSR Layout, Bengaluru',
    address: 'Sector 2, HSR Layout',
    rent: 52000,
    deposit: 104000,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Townhouse',
    availableFrom: 'Available now',
    amenities: ['Balcony', 'Covered parking', 'Transit nearby'],
    media: [{ url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Sam Patel',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=Sector+2+HSR+Layout+Bengaluru',
  },
  {
    id: 'sample-6',
    title: 'A peaceful 2 BHK near Hebbal Lake',
    description: 'A bright home with smart storage, a full kitchen, and a little more quiet at the end of the day.',
    city: 'Hebbal, Bengaluru',
    address: 'Near Hebbal Lake, Hebbal',
    rent: 42000,
    deposit: 84000,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'Apartment',
    availableFrom: 'Jan 1',
    amenities: ['Storage', 'Lift', 'Laundry'],
    media: [{ url: 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=85', type: 'image' }],
    ownerName: 'Riley Kim',
    mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=Hebbal+Lake+Bengaluru',
  },
]

const categories = ['All homes', 'Apartments', 'Houses', 'Rooms', 'Pet friendly']

function mediaUrl(url) {
  return url?.startsWith('/uploads/') ? `${SERVER_ROOT}${url}` : url
}

function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    bed: <><path d="M3 19v-8h18v8M3 16h18M5 11V7h5v4M10 11V8h7a4 4 0 0 1 4 4" /><path d="M5 19v2m14-2v2" /></>,
    bath: <><path d="M9 6 7.5 4.5a2.1 2.1 0 0 0-3 3L6 9m-3 2h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2Zm3 8v2m10-2v2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    play: <><path d="m8 5 12 7-12 7z" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function App() {
  const [listings, setListings] = useState(sampleHomes)
  const [apiReady, setApiReady] = useState(false)
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [maxRent, setMaxRent] = useState('')
  const [category, setCategory] = useState('All homes')
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rentnest-favorites') || '[]')
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })
  const [showFavorites, setShowFavorites] = useState(false)
  const [selectedHome, setSelectedHome] = useState(null)
  const [modal, setModal] = useState('')
  const [authMode, setAuthMode] = useState('register')
  const [inquiries, setInquiries] = useState([])
  const [pendingUser, setPendingUser] = useState(null)
  const [verification, setVerification] = useState({ email: false, phone: false })
  const [liveConnected, setLiveConnected] = useState(false)
  const [unreadInquiries, setUnreadInquiries] = useState(0)
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/listings`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load listings')
        return response.json()
      })
      .then((data) => {
        if (Array.isArray(data.listings)) setListings(data.listings.map((item) => ({ ...item, id: item._id || item.id })))
        setApiReady(true)
      })
      .catch(() => setApiReady(false))
  }, [])

  useEffect(() => {
    const socket = io(SERVER_ROOT || window.location.origin, {
      path: '/socket.io',
      auth: token ? { token } : {},
    })
    const updateListing = (listing) => {
      const updated = { ...listing, id: listing._id || listing.id }
      setListings((current) => {
        if (updated.status === 'rented') return current.filter((home) => home.id !== updated.id)
        const existingIndex = current.findIndex((home) => home.id === updated.id)
        if (existingIndex < 0) return [updated, ...current]
        return current.map((home) => home.id === updated.id ? updated : home)
      })
      setApiReady(true)
    }
    socket.on('connect', () => setLiveConnected(true))
    socket.on('disconnect', () => setLiveConnected(false))
    socket.on('listing:created', updateListing)
    socket.on('listing:updated', updateListing)
    socket.on('inquiry:created', (inquiry) => {
      setInquiries((current) => [inquiry, ...current.filter((item) => item.id !== inquiry.id)])
      setUnreadInquiries((current) => current + 1)
      setToast(`New message from ${inquiry.renter?.name || 'a renter'}.`)
    })
    return () => socket.disconnect()
  }, [token])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const visibleHomes = useMemo(() => listings.filter((home) => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || `${home.title} ${home.description} ${home.city} ${home.address}`.toLowerCase().includes(query)
    const matchesCity = !city || `${home.city} ${home.address}`.toLowerCase().includes(city.toLowerCase())
    const matchesPrice = !maxRent || Number(home.rent) <= Number(maxRent)
    const type = (home.propertyType || '').toLowerCase()
    const matchesCategory = category === 'All homes'
      || (category === 'Apartments' && type.includes('apartment'))
      || (category === 'Houses' && ['house', 'townhouse'].some((word) => type.includes(word)))
      || (category === 'Rooms' && type.includes('room'))
      || (category === 'Pet friendly' && (home.amenities || []).some((amenity) => amenity.toLowerCase().includes('pet')))
    return matchesText && matchesCity && matchesPrice && matchesCategory && (!showFavorites || favorites.includes(home.id))
  }), [listings, search, city, maxRent, category, showFavorites, favorites])

  function toggleFavorite(homeId) {
    const updated = favorites.includes(homeId) ? favorites.filter((id) => id !== homeId) : [...favorites, homeId]
    setFavorites(updated)
    localStorage.setItem('rentnest-favorites', JSON.stringify(updated))
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
    setToast('You have been signed out.')
  }

  async function submitAuth(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/${values.mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.name, email: values.email, phone: values.phone, password: values.password, role: values.role }),
      })
      const data = await response.json()
      if (data.verificationRequired && data.user) {
        setPendingUser(data.user)
        setVerification({ email: Boolean(data.user.emailVerified), phone: Boolean(data.user.phoneVerified) })
        setModal('verification')
        setToast(data.message || 'Verify your email and phone to continue.')
        return
      }
      if (!response.ok) throw new Error(data.message || 'Could not sign in.')
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
      setModal('')
      setToast(`Welcome${data.user.name ? `, ${data.user.name.split(' ')[0]}` : ''}!`)
    } catch (error) {
      setToast(error.message || 'Could not connect to RentNest. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitVerification(event, channel) {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/verify-${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, phone: pendingUser.phone, code }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || `Could not verify ${channel}.`)
      setPendingUser(data.user)
      setVerification((current) => ({ ...current, [channel]: true }))
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token)
        localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        setPendingUser(null)
        setModal('')
        setToast(`Welcome${data.user.name ? `, ${data.user.name.split(' ')[0]}` : ''}! Your account is verified.`)
      } else {
        setToast(`${channel === 'email' ? 'Email' : 'Phone'} verified. Verify the other method to activate your account.`)
      }
    } catch (error) {
      setToast(error.message || `Could not verify ${channel}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  async function startPhoneVerification(event) {
    event.preventDefault()
    const phone = new FormData(event.currentTarget).get('phone')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/start-phone-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, phone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not send an SMS code.')
      setPendingUser(data.user)
      setToast(data.message)
    } catch (error) {
      setToast(error.message || 'Could not send an SMS code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification(channel) {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, channel }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || `Could not resend the ${channel} code.`)
      setToast(data.message)
    } catch (error) {
      setToast(error.message || `Could not resend the ${channel} code.`)
    } finally {
      setLoading(false)
    }
  }

  async function submitListing(event) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('amenities', JSON.stringify(String(formData.get('amenities') || '').split(',').map((item) => item.trim()).filter(Boolean)))
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/listings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not publish your home.')
      const newHome = { ...data.listing, id: data.listing._id || data.listing.id }
      setListings((current) => [newHome, ...current])
      setApiReady(true)
      setModal('')
      setToast('Your home is live on RentNest.')
      form.reset()
    } catch (error) {
      setToast(error.message || 'Could not connect to RentNest. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitInquiry(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/inquiries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: selectedHome.id,
          message: formData.get('message'),
          moveInDate: formData.get('moveInDate'),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not send your message.')
      setModal('')
      setToast('Your message was sent directly to the owner.')
    } catch (error) {
      setToast(error.message || 'Could not connect to RentNest. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function openInbox() {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/inquiries/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load your inbox.')
      setInquiries(data.inquiries || [])
      setUnreadInquiries(0)
      setModal('inbox')
    } catch (error) {
      setToast(error.message || 'Could not connect to RentNest. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function startInquiry(home) {
    setSelectedHome(home)
    if (!token) {
      setAuthMode('login')
      setModal('auth')
      return
    }
    setModal('inquiry')
  }

  function startListing() {
    if (!token) {
      setAuthMode('register')
      setModal('auth')
      return
    }
    if (user?.role !== 'owner') {
      setToast('Create an owner account to list your home.')
      setAuthMode('register')
      setModal('auth')
      return
    }
    setModal('listing')
  }

  function HomeCard({ home }) {
    const image = home.media?.find((item) => item.type === 'image') || home.media?.[0]
    return (
      <article className="home-card">
        <button className="card-image-button" type="button" onClick={() => setSelectedHome(home)} aria-label={`View ${home.title}`}>
          {image ? <img className="card-image" src={mediaUrl(image.url)} alt={home.title} /> : <div className="image-placeholder"><Icon name="home" size={40} /></div>}
          {home.featured && <span className="featured-pill">A little extra special</span>}
          {home.media?.some((item) => item.type === 'video') && <span className="video-pill"><Icon name="play" size={12} /> Video tour</span>}
        </button>
        <button className={`favorite-button ${favorites.includes(home.id) ? 'is-favorite' : ''}`} onClick={() => toggleFavorite(home.id)} type="button" aria-label={favorites.includes(home.id) ? 'Remove from saved homes' : 'Save home'}>
          <Icon name="heart" size={19} />
        </button>
        <button className="card-copy" type="button" onClick={() => setSelectedHome(home)}>
          <span className="card-location"><Icon name="pin" size={14} /> {home.city}</span>
          <span className="card-title">{home.title}</span>
          <span className="card-facts">{home.bedrooms} bed <span>·</span> {home.bathrooms} bath <span>·</span> {home.propertyType}</span>
          <span className="card-price"><strong>{formatRent(home.rent)}</strong> <span>/ month</span></span>
          <span className="card-available">{formatAvailability(home.availableFrom)}</span>
        </button>
      </article>
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" onClick={() => { setShowFavorites(false); setCategory('All homes') }} aria-label="RentNest home">
          <span className="brand-mark"><Icon name="home" size={19} /></span>
          <span>rentnest<span className="brand-dot">.</span></span>
        </a>
        <nav className="header-links" aria-label="Main navigation">
          <button type="button" className={`nav-link ${!showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(false)}>Find a home</button>
          <button type="button" className="nav-link" onClick={startListing}>List your place</button>
        </nav>
        <div className="header-actions">
          <button className={`saved-link ${showFavorites ? 'active' : ''}`} type="button" onClick={() => setShowFavorites(!showFavorites)}><Icon name="heart" size={17} /> Saved <span className="saved-count">{favorites.length}</span></button>
          {user ? <>{user.role === 'owner' && <button className="nav-link inbox-link" type="button" onClick={openInbox}>Inbox {unreadInquiries > 0 && <span className="saved-count">{unreadInquiries}</span>}</button>}<button className="account-button" type="button" onClick={signOut}><span className="avatar">{user.name?.[0]?.toUpperCase() || 'R'}</span><span className="account-name">{user.name?.split(' ')[0] || 'Account'}</span></button></> : <button className="sign-in-button" type="button" onClick={() => { setAuthMode('login'); setModal('auth') }}>Sign in <Icon name="arrow" size={16} /></button>}
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> A better way to find home</span>
            <h1>Find a place<br />that feels like <em>you.</em></h1>
            <p className="hero-description">Thoughtful homes, honest details, and a direct line to the people who live there.</p>
            <form className="search-panel" onSubmit={(event) => event.preventDefault()}>
              <label className="search-field search-place"><span>Where to?</span><span className="search-input-wrap"><Icon name="pin" size={17} /><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Bengaluru neighborhood" /></span></label>
              <label className="search-field search-what"><span>What are you looking for?</span><span className="search-input-wrap"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try “sunny apartment”" /></span></label>
              <label className="search-field search-budget"><span>Monthly budget</span><span className="search-input-wrap"><span className="dollar-sign">₹</span><input type="number" min="0" value={maxRent} onChange={(event) => setMaxRent(event.target.value)} placeholder="Any price" /></span></label>
              <button className="search-submit" type="submit"><Icon name="search" size={19} /><span>Find a home</span></button>
            </form>
            <div className="hero-note"><span className="note-avatars"><i>J</i><i>A</i><i>M</i></span><span><strong>Real people. Real homes.</strong> No endless scrolling through listings that aren’t there.</span></div>
          </div>
          <div className="hero-art">
            <div className="hero-photo-wrap"><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1300&q=90" alt="Sunlit living room in a welcoming home" /></div>
            <div className="photo-tag"><span className="tag-spark">✳</span><span><strong>Made for living</strong><small>Homes with a little heart</small></span></div>
            <div className="photo-caption"><span className="caption-dot" /> Handpicked homes across Bengaluru</div>
            <div className="hero-orbit" aria-hidden="true">FIND YOUR<br />PLACE TO LAND</div>
          </div>
        </section>

        <section className="trust-strip" aria-label="RentNest values">
          <div><span className="trust-icon">✳</span><span><strong>Owner-direct</strong><small>Talk to a real person</small></span></div>
          <div><span className="trust-icon">⌂</span><span><strong>Honest details</strong><small>Know what you’re getting</small></span></div>
          <div><span className="trust-icon">♡</span><span><strong>Find your fit</strong><small>Spaces for real life</small></span></div>
          <div><span className="trust-quote">“</span><span><strong>Less searching. More settling in.</strong><small>The home-finding experience you deserve</small></span></div>
        </section>

        <section className="homes-section" id="homes">
          <div className="section-heading">
            <div><span className="eyebrow"><span className="eyebrow-line" /> {showFavorites ? 'Your shortlist' : 'A good place to start'}</span><h2>{showFavorites ? 'Homes you’ve saved' : 'Places with a little more <em>feeling.</em>'}</h2><p>{showFavorites ? 'All your lovely finds, right here.' : 'Thoughtfully shared by people who care about where you live.'}</p></div>
            <button type="button" className="text-link" onClick={startListing}>Have a home to share? <Icon name="arrow" size={16} /></button>
          </div>
          <div className="category-row">
            <div className="category-tabs" role="tablist" aria-label="Home type">
              {categories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} className={`category-tab ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <span className="results-count">{visibleHomes.length} lovely {visibleHomes.length === 1 ? 'home' : 'homes'}</span>
          </div>
          {visibleHomes.length ? <div className="homes-grid">{visibleHomes.map((home) => <HomeCard key={home.id} home={home} />)}</div> : <div className="empty-state"><span className="empty-heart">♡</span><h3>No homes found just yet</h3><p>Try changing a filter, or save this search for later.</p><button className="outline-button" type="button" onClick={() => { setSearch(''); setCity(''); setMaxRent(''); setCategory('All homes'); setShowFavorites(false) }}>Clear filters</button></div>}
          {!apiReady && <p className="preview-note">You’re exploring sample Bengaluru homes. Connect the RentNest server for live listings.</p>}
          {apiReady && <p className={`live-note ${liveConnected ? 'is-live' : ''}`}><span /> {liveConnected ? 'Live Bengaluru listings' : 'Bengaluru listings'}</p>}
        </section>

        <section className="owner-banner">
          <div className="owner-mark"><Icon name="home" size={24} /></div>
          <div><span className="eyebrow">For the people with keys</span><h2>Your home deserves<br />the <em>right</em> person.</h2><p>Share the details, add a video tour, and connect with renters directly. No middleman energy.</p><button className="banner-button" type="button" onClick={startListing}>Share your home <Icon name="arrow" size={17} /></button></div>
          <div className="owner-visual"><img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1100&q=85" alt="A warm, sunlit home ready for its next renter" /><div className="visual-note">A place for your next chapter <span>↗</span></div></div>
        </section>
      </main>

      <footer className="site-footer"><a className="brand" href="#"><span className="brand-mark"><Icon name="home" size={17} /></span><span>rentnest<span className="brand-dot">.</span></span></a><span>Good homes. Good people. Better beginnings.</span><span>© {new Date().getFullYear()} RentNest</span></footer>

      {selectedHome && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedHome(null) }}><section className="modal home-modal" role="dialog" aria-modal="true" aria-labelledby="home-modal-title">
        <button className="modal-close" type="button" onClick={() => { setSelectedHome(null); setModal('') }} aria-label="Close"><Icon name="close" /></button>
        <div className="detail-media">{selectedHome.media?.map((item, index) => item.type === 'video' ? <video key={item.url} controls src={mediaUrl(item.url)} aria-label={`${selectedHome.title} video tour`} /> : <img key={item.url} src={mediaUrl(item.url)} alt={`${selectedHome.title} view ${index + 1}`} />)}</div>
        <div className="detail-content">
          <span className="card-location"><Icon name="pin" size={15} /> {selectedHome.city} · {selectedHome.address}</span>
          <h2 id="home-modal-title">{selectedHome.title}</h2>
          <p className="detail-price"><strong>{formatRent(selectedHome.rent)}</strong> / month <span>· Deposit {formatRent(selectedHome.deposit || 0)}</span></p>
          <div className="detail-facts"><span><Icon name="bed" /> {selectedHome.bedrooms} {selectedHome.bedrooms === 1 ? 'bedroom' : 'bedrooms'}</span><span><Icon name="bath" /> {selectedHome.bathrooms} {selectedHome.bathrooms === 1 ? 'bathroom' : 'bathrooms'}</span><span><Icon name="home" /> {selectedHome.propertyType}</span></div>
          <p className="detail-description">{selectedHome.description}</p>
          <div className="amenities">{(selectedHome.amenities || []).map((amenity) => <span key={amenity}>{amenity}</span>)}</div>
          <div className="detail-map"><iframe title={`Google Map for ${selectedHome.title}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${encodeURIComponent(`${selectedHome.address || ''}, ${selectedHome.city || 'Bengaluru'}`)}&output=embed`} /></div>
          <div className="detail-owner"><span className="avatar">{selectedHome.ownerName?.[0]?.toUpperCase() || 'O'}</span><span><strong>Shared by {selectedHome.ownerName || 'a local owner'}</strong><small>{formatAvailability(selectedHome.availableFrom)}</small></span></div>
          <div className="detail-actions"><button type="button" className="primary-button" onClick={() => startInquiry(selectedHome)}>Message the owner <Icon name="arrow" size={17} /></button><a className="outline-button" href={selectedHome.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selectedHome.address || ''} ${selectedHome.city || 'Bengaluru'}`)}`} target="_blank" rel="noreferrer"><Icon name="pin" size={16} /> Get directions</a></div>
        </div>
      </section></div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal('') }}><section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
        <button className="modal-close" type="button" onClick={() => setModal('')} aria-label="Close"><Icon name="close" /></button>
        {modal === 'auth' && <><span className="eyebrow"><span className="eyebrow-line" /> A little closer to home</span><h2 id="form-modal-title">{authMode === 'login' ? <>Welcome <em>back.</em></> : <>Come on <em>in.</em></>}</h2><p className="form-intro">Create an account to find a Bengaluru home, contact owners, or share a place of your own.</p><form className="stacked-form" onSubmit={submitAuth}>
          {authMode === 'register' && <label>I'm here as<select name="role" defaultValue="renter"><option value="renter">A renter, looking for a place</option><option value="owner">An owner, sharing a place</option></select></label>}
          {authMode === 'register' && <label>Your name<input name="name" minLength="2" maxLength="80" autoComplete="name" placeholder="How should we call you?" required /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" maxLength="254" placeholder="you@example.com" required /></label>
          {authMode === 'register' && <label>Indian mobile number<input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength="18" placeholder="+91 98765 43210" required /></label>}
          <label>Password<input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="8" maxLength="72" placeholder="At least 8 characters" required /></label>
          <input type="hidden" name="mode" value={authMode} />
          <button className="primary-button full-button" type="submit" disabled={loading}>{loading ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create your free account'} <Icon name="arrow" size={17} /></button>
        </form><p className="auth-switch">{authMode === 'login' ? 'New to RentNest?' : 'Already have an account?'} <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Create an account' : 'Sign in'}</button></p></>}
        {modal === 'verification' && pendingUser && <><span className="eyebrow"><span className="eyebrow-line" /> Secure your RentNest account</span><h2 id="form-modal-title">Verify your <em>details.</em></h2><p className="form-intro">Enter the 6-digit codes we sent to {pendingUser.email} and your Indian mobile number. Both are required before you can sign in.</p>
          <div className="verification-list">
            {verification.email ? <p className="verified-message">✓ Email verified</p> : <form className="verification-form" onSubmit={(event) => submitVerification(event, 'email')}><label>Email code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit code" required /></label><div className="verification-actions"><button className="primary-button" type="submit" disabled={loading}>Verify email</button><button className="resend-button" type="button" disabled={loading} onClick={() => resendVerification('email')}>Resend code</button></div></form>}
            {!pendingUser.phone ? <form className="verification-form" onSubmit={startPhoneVerification}><label>Add an Indian mobile number<input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength="18" placeholder="+91 98765 43210" required /></label><button className="primary-button" type="submit" disabled={loading || !verification.email}>Send SMS code</button>{!verification.email && <small className="verification-hint">Verify your email before adding a phone number.</small>}</form> : verification.phone ? <p className="verified-message">✓ Phone verified: {pendingUser.phone}</p> : <form className="verification-form" onSubmit={(event) => submitVerification(event, 'phone')}><label>SMS code sent to {pendingUser.phone}<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit code" required /></label><div className="verification-actions"><button className="primary-button" type="submit" disabled={loading}>Verify phone</button><button className="resend-button" type="button" disabled={loading} onClick={() => resendVerification('phone')}>Resend SMS</button></div></form>}
          </div>
        </>}
        {modal === 'listing' && <><span className="eyebrow"><span className="eyebrow-line" /> Good homes find good people</span><h2 id="form-modal-title">Share your <em>place.</em></h2><p className="form-intro">Add the details renters care about. You can upload up to 10 photos or videos.</p><form className="stacked-form listing-form" onSubmit={submitListing}>
          <label>Listing title<input name="title" minLength="8" maxLength="100" required placeholder="A bright, quiet home near the park" /></label>
          <label>Tell us about it<textarea name="description" rows="3" minLength="30" maxLength="2000" required placeholder="What makes this place feel like home?" /></label>
          <div className="form-grid"><label>Bengaluru neighborhood<select name="city" required defaultValue="Indiranagar, Bengaluru"><option>Indiranagar, Bengaluru</option><option>Koramangala, Bengaluru</option><option>Whitefield, Bengaluru</option><option>Jayanagar, Bengaluru</option><option>HSR Layout, Bengaluru</option><option>Hebbal, Bengaluru</option><option>Marathahalli, Bengaluru</option><option>Electronic City, Bengaluru</option><option>JP Nagar, Bengaluru</option><option>Bellandur, Bengaluru</option><option>Other Bengaluru</option></select></label><label>Street / area<input name="address" required maxLength="180" placeholder="12th Main Road" /></label></div>
          <div className="form-grid"><label>Monthly rent (₹)<input name="rent" type="number" min="1" max="1000000" required placeholder="28000" /></label><label>Security deposit (₹)<input name="deposit" type="number" min="0" max="1000000" required placeholder="56000" /></label></div>
          <div className="form-grid"><label>Bedrooms<input name="bedrooms" type="number" min="0" max="50" required /></label><label>Bathrooms<input name="bathrooms" type="number" min="1" max="50" step="0.5" required /></label></div>
          <div className="form-grid"><label>Home type<select name="propertyType"><option>Apartment</option><option>House</option><option>Room</option><option>Loft</option><option>Townhouse</option><option>Studio</option></select></label><label>Available from<input name="availableFrom" type="date" required /></label></div>
          <label>Amenities <span className="field-hint">Separate with commas</span><input name="amenities" maxLength="500" placeholder="Pet friendly, laundry, balcony" /></label>
          <label>Photos & video tour <span className="field-hint">JPG, PNG, WebP, MP4, MOV · 25 MB max each</span><input name="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple /></label>
          <label>Google Maps directions link <span className="field-hint">Optional — a route is generated from your Bengaluru address if omitted</span><input name="mapUrl" type="url" maxLength="500" placeholder="https://www.google.com/maps/dir/…" /></label>
          <button className="primary-button full-button" type="submit" disabled={loading}>{loading ? 'Publishing…' : 'Publish your home'} <Icon name="arrow" size={17} /></button>
        </form></>}
        {modal === 'inquiry' && selectedHome && <><span className="eyebrow"><span className="eyebrow-line" /> Start a conversation</span><h2 id="form-modal-title">Say hello to <em>{selectedHome.ownerName?.split(' ')[0] || 'the owner'}.</em></h2><p className="form-intro">Ask about “{selectedHome.title}”. Your message goes straight to the owner.</p><form className="stacked-form" onSubmit={submitInquiry}><label>When are you hoping to move?<input name="moveInDate" type="date" /></label><label>Your message<textarea name="message" rows="5" minLength="10" maxLength="1500" required placeholder="Hi! I’d love to know more about this home…" /></label><button className="primary-button full-button" type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send message'} <Icon name="arrow" size={17} /></button></form></>}
        {modal === 'inbox' && <><span className="eyebrow"><span className="eyebrow-line" /> Your owner inbox</span><h2 id="form-modal-title">Good things <em>start here.</em></h2><p className="form-intro">Messages from renters interested in your homes.</p>{inquiries.length ? <div className="inbox-list">{inquiries.map((inquiry) => <article className="inbox-card" key={inquiry.id}><div className="inbox-card-heading"><strong>{inquiry.renter?.name || 'A renter'}</strong><span>{new Date(inquiry.createdAt).toLocaleDateString()}</span></div><p className="inbox-listing">{inquiry.listing?.title || 'Your home'} · {inquiry.listing?.city || ''}</p><p className="inbox-message">{inquiry.message}</p>{inquiry.moveInDate && <p className="inbox-move-date">Hoping to move: {inquiry.moveInDate}</p>}<a className="inbox-reply" href={`mailto:${encodeURIComponent(inquiry.renter?.email || '')}?subject=${encodeURIComponent(`RentNest: ${inquiry.listing?.title || 'Your inquiry'}`)}`}>Reply to {inquiry.renter?.name?.split(' ')[0] || 'renter'} <Icon name="arrow" size={15} /></a></article>)}</div> : <div className="empty-state inbox-empty"><span className="empty-heart">♡</span><h3>Your inbox is ready</h3><p>When renters reach out, their messages will show up here.</p></div>}</>}
      </section></div>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </div>
  )
}

export default App
