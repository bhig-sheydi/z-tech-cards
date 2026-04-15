import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID

// Add validation
if (!ADMIN_USER_ID) {
  console.error('VITE_ADMIN_USER_ID not set in environment variables')
}

export const NFCInventoryAdmin = () => {
  const [user, setUser] = useState(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  // Data states
  const [inventory, setInventory] = useState([])
  const [inventoryStats, setInventoryStats] = useState({
    unassigned: 0,
    assigned: 0,
    active: 0,
    disabled: 0,
    lost: 0,
    total: 0
  })

  // Form states
  const [serialInput, setSerialInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [prefix, setPrefix] = useState('NFC')
  const [startNumber, setStartNumber] = useState(1)
  const [count, setCount] = useState(10)

  // Filter states
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchSerial, setSearchSerial] = useState('')

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
        loadInventory()
      }
    } catch (error) {
      console.error('Auth error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadInventory = async () => {
    try {
      let query = supabase
        .from('nfc_cards')
        .select('*')
        .order('created_at', { ascending: false })

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus)
      }

      if (searchSerial) {
        query = query.ilike('card_serial', `%${searchSerial}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setInventory(data || [])

      // Calculate stats
      const stats = {
        unassigned: 0, assigned: 0, active: 0,
        disabled: 0, lost: 0, total: data?.length || 0
      }
      data?.forEach(card => {
        if (stats[card.status] !== undefined) {
          stats[card.status]++
        }
      })
      setInventoryStats(stats)

    } catch (error) {
      console.error('Load inventory error:', error)
      alert('Error loading inventory: ' + error.message)
    }
  }

  const handleAddSingle = async () => {
    const serial = serialInput.trim().toUpperCase()
    if (!serial) {
      alert('Please enter a serial number')
      return
    }

    setAdding(true)
    try {
      const { data, error } = await supabase
        .from('nfc_cards')
        .insert({ card_serial: serial, status: 'unassigned' })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          alert(`Card ${serial} already exists!`)
        } else {
          throw error
        }
      } else {
        alert(`✓ Added card ${serial}`)
        setSerialInput('')
        loadInventory()
      }
    } catch (error) {
      alert('Error adding card: ' + error.message)
    } finally {
      setAdding(false)
    }
  }

  const handleAddBulk = async () => {
    if (!prefix.trim()) {
      alert('Please enter a prefix')
      return
    }
    if (startNumber < 1 || count < 1 || count > 100) {
      alert('Start number must be ≥1 and count must be between 1-100')
      return
    }

    setAdding(true)
    const serials = []
    for (let i = 0; i < count; i++) {
      const num = startNumber + i
      const paddedNum = num.toString().padStart(3, '0')
      serials.push(`${prefix.trim().toUpperCase()}${paddedNum}`)
    }

    try {
      // Insert all cards
      const { data, error } = await supabase
        .from('nfc_cards')
        .insert(serials.map(serial => ({
          card_serial: serial,
          status: 'unassigned'
        })))
        .select()

      if (error) {
        if (error.code === '23505') {
          // Some duplicates - try one by one
          let added = 0
          let duplicates = 0
          for (const serial of serials) {
            try {
              await supabase
                .from('nfc_cards')
                .insert({ card_serial: serial, status: 'unassigned' })
              added++
            } catch (e) {
              if (e.code === '23505') duplicates++
            }
          }
          alert(`Added ${added} cards, ${duplicates} duplicates skipped`)
        } else {
          throw error
        }
      } else {
        alert(`✓ Added ${data.length} cards successfully`)
      }

      setStartNumber(startNumber + count)
      loadInventory()
    } catch (error) {
      alert('Error adding cards: ' + error.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteCard = async (id, serial) => {
    if (!confirm(`Delete card ${serial}? This cannot be undone.`)) return

    try {
      const { error } = await supabase
        .from('nfc_cards')
        .delete()
        .eq('id', id)

      if (error) throw error
      alert(`Deleted ${serial}`)
      loadInventory()
    } catch (error) {
      alert('Error deleting: ' + error.message)
    }
  }

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('nfc_cards')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error
      loadInventory()
    } catch (error) {
      alert('Error updating status: ' + error.message)
    }
  }

  const handleImportFromText = async () => {
    const text = prompt('Paste serial numbers (one per line or comma-separated):')
    if (!text) return

    const serials = text
      .split(/[\n,]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0)

    if (serials.length === 0) {
      alert('No valid serial numbers found')
      return
    }

    if (serials.length > 500) {
      alert('Maximum 500 cards at once')
      return
    }

    if (!confirm(`Import ${serials.length} cards?`)) return

    setAdding(true)
    try {
      // Try bulk insert first
      const { data, error } = await supabase
        .from('nfc_cards')
        .insert(serials.map(serial => ({
          card_serial: serial,
          status: 'unassigned'
        })))

      if (error && error.code === '23505') {
        // Handle duplicates one by one
        let added = 0
        let duplicates = 0
        for (const serial of serials) {
          const { error: insertError } = await supabase
            .from('nfc_cards')
            .insert({ card_serial: serial, status: 'unassigned' })
          if (insertError && insertError.code === '23505') {
            duplicates++
          } else {
            added++
          }
        }
        alert(`Added ${added} cards, ${duplicates} duplicates skipped`)
      } else if (error) {
        throw error
      } else {
        alert(`✓ Added ${serials.length} cards`)
      }

      loadInventory()
    } catch (error) {
      alert('Error importing: ' + error.message)
    } finally {
      setAdding(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'unassigned': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      case 'assigned': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
      case 'active': return 'text-purple-400 bg-purple-500/10 border-purple-500/30'
      case 'disabled': return 'text-red-400 bg-red-500/10 border-red-500/30'
      case 'lost': return 'text-gray-400 bg-gray-500/10 border-gray-500/30'
      default: return 'text-gray-400 bg-gray-500/10'
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
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

  const filteredInventory = inventory.filter(card => {
    if (filterStatus !== 'all' && card.status !== filterStatus) return false
    if (searchSerial && !card.card_serial.toLowerCase().includes(searchSerial.toLowerCase())) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400 mb-2">NFC Card Inventory</h1>
            <p className="text-gray-400">
              {user.user_metadata?.full_name || user.email}
              <span className="text-emerald-500 ml-2">● Admin</span>
            </p>
          </div>
          <button
            onClick={loadInventory}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-gray-800 rounded-xl p-4 border border-emerald-500/30">
            <p className="text-2xl font-bold text-emerald-400">{inventoryStats.unassigned}</p>
            <p className="text-xs text-gray-400 mt-1">Unassigned</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-blue-500/30">
            <p className="text-2xl font-bold text-blue-400">{inventoryStats.assigned}</p>
            <p className="text-xs text-gray-400 mt-1">Assigned</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-purple-500/30">
            <p className="text-2xl font-bold text-purple-400">{inventoryStats.active}</p>
            <p className="text-xs text-gray-400 mt-1">Active</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-red-500/30">
            <p className="text-2xl font-bold text-red-400">{inventoryStats.disabled}</p>
            <p className="text-xs text-gray-400 mt-1">Disabled</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-500/30">
            <p className="text-2xl font-bold text-gray-400">{inventoryStats.lost}</p>
            <p className="text-xs text-gray-400 mt-1">Lost</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-white/30">
            <p className="text-2xl font-bold text-white">{inventoryStats.total}</p>
            <p className="text-xs text-gray-400 mt-1">Total</p>
          </div>
        </div>

        {/* Add Cards Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-emerald-400">Add Cards to Inventory</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkMode(!bulkMode)}
                className={`px-3 py-1 rounded text-sm transition-all ${
                  bulkMode ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'
                }`}
              >
                {bulkMode ? 'Single Mode' : 'Bulk Mode'}
              </button>
              <button
                onClick={handleImportFromText}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-all"
              >
                📋 Import List
              </button>
            </div>
          </div>

          {!bulkMode ? (
            // Single Card Mode
            <div className="flex gap-4">
              <input
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSingle()}
                placeholder="Enter card serial (e.g., NFC001)"
                className="flex-1 px-4 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleAddSingle}
                disabled={adding || !serialInput.trim()}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add Card'}
              </button>
            </div>
          ) : (
            // Bulk Mode
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Prefix</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="NFC"
                    className="w-full px-4 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Start Number</label>
                  <input
                    type="number"
                    min="1"
                    value={startNumber}
                    onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Count (max 100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={count}
                    onChange={(e) => setCount(Math.min(100, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddBulk}
                    disabled={adding}
                    className="w-full px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all disabled:opacity-50"
                  >
                    {adding ? 'Adding...' : `Add ${count} Cards`}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Will generate: {prefix}{startNumber.toString().padStart(3, '0')} through {prefix}{(startNumber + count - 1).toString().padStart(3, '0')}
              </p>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex gap-2">
              {['all', 'unassigned', 'assigned', 'active', 'disabled', 'lost'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                    filterStatus === status
                      ? getStatusColor(status)
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchSerial}
              onChange={(e) => setSearchSerial(e.target.value.toUpperCase())}
              placeholder="Search serial..."
              className="flex-1 min-w-[200px] px-4 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">
              Card Inventory ({filteredInventory.length})
            </h2>
            {filteredInventory.length > 0 && (
              <button
                onClick={() => {
                  const csv = filteredInventory.map(c => c.card_serial).join('\n')
                  navigator.clipboard.writeText(csv)
                  alert('Serials copied to clipboard')
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Copy All Serials
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Serial Number</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Assigned To</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Activated</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Created</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((card) => (
                  <tr key={card.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      {card.card_serial}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={card.status}
                        onChange={(e) => handleStatusChange(card.id, e.target.value)}
                        className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(card.status)} bg-transparent`}
                      >
                        <option value="unassigned">Unassigned</option>
                        <option value="assigned">Assigned</option>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                        <option value="lost">Lost</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {card.user_id ? (
                        <span className="font-mono text-xs">{card.user_id.slice(0, 8)}...</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">
                      {formatDate(card.activated_at)}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">
                      {formatDate(card.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDeleteCard(card.id, card.card_serial)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">
                      No cards found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}