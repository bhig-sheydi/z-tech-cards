import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID

// Add validation
if (!ADMIN_USER_ID) {
  console.error('VITE_ADMIN_USER_ID not set in environment variables')
}

export const LinkPoolAdmin = () => {
  const [user, setUser] = useState(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  // Data states
  const [poolStats, setPoolStats] = useState({ 
    available: 0, 
    assigned: 0, 
    embedded: 0,
    total: 0 
  })
  const [recentAssignments, setRecentAssignments] = useState([])
  const [embeddedLinks, setEmbeddedLinks] = useState([])

  // Form states
  const [generateCount, setGenerateCount] = useState(100)
  const [generating, setGenerating] = useState(false)
  const [embedLinkCode, setEmbedLinkCode] = useState('')
  const [cardSerial, setCardSerial] = useState('')
  const [embedding, setEmbedding] = useState(false)

  // Filter states
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchCode, setSearchCode] = useState('')

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      setUser(session.user)
      setIsAuthorized(session.user.id === ADMIN_USER_ID)

      if (session.user.id === ADMIN_USER_ID) {
        loadAllData()
      }
    } catch (error) {
      console.error('Auth error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAllData = async () => {
    await Promise.all([
      loadPoolStats(),
      loadRecentAssignments(),
      loadEmbeddedLinks()
    ])
  }

  const loadPoolStats = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_link_pool_status')

      if (error) throw error

      const stats = { available: 0, assigned: 0, embedded: 0, total: 0 }
      data?.forEach(row => {
        stats[row.status] = row.count
        stats.total += row.count
      })
      setPoolStats(stats)
    } catch (error) {
      console.error('Stats error:', error)
    }
  }

  const loadRecentAssignments = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_assigned_links', { limit_count: 50 })

      if (error) throw error
      setRecentAssignments(data || [])
    } catch (error) {
      console.error('Assignments error:', error)
    }
  }

  const loadEmbeddedLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('link_pool')
        .select('*')
        .eq('status', 'embedded')
        .order('embedded_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setEmbeddedLinks(data || [])
    } catch (error) {
      console.error('Embedded error:', error)
    }
  }

  const handleGenerateLinks = async () => {
    if (generateCount < 1 || generateCount > 1000) {
      alert('Enter number between 1 and 1000')
      return
    }

    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('generate_link_pool', {
        count: generateCount
      })

      if (error) throw error
      alert(`Generated ${data} new links!`)
      loadPoolStats()
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleMarkEmbedded = async () => {
    if (!embedLinkCode.trim() || !cardSerial.trim()) {
      alert('Enter both link code and card serial')
      return
    }

    setEmbedding(true)
    try {
      const { data, error } = await supabase.rpc('mark_link_embedded', {
        p_link_code: embedLinkCode.trim(),
        p_card_serial: cardSerial.trim()
      })

      if (error) throw error

      alert(`✓ Link ${embedLinkCode} embedded to card ${cardSerial}`)
      setEmbedLinkCode('')
      setCardSerial('')
      loadAllData()
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setEmbedding(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'text-emerald-400'
      case 'assigned': return 'text-blue-400'
      case 'embedded': return 'text-purple-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusBg = (status) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/10 border-emerald-500/30'
      case 'assigned': return 'bg-blue-500/10 border-blue-500/30'
      case 'embedded': return 'bg-purple-500/10 border-purple-500/30'
      default: return 'bg-gray-500/10 border-gray-500/30'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Please log in</div>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Access Denied - Admin Only</div>
      </div>
    )
  }

  // Filter assignments
  const filteredAssignments = recentAssignments.filter(link => {
    const matchesStatus = filterStatus === 'all' || link.status === filterStatus
    const matchesSearch = !searchCode || link.link_code?.includes(searchCode.toUpperCase())
    return matchesStatus && matchesSearch
  })

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400 mb-2">Link Pool Admin</h1>
            <p className="text-gray-400">
              {user.user_metadata?.full_name || user.email} 
              <span className="text-emerald-500 ml-2">● Admin</span>
            </p>
          </div>
          <button
            onClick={loadAllData}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-xl p-5 border border-emerald-500/30">
            <p className="text-3xl font-bold text-emerald-400">{poolStats.available}</p>
            <p className="text-sm text-gray-400 mt-1">Available</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-500/30">
            <p className="text-3xl font-bold text-blue-400">{poolStats.assigned}</p>
            <p className="text-sm text-gray-400 mt-1">Assigned</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-purple-500/30">
            <p className="text-3xl font-bold text-purple-400">{poolStats.embedded}</p>
            <p className="text-sm text-gray-400 mt-1">Embedded</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-500/30">
            <p className="text-3xl font-bold text-white">{poolStats.total}</p>
            <p className="text-sm text-gray-400 mt-1">Total</p>
          </div>
        </div>

        {/* Generate Links */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-4">Generate New Links</h2>
          <div className="flex gap-4">
            <input
              type="number"
              min="1"
              max="1000"
              value={generateCount}
              onChange={(e) => setGenerateCount(parseInt(e.target.value) || 0)}
              className="flex-1 px-4 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              placeholder="Number of links..."
            />
            <button
              onClick={handleGenerateLinks}
              disabled={generating}
              className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Mark as Embedded */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-lg font-semibold text-purple-400 mb-4">Mark Link as Embedded</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={embedLinkCode}
              onChange={(e) => setEmbedLinkCode(e.target.value.toUpperCase())}
              placeholder="Link Code (ABC12345)"
              className="px-4 py-2 bg-gray-950 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
            <input
              type="text"
              value={cardSerial}
              onChange={(e) => setCardSerial(e.target.value.toUpperCase())}
              placeholder="Card Serial (NFC001)"
              className="px-4 py-2 bg-gray-950 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleMarkEmbedded}
              disabled={embedding}
              className="px-6 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg transition-all disabled:opacity-50"
            >
              {embedding ? 'Marking...' : 'Mark Embedded'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            This marks a link as physically embedded to a specific NFC card
          </p>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex gap-2">
              {['all', 'assigned', 'embedded'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filterStatus === status 
                      ? getStatusBg(status) + ' ' + getStatusColor(status)
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Search link code..."
              className="flex-1 min-w-[200px] px-4 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Recent Assignments Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Recent Assignments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Link Code</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Card Serial</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Order ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Card Type</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Assigned At</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Embedded At</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((link) => (
                  <tr key={link.link_code} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      {link.link_code}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBg(link.status)} ${getStatusColor(link.status)}`}>
                        {link.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-300">
                      {link.embedded_card_serial || link.assigned_card_serial || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                      {link.assigned_to_order_id?.slice(0, 8)}...
                    </td>
                    <td className="py-3 px-4 capitalize text-gray-300">{link.card_type}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(link.assigned_at)}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(link.embedded_at)}</td>
                  </tr>
                ))}
                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500">
                      No links found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Embedded Links Grid */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-purple-400 mb-4">
            Recently Embedded to Cards
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {embeddedLinks.map((link) => (
              <div 
                key={link.id}
                className="bg-gray-950 border border-purple-500/30 rounded-lg p-3"
              >
                <p className="font-mono text-purple-400 text-sm font-bold">{link.link_code}</p>
                <p className="text-xs text-gray-500 mt-1">→ {link.card_serial}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatDate(link.embedded_at)}
                </p>
              </div>
            ))}
            {embeddedLinks.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500">
                No embedded links yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}