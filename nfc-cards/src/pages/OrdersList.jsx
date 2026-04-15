import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const OrdersList = ({ userId }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    loadBaseUrl()
    loadOrders()
    
    const subscription = supabase
      .channel('orders')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'card_orders', filter: `user_id=eq.${userId}` },
        () => loadOrders()
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [userId])

  const loadBaseUrl = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'base_url')
        .single()

      if (error) {
        console.error('Error loading base URL:', error)
        setBaseUrl(window.location.origin)
      } else {
        setBaseUrl(data.value)
      }
    } catch (err) {
      setBaseUrl(window.location.origin)
    }
  }

const loadOrders = async () => {
  try {
    // First, get the user's link (one per user)
    const { data: userLink } = await supabase
      .from('card_links')
      .select('link_code, profile_type, is_active, tap_count, created_at')
      .eq('user_id', userId)
      .maybeSingle()

    // Then get orders
    const { data, error } = await supabase
      .from('card_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading orders:', error)
      setLoading(false)
      return
    }

    // Attach the same link to all orders
    const normalizedOrders = data?.map(order => ({
      ...order,
      card_links: userLink ? [userLink] : []
    })) || []

    console.log('Orders with shared link:', normalizedOrders)
    setOrders(normalizedOrders)
    setLoading(false)

  } catch (err) {
    console.error('Exception loading orders:', err)
    setLoading(false)
  }
}

  const getStatusColor = (status) => ({
    pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    processing: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    shipped: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    delivered: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    cancelled: 'text-red-400 bg-red-400/10 border-red-400/30',
    paid: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
  }[status] || 'text-gray-400 bg-gray-400/10 border-gray-400/30')

  const formatNaira = (amount) => '₦' + (amount || 0).toLocaleString('en-NG')

  const buildProfileUrl = (linkCode) => {
    const cleanBaseUrl = (baseUrl || window.location.origin).replace(/\/$/, '')
    return `${cleanBaseUrl}/p/${linkCode}`
  }

  const copyLink = (code) => {
    const url = buildProfileUrl(code)
    navigator.clipboard.writeText(url)
    if (navigator.vibrate) navigator.vibrate(50)
    alert('Link copied!')
  }

  const shareLink = async (code) => {
    const url = buildProfileUrl(code)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My NFC Card',
          text: 'Tap to connect with me!',
          url: url
        })
      } catch (err) {
        copyLink(code)
      }
    } else {
      copyLink(code)
    }
  }

  const openProfile = (code) => {
    const url = buildProfileUrl(code)
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-6">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-sm">Loading orders...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-emerald-400 mb-3">Your Orders</h3>
      
      {orders.length === 0 ? (
        <div className="text-center py-8 bg-gray-900/50 rounded-xl border border-gray-800">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-gray-400 text-sm mb-1">No orders yet</p>
          <p className="text-xs text-gray-500">Order your first NFC card</p>
        </div>
      ) : (
        orders.map(order => {
          const hasLinks = order.card_links && order.card_links.length > 0
          
          return (
            <div key={order.id} className="bg-gray-900 rounded-lg border border-emerald-500/20 overflow-hidden">
              <div 
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/50"
                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-medium text-sm truncate">
                      #{order.id.slice(0, 6).toUpperCase()}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    {hasLinks && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {order.card_links.length} link{order.card_links.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {order.card_type || 'Standard'} • {formatNaira(order.amount)}
                    {order.card_serial && ` • ${order.card_serial}`}
                  </p>
                </div>
                <span className="text-emerald-400 text-xs ml-2">
                  {expandedOrder === order.id ? '▲' : '▼'}
                </span>
              </div>

              {expandedOrder === order.id && (
                <div className="border-t border-gray-800 p-3 bg-black/20">
                  {!hasLinks ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-400 mb-2">No link assigned yet</p>
                      <p className="text-xs text-gray-500">
                        Status: {order.status} • Payment: {order.payment_status}
                      </p>
                      {order.payment_status === 'paid' && (
                        <p className="text-xs text-amber-400 mt-2">
                          ⚠️ Link assignment pending - check back soon
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 mb-2">Your profile link:</p>
                      <div className="p-3 bg-gray-950 rounded border border-emerald-500/20">
                        {/* Use only the first link for all cards */}
                        {(() => {
                          const link = order.card_links[0]
                          
                          return (
                            <div className="flex flex-col gap-2">
                              {/* Clickable link */}
                              <div 
                                onClick={() => openProfile(link.link_code)}
                                className="cursor-pointer group"
                              >
                                <p className="text-emerald-400 font-mono text-sm break-all group-hover:text-emerald-300 transition-colors">
                                  {buildProfileUrl(link.link_code)}
                                </p>
                                <p className="text-[10px] text-gray-500 mt-1">
                                  👆 Click to preview your profile
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-gray-500 text-xs capitalize bg-gray-900 px-2 py-1 rounded">
                                  {link.profile_type || 'casual'}
                                </span>
                                <span className="text-gray-500 text-xs">
                                  {link.tap_count || 0} taps
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  link.is_active 
                                    ? 'text-emerald-400 bg-emerald-500/10' 
                                    : 'text-red-400 bg-red-500/10'
                                }`}>
                                  {link.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>

                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation()
                                    copyLink(link.link_code) 
                                  }}
                                  className="flex-1 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-medium hover:bg-emerald-500/20"
                                >
                                  📋 Copy
                                </button>
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation()
                                    shareLink(link.link_code) 
                                  }}
                                  className="flex-1 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-medium hover:bg-emerald-500/20"
                                >
                                  📤 Share
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      {order.card_links.length > 1 && (
                        <p className="text-[10px] text-gray-500 mt-2">
                          ℹ️ This link is shared across {order.card_links.length} cards
                        </p>
                      )}
                      <p className="text-[10px] text-gray-500 mt-3">
                        💡 This link works immediately - test it before your card arrives!
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}