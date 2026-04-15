import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export const TapRedirect = () => {
  const { linkCode } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profileData, setProfileData] = useState(null)

  useEffect(() => {
    handleTap()
  }, [linkCode])

  const handleTap = async () => {
    try {
      console.log('Looking up link code:', linkCode?.toUpperCase())
      
      // Step 1: Get link info from card_links
      const { data: link, error: linkError } = await supabase
        .from('card_links')
        .select('*')
        .eq('link_code', linkCode.toUpperCase())
        .maybeSingle()

      console.log('Link query result:', { link, error: linkError })

      if (linkError) {
        console.error('Link error:', linkError)
        throw new Error('Invalid or expired link')
      }

      if (!link) {
        throw new Error('Link not found')
      }

      if (!link.is_active) {
        throw new Error('This card has been deactivated')
      }

      // Step 2: Increment tap count
      const { error: updateError } = await supabase
        .from('card_links')
        .update({ 
          tap_count: (link.tap_count || 0) + 1,
          last_tapped_at: new Date().toISOString()
        })
        .eq('id', link.id)

      if (updateError) {
        console.error('Error updating tap count:', updateError)
      }

      // Step 3: Get user's ACTIVE mode from profile_modes
      console.log('Fetching active mode for user:', link.user_id)
      
      const { data: modeData, error: modeError } = await supabase
        .from('profile_modes')
        .select('default_mode')
        .eq('user_id', link.user_id)
        .maybeSingle()

      if (modeError) {
        console.error('Mode fetch error:', modeError)
      }

      // Determine which profile to show based on active mode
      // Fallback to 'casual' if no mode set or if link has a specific profile_type override
      const activeMode = modeData?.default_mode || link.profile_type || 'casual'
      console.log('Active mode:', activeMode)

      // Step 4: Fetch the appropriate profile based on active mode
      const profileTable = `${activeMode}_profiles`
      console.log('Fetching from profile table:', profileTable)
      
      const { data: profile, error: profileError } = await supabase
        .from(profileTable)
        .select('*')
        .eq('user_id', link.user_id)
        .maybeSingle()

      console.log('Profile query result:', { profile, error: profileError })

      if (profileError || !profile) {
        console.error('Profile error:', profileError)
        
        // Fallback: try to get any available profile
        const fallbackTables = ['casual_profiles', 'date_profiles', 'client_profiles']
        let fallbackProfile = null
        
        for (const table of fallbackTables) {
          if (table === profileTable) continue // Skip the one we already tried
          
          const { data: fp } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', link.user_id)
            .maybeSingle()
          
          if (fp) {
            fallbackProfile = fp
            console.log(`Found fallback profile in ${table}`)
            break
          }
        }
        
        if (!fallbackProfile) {
          throw new Error('No profile found for this user')
        }
        
        setProfileData({ ...fallbackProfile, profileType: activeMode })
      } else {
        setProfileData({ ...profile, profileType: activeMode })
      }
      
      setLoading(false)

    } catch (err) {
      console.error('handleTap error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-emerald-400">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-6xl mb-4">⚠️</p>
          <h1 className="text-2xl font-bold text-red-400 mb-2">Oops!</h1>
          <p className="text-gray-400">{error}</p>
          <p className="text-xs text-gray-500 mt-4">Link: {linkCode?.toUpperCase()}</p>
        </div>
      </div>
    )
  }

  const { profileType } = profileData

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Profile Header */}
      <div className={`p-8 pb-12 ${
        profileType === 'casual' ? 'bg-gradient-to-br from-blue-600 to-cyan-600' :
        profileType === 'date' ? 'bg-gradient-to-br from-pink-600 to-rose-600' :
        'bg-gradient-to-br from-emerald-600 to-teal-600'
      }`}>
        <div className="max-w-md mx-auto text-center">
          {profileData.profile_image_url ? (
            <img 
              src={profileData.profile_image_url} 
              alt={profileData.display_name}
              className="w-24 h-24 rounded-full border-4 border-white/30 mx-auto mb-4 object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-white/20 mx-auto mb-4 flex items-center justify-center text-4xl">
              {profileType === 'casual' ? '👋' : profileType === 'date' ? '💕' : '💼'}
            </div>
          )}
          <h1 className="text-3xl font-bold text-white mb-1">{profileData.display_name}</h1>
          {profileData.tagline && <p className="text-white/80">{profileData.tagline}</p>}
          {profileData.job_title && <p className="text-white/80">{profileData.job_title}</p>}
          {profileType === 'client' && profileData.company_name && (
            <p className="text-white/70 text-sm">{profileData.company_name}</p>
          )}
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-md mx-auto px-4 -mt-6">
        <div className="bg-gray-900 rounded-2xl p-6 shadow-2xl border border-gray-800">
          
          {/* Mode Badge */}
          <div className="flex justify-center mb-4">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              profileType === 'casual' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
              profileType === 'date' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {profileType === 'casual' ? '👋 Social Mode' : profileType === 'date' ? '💕 Dating Mode' : '💼 Business Mode'}
            </span>
          </div>
          
          {/* Bio */}
          {profileData.bio && (
            <p className="text-gray-300 text-center mb-6">{profileData.bio}</p>
          )}

          {/* Date-specific fields */}
          {profileType === 'date' && profileData.looking_for && (
            <div className="mb-4 p-3 bg-pink-500/10 rounded-xl border border-pink-500/20">
              <p className="text-xs text-pink-400 uppercase tracking-wider mb-1">Looking For</p>
              <p className="text-white">{profileData.looking_for}</p>
            </div>
          )}

          {profileType === 'date' && profileData.interests && profileData.interests.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Interests</p>
              <div className="flex flex-wrap gap-2">
                {profileData.interests.map((interest, idx) => (
                  <span key={idx} className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Client-specific fields */}
          {profileType === 'client' && profileData.elevator_pitch && (
            <div className="mb-4 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Elevator Pitch</p>
              <p className="text-white text-sm">{profileData.elevator_pitch}</p>
            </div>
          )}

          {profileType === 'client' && profileData.skills && profileData.skills.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Skills</p>
              <div className="flex flex-wrap gap-2">
                {profileData.skills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-emerald-500/10 rounded-full text-xs text-emerald-400 border border-emerald-500/20">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact Actions */}
          <div className="space-y-3 mb-6">
            {/* Phone - different fields for different modes */}
            {(profileData.phone || profileData.work_phone) && (
              <a 
                href={`tel:${profileData.phone || profileData.work_phone}`}
                className="flex items-center gap-3 p-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all"
              >
                <span className="text-2xl">📞</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-400">{profileType === 'client' ? 'Work Phone' : 'Call'}</p>
                  <p className="text-white">{profileData.phone || profileData.work_phone}</p>
                </div>
              </a>
            )}
            
            {/* Email - different fields for different modes */}
            {(profileData.email || profileData.work_email) && (
              <a 
                href={`mailto:${profileData.email || profileData.work_email}`}
                className="flex items-center gap-3 p-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all"
              >
                <span className="text-2xl">✉️</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-400">{profileType === 'client' ? 'Work Email' : 'Email'}</p>
                  <p className="text-white">{profileData.email || profileData.work_email}</p>
                </div>
              </a>
            )}

            {/* WhatsApp - for client mode */}
            {profileData.whatsapp_business && (
              <a 
                href={`https://wa.me/${profileData.whatsapp_business.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all"
              >
                <span className="text-2xl">💬</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-400">WhatsApp Business</p>
                  <p className="text-white">Chat on WhatsApp</p>
                </div>
              </a>
            )}

            {/* Calendly - for client mode */}
            {profileData.calendly_url && (
              <a 
                href={profileData.calendly_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-xl hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
              >
                <span className="text-2xl">📅</span>
                <div className="flex-1">
                  <p className="text-sm text-emerald-400">Book a Meeting</p>
                  <p className="text-white">Schedule via Calendly</p>
                </div>
              </a>
            )}
          </div>

          {/* Social Links - Mode aware */}
          <div className="grid grid-cols-4 gap-3">
            {/* Casual & Date socials */}
            {(profileType === 'casual' || profileType === 'date') && profileData.instagram_url && (
              <a href={profileData.instagram_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-pink-600/20 rounded-xl text-center hover:bg-pink-600/30 transition-all">
                <span className="text-2xl">📷</span>
              </a>
            )}
            {(profileType === 'casual' || profileType === 'date') && profileData.tiktok_url && (
              <a href={profileData.tiktok_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-black/40 rounded-xl text-center hover:bg-black/60 transition-all border border-white/10">
                <span className="text-2xl">🎵</span>
              </a>
            )}
            {profileType === 'casual' && profileData.snapchat_url && (
              <a href={profileData.snapchat_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-yellow-500/20 rounded-xl text-center hover:bg-yellow-500/30 transition-all">
                <span className="text-2xl">👻</span>
              </a>
            )}
            
            {/* Client socials */}
            {profileType === 'client' && profileData.linkedin_url && (
              <a href={profileData.linkedin_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-blue-600/20 rounded-xl text-center hover:bg-blue-600/30 transition-all">
                <span className="text-2xl">💼</span>
              </a>
            )}
            {profileType === 'client' && profileData.company_website && (
              <a href={profileData.company_website} target="_blank" rel="noopener noreferrer" className="p-3 bg-gray-700 rounded-xl text-center hover:bg-gray-600 transition-all">
                <span className="text-2xl">🌐</span>
              </a>
            )}
            {profileType === 'client' && profileData.portfolio_url && (
              <a href={profileData.portfolio_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-purple-500/20 rounded-xl text-center hover:bg-purple-500/30 transition-all">
                <span className="text-2xl">🎨</span>
              </a>
            )}
            
            {/* Common socials */}
            {profileData.twitter_url && (
              <a href={profileData.twitter_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-sky-500/20 rounded-xl text-center hover:bg-sky-500/30 transition-all">
                <span className="text-2xl">🐦</span>
              </a>
            )}
            {profileData.facebook_url && (
              <a href={profileData.facebook_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-blue-800/20 rounded-xl text-center hover:bg-blue-800/30 transition-all">
                <span className="text-2xl">f</span>
              </a>
            )}
            {profileData.threads_url && (
              <a href={profileData.threads_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-gray-700 rounded-xl text-center hover:bg-gray-600 transition-all">
                <span className="text-2xl">🧵</span>
              </a>
            )}
          </div>

          {/* Save Contact Button */}
          <button 
            onClick={() => {
              const vCard = generateVCard(profileData, profileType)
              const blob = new Blob([vCard], { type: 'text/vcard' })
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${profileData.display_name}.vcf`
              a.click()
            }}
            className="w-full mt-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-xl hover:from-emerald-400 hover:to-emerald-500 transition-all"
          >
            📇 Save Contact
          </button>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6 pb-8">
          Powered by NFC Card
        </p>
      </div>
    </div>
  )
}

// Helper to generate vCard - mode aware
function generateVCard(profile, profileType) {
  let phone = profile.phone || profile.work_phone || ''
  let email = profile.email || profile.work_email || ''
  let org = profileType === 'client' ? profile.company_name || '' : ''
  let title = profileType === 'client' ? profile.job_title || '' : ''
  let note = profile.bio || ''
  
  if (profileType === 'client' && profile.elevator_pitch) {
    note = profile.elevator_pitch
  }
  
  return `BEGIN:VCARD
VERSION:3.0
FN:${profile.display_name}
${title ? `TITLE:${title}` : ''}
${org ? `ORG:${org}` : ''}
${phone ? `TEL:${phone}` : ''}
${email ? `EMAIL:${email}` : ''}
${note ? `NOTE:${note}` : ''}
END:VCARD`
}