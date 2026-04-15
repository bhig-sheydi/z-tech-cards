import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { OrderForm } from './OrderForm'
import { OrdersList } from './OrdersList'

// ============================================
// IMAGE UPLOAD UTILITY
// ============================================

/**
 * Uploads a file to the "image" bucket.
 * If oldUrl is provided (and is a Supabase storage URL), deletes that object first.
 * Returns the new public URL, or throws on error.
 */
async function uploadImage(file, oldUrl = null) {
  // Delete old image if it lives in our bucket
  if (oldUrl) {
    try {
      const url = new URL(oldUrl)
      // Path looks like: /storage/v1/object/public/image/<path>
      const marker = '/object/public/image/'
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const oldPath = decodeURIComponent(url.pathname.slice(idx + marker.length))
        await supabase.storage.from('image').remove([oldPath])
      }
    } catch (_) {
      // Best-effort — don't block the upload if deletion fails
    }
  }

  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('image')
    .upload(path, file, { upsert: false })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('image').getPublicUrl(path)
  return data.publicUrl
}

// ============================================
// IMAGE UPLOAD FIELD COMPONENT
// ============================================
const ImageUploadField = memo(({ value, onChange, label, hint }) => {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const publicUrl = await uploadImage(file, value || null)
      onChange(publicUrl)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected after removal
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!value) return
    // Delete from bucket
    try {
      const url = new URL(value)
      const marker = '/object/public/image/'
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const path = decodeURIComponent(url.pathname.slice(idx + marker.length))
        await supabase.storage.from('image').remove([path])
      }
    } catch (_) { }
    onChange('')
  }

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}

      {value ? (
        <div className="flex items-center gap-3 p-3 bg-gray-950 border border-emerald-500/30 rounded-xl">
          <img
            src={value}
            alt="uploaded"
            className="w-14 h-14 rounded-lg object-cover border border-emerald-500/20 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 truncate">{value.split('/').pop()}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/20 hover:border-emerald-500/50 disabled:opacity-50 transition-all duration-200"
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 hover:border-red-500/50 disabled:opacity-50 transition-all duration-200"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full py-8 border-2 border-dashed border-emerald-500/40 rounded-xl text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-500/60 disabled:opacity-50 transition-all duration-200 flex flex-col items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Uploading…</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm font-medium">Click to upload image</span>
              <span className="text-xs text-gray-500">PNG, JPG, WEBP, GIF</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
})

// ============================================
// MEMOIZED UI COMPONENTS
// ============================================
const ModalOverlay = memo(({ children, onClose, title }) => (
  <div
    className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
    onClick={onClose}
  >
    <div
      className="bg-gray-900 rounded-2xl border border-emerald-500/30 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl shadow-emerald-900/20 animate-in zoom-in-95 duration-200"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-emerald-500/20 bg-gray-900/50">
        <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">{title}</h2>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-all duration-200 text-2xl font-light"
        >×</button>
      </div>
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] scrollbar-thin scrollbar-thumb-emerald-500/30 scrollbar-track-transparent">
        {children}
      </div>
    </div>
  </div>
))

const InputField = memo(({ value, onChange, placeholder, type = 'text', label, hint }) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-gray-300 flex items-center gap-2">{label}</label>}
    <input
      type={type}
      className="w-full px-4 py-3 bg-gray-950 border border-emerald-500/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 hover:border-emerald-500/50"
      placeholder={placeholder}
      value={value || ''}
      onChange={onChange}
    />
    {hint && <p className="text-xs text-gray-500">{hint}</p>}
  </div>
))

const TextAreaField = memo(({ value, onChange, placeholder, label, rows = 4 }) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
    <textarea
      className="w-full px-4 py-3 bg-gray-950 border border-emerald-500/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 resize-none hover:border-emerald-500/50"
      placeholder={placeholder}
      value={value || ''}
      onChange={onChange}
      rows={rows}
    />
  </div>
))

const SectionTitle = memo(({ children }) => (
  <h3 className="text-emerald-400 font-semibold text-lg mt-6 mb-3 pb-2 border-b border-emerald-500/20 flex items-center gap-2">
    <span className="w-1.5 h-5 bg-emerald-500 rounded-full"></span>
    {children}
  </h3>
))

const ArrayItemCard = memo(({ children, onRemove, removeLabel = "Remove" }) => (
  <div className="bg-gray-950/50 border border-emerald-500/20 rounded-xl p-4 space-y-3 hover:border-emerald-500/40 transition-colors duration-200">
    {children}
    <button
      onClick={onRemove}
      className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 hover:border-red-500/50 transition-all duration-200 flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      {removeLabel}
    </button>
  </div>
))

const AddButton = memo(({ onClick, children }) => (
  <button
    onClick={onClick}
    className="w-full py-3 border-2 border-dashed border-emerald-500/40 rounded-xl text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
    {children}
  </button>
))

const SaveButton = memo(({ onClick, saving, children }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-xl hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 mt-6"
  >
    {saving ? (
      <>
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
        Saving...
      </>
    ) : children}
  </button>
))

// ============================================
// MEMOIZED FORM COMPONENTS
// ============================================

const CasualForm = memo(({ formData, onChange, onImageChange, onSave, saving }) => (
  <div className="space-y-4">
    <SectionTitle>Basic Info</SectionTitle>
    <InputField label="Display Name *" placeholder="How you want to be seen" value={formData.display_name} onChange={onChange('display_name')} />
    <InputField label="Nickname" placeholder="Your casual nickname" value={formData.nickname} onChange={onChange('nickname')} />
    <InputField label="Date of Birth" type="date" value={formData.date_of_birth} onChange={onChange('date_of_birth')} />
    <TextAreaField label="Bio" placeholder="Tell people about yourself..." value={formData.bio} onChange={onChange('bio')} />

    <SectionTitle>Contact</SectionTitle>
    <InputField label="Phone Number" type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={onChange('phone')} />
    <InputField label="Email" type="email" placeholder="your@email.com" value={formData.email} onChange={onChange('email')} />

    <SectionTitle>Profile Image</SectionTitle>
    <ImageUploadField
      label="Profile Image"
      value={formData.profile_image_url}
      onChange={onImageChange('profile_image_url')}
    />

    <SectionTitle>Social Media</SectionTitle>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField placeholder="TikTok URL" value={formData.tiktok_url} onChange={onChange('tiktok_url')} />
      <InputField placeholder="Instagram URL" value={formData.instagram_url} onChange={onChange('instagram_url')} />
      <InputField placeholder="Facebook URL" value={formData.facebook_url} onChange={onChange('facebook_url')} />
      <InputField placeholder="Twitter/X URL" value={formData.twitter_url} onChange={onChange('twitter_url')} />
      <InputField placeholder="Threads URL" value={formData.threads_url} onChange={onChange('threads_url')} />
      <InputField placeholder="Snapchat URL" value={formData.snapchat_url} onChange={onChange('snapchat_url')} />
    </div>

    <SaveButton onClick={onSave} saving={saving}>Save Casual Profile</SaveButton>
  </div>
))

const DateForm = memo(({ formData, onChange, onImageChange, onArrayChange, onAddPlace, onRemovePlace, onSave, saving, onTestMaps }) => (
  <div className="space-y-4">
    <SectionTitle>Basic Info</SectionTitle>
    <InputField label="Display Name *" placeholder="Your name" value={formData.display_name} onChange={onChange('display_name')} />
    <InputField label="Nickname" placeholder="What friends call you" value={formData.nickname} onChange={onChange('nickname')} />
    <InputField label="Tagline" placeholder="A catchy one-liner" value={formData.tagline} onChange={onChange('tagline')} />
    <TextAreaField label="Romantic Bio" placeholder="What makes you unique..." value={formData.bio} onChange={onChange('bio')} />

    <SectionTitle>Contact</SectionTitle>
    <InputField label="Phone Number" type="tel" value={formData.phone} onChange={onChange('phone')} />
    <InputField label="Email" type="email" value={formData.email} onChange={onChange('email')} />
    <InputField label="Date of Birth" type="date" value={formData.date_of_birth} onChange={onChange('date_of_birth')} />

    <SectionTitle>Profile Image</SectionTitle>
    <ImageUploadField
      label="Profile Image"
      value={formData.profile_image_url}
      onChange={onImageChange('profile_image_url')}
    />

    <SectionTitle>Romantic Details</SectionTitle>
    <InputField label="Interests" placeholder="hiking, cooking, travel, movies..." value={formData.interests?.join(', ')} onChange={onChange('interests')} hint="Separate with commas" />
    <InputField label="Favorite Music" placeholder="Genres or artists you love" value={formData.favorite_music} onChange={onChange('favorite_music')} />
    <InputField label="Personality Type" placeholder="e.g., ENFP, Adventurer" value={formData.personality_type} onChange={onChange('personality_type')} />
    <InputField label="Looking For" placeholder="What you're seeking" value={formData.looking_for} onChange={onChange('looking_for')} />

    <SectionTitle>Favorite Places</SectionTitle>
    <div className="space-y-3">
      {formData.favorite_places?.map((place, index) => (
        <ArrayItemCard key={index} onRemove={onRemovePlace(index)}>
          <InputField placeholder="Place Name" value={place.name} onChange={onArrayChange(index, 'name')} />
          <InputField placeholder="Search Query for Maps" value={place.maps_query} onChange={onArrayChange(index, 'maps_query')} hint="Leave empty to use place name" />
          <div className="flex gap-2">
            <button
              onClick={() => onTestMaps(place.maps_query || place.name)}
              disabled={!place.name && !place.maps_query}
              className="flex-1 py-2 px-4 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/20 hover:border-blue-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Test in Maps
            </button>
          </div>
          <InputField placeholder="Notes (optional)" value={place.notes} onChange={onArrayChange(index, 'notes')} />
        </ArrayItemCard>
      ))}
      <AddButton onClick={onAddPlace}>Add Place</AddButton>
    </div>

    <SectionTitle>Address</SectionTitle>
    <InputField label="Home Address" placeholder="Your address (private)" value={formData.home_address} onChange={onChange('home_address')} />
    <p className="text-xs text-amber-500/80 flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
      You can hide this in privacy settings
    </p>

    <SectionTitle>Social</SectionTitle>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField placeholder="Instagram URL" value={formData.instagram_url} onChange={onChange('instagram_url')} />
      <InputField placeholder="TikTok URL" value={formData.tiktok_url} onChange={onChange('tiktok_url')} />
    </div>

    <SaveButton onClick={onSave} saving={saving}>Save Date Profile</SaveButton>
  </div>
))

const ClientForm = memo(({ formData, onChange, onImageChange, onGalleryImageChange, onArrayChange, onAddGallery, onRemoveGallery, onSave, saving }) => (
  <div className="space-y-4">
    <SectionTitle>Professional Info</SectionTitle>
    <InputField label="Display Name *" placeholder="Your professional name" value={formData.display_name} onChange={onChange('display_name')} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField label="Job Title" placeholder="e.g., Senior Designer" value={formData.job_title} onChange={onChange('job_title')} />
      <InputField label="Company Name" placeholder="Your company" value={formData.company_name} onChange={onChange('company_name')} />
      <InputField label="Department" placeholder="e.g., Engineering" value={formData.department} onChange={onChange('department')} />
      <InputField label="Industry" placeholder="e.g., Technology" value={formData.industry} onChange={onChange('industry')} />
    </div>

    <SectionTitle>Contact</SectionTitle>
    <InputField label="Work Email" type="email" placeholder="work@company.com" value={formData.work_email} onChange={onChange('work_email')} hint="Clicking will open Gmail app" />
    <InputField label="Work Phone" type="tel" placeholder="Office number" value={formData.work_phone} onChange={onChange('work_phone')} />
    <InputField label="WhatsApp Business" type="tel" placeholder="Business WhatsApp" value={formData.whatsapp_business} onChange={onChange('whatsapp_business')} hint="Enables WhatsApp click-to-chat" />

    <SectionTitle>Media</SectionTitle>
    <ImageUploadField
      label="Profile Image"
      value={formData.profile_image_url}
      onChange={onImageChange('profile_image_url')}
    />
    <ImageUploadField
      label="Company Logo"
      value={formData.company_logo_url}
      onChange={onImageChange('company_logo_url')}
    />

    <SectionTitle>Work Gallery</SectionTitle>
    <div className="space-y-3">
      {formData.work_gallery?.map((item, index) => (
        <ArrayItemCard key={index} onRemove={onRemoveGallery(index)} removeLabel="Remove Project">
          <ImageUploadField
            label="Project Image"
            value={item.image_url}
            onChange={onGalleryImageChange(index)}
          />
          <InputField placeholder="Project Title" value={item.title} onChange={onArrayChange(index, 'title')} />
          <TextAreaField placeholder="Project Description" value={item.description} onChange={onArrayChange(index, 'description')} rows={3} />
          <InputField placeholder="Project Link URL" value={item.link} onChange={onArrayChange(index, 'link')} />
        </ArrayItemCard>
      ))}
      <AddButton onClick={onAddGallery}>Add Project</AddButton>
    </div>

    <SectionTitle>Professional Links</SectionTitle>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField placeholder="LinkedIn URL" value={formData.linkedin_url} onChange={onChange('linkedin_url')} />
      <InputField placeholder="Company Website" value={formData.company_website} onChange={onChange('company_website')} />
      <InputField placeholder="Portfolio URL" value={formData.portfolio_url} onChange={onChange('portfolio_url')} />
      <InputField placeholder="Calendly URL" value={formData.calendly_url} onChange={onChange('calendly_url')} />
    </div>

    <SectionTitle>Social Media</SectionTitle>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField placeholder="Facebook URL" value={formData.facebook_url} onChange={onChange('facebook_url')} />
      <InputField placeholder="Instagram URL" value={formData.instagram_url} onChange={onChange('instagram_url')} />
      <InputField placeholder="TikTok URL" value={formData.tiktok_url} onChange={onChange('tiktok_url')} />
      <InputField placeholder="Twitter/X URL" value={formData.twitter_url} onChange={onChange('twitter_url')} />
      <InputField placeholder="Threads URL" value={formData.threads_url} onChange={onChange('threads_url')} />
    </div>

    <SectionTitle>Skills & Services</SectionTitle>
    <InputField label="Skills" placeholder="React, Design, Management..." value={formData.skills?.join(', ')} onChange={onChange('skills')} hint="Separate with commas" />
    <TextAreaField label="Services Offered" placeholder="What you can help clients with..." value={formData.services_offered} onChange={onChange('services_offered')} />
    <TextAreaField label="Elevator Pitch" placeholder="Your 30-second pitch..." value={formData.elevator_pitch} onChange={onChange('elevator_pitch')} />

    <SaveButton onClick={onSave} saving={saving}>Save Client Profile</SaveButton>
  </div>
))

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================
export const Dashboard = () => {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [currentMode, setCurrentMode] = useState('casual')
  const [saving, setSaving] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [showOrderForm, setShowOrderForm] = useState(false)

  const [casualForm, setCasualForm] = useState({
    display_name: '', nickname: '', bio: '', phone: '', email: '',
    date_of_birth: '', profile_image_url: '', tiktok_url: '',
    instagram_url: '', facebook_url: '', twitter_url: '',
    threads_url: '', snapchat_url: ''
  })

  const [dateForm, setDateForm] = useState({
    display_name: '', nickname: '', tagline: '', bio: '', phone: '',
    email: '', date_of_birth: '', profile_image_url: '', interests: [],
    favorite_music: '', personality_type: '', looking_for: '',
    favorite_places: [{ name: '', maps_query: '', notes: '' }],
    home_address: '', instagram_url: '', tiktok_url: ''
  })

  const [clientForm, setClientForm] = useState({
    display_name: '', job_title: '', company_name: '', department: '',
    industry: '', work_email: '', work_phone: '', whatsapp_business: '',
    profile_image_url: '', company_logo_url: '',
    work_gallery: [{ image_url: '', title: '', description: '', link: '' }],
    linkedin_url: '', company_website: '', portfolio_url: '',
    calendly_url: '', skills: [], services_offered: '', elevator_pitch: '',
    // Added missing social fields
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
    twitter_url: '',
    threads_url: '',
  })

  useEffect(() => {
    if (!user?.id) return
    const loadData = async () => {
      const [{ data: modeData }, { data: casual }, { data: date }, { data: client }] = await Promise.all([
        supabase.from('profile_modes').select('default_mode').eq('user_id', user.id).single(),
        supabase.from('casual_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('date_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('client_profiles').select('*').eq('user_id', user.id).single()
      ])
      if (modeData) setCurrentMode(modeData.default_mode)
      if (casual) setCasualForm(prev => ({ ...prev, ...casual }))
      if (date) setDateForm(prev => ({ ...prev, ...date, favorite_places: date.favorite_places?.length ? date.favorite_places : [{ name: '', maps_query: '', notes: '' }] }))
      if (client) setClientForm(prev => ({
        ...prev,
        ...client,
        work_gallery: client.work_gallery?.length ? client.work_gallery : [{ image_url: '', title: '', description: '', link: '' }],
        skills: client.skills || [],
        // Ensure new social fields have defaults
        facebook_url: client.facebook_url || '',
        instagram_url: client.instagram_url || '',
        tiktok_url: client.tiktok_url || '',
        twitter_url: client.twitter_url || '',
        threads_url: client.threads_url || '',
      }))
    }
    loadData()
  }, [user?.id])

  const handleLogout = async () => { await logout(); navigate('/login') }

  const switchMode = async (mode) => {
    if (mode === currentMode || saving) return
    setSaving(true)
    await supabase.from('profile_modes').update({ default_mode: mode }).eq('user_id', user.id)
    setCurrentMode(mode)
    setSaving(false)
  }

  // ---- Text field change handlers ----
  const handleCasualChange = useCallback((field) => (e) => {
    setCasualForm(prev => ({ ...prev, [field]: e.target.value }))
  }, [])

  const handleDateChange = useCallback((field) => (e) => {
    if (field === 'interests') {
      setDateForm(prev => ({ ...prev, interests: e.target.value.split(',').map(s => s.trim()) }))
    } else {
      setDateForm(prev => ({ ...prev, [field]: e.target.value }))
    }
  }, [])

  const handleClientChange = useCallback((field) => (e) => {
    if (field === 'skills') {
      setClientForm(prev => ({ ...prev, skills: e.target.value.split(',').map(s => s.trim()) }))
    } else {
      setClientForm(prev => ({ ...prev, [field]: e.target.value }))
    }
  }, [])

  // ---- Image change handlers (receive publicUrl string, not event) ----
  const handleCasualImageChange = useCallback((field) => (publicUrl) => {
    setCasualForm(prev => ({ ...prev, [field]: publicUrl }))
  }, [])

  const handleDateImageChange = useCallback((field) => (publicUrl) => {
    setDateForm(prev => ({ ...prev, [field]: publicUrl }))
  }, [])

  const handleClientImageChange = useCallback((field) => (publicUrl) => {
    setClientForm(prev => ({ ...prev, [field]: publicUrl }))
  }, [])

  // Gallery image change — updates the image_url of a specific gallery item
  const handleGalleryImageChange = useCallback((index) => (publicUrl) => {
    setClientForm(prev => {
      const newGallery = [...(prev.work_gallery || [])]
      newGallery[index] = { ...newGallery[index], image_url: publicUrl }
      return { ...prev, work_gallery: newGallery }
    })
  }, [])

  // ---- Array field handlers ----
  const handleDateArrayChange = useCallback((index, field) => (e) => {
    setDateForm(prev => {
      const newArray = [...(prev.favorite_places || [])]
      newArray[index] = { ...newArray[index], [field]: e.target.value }
      return { ...prev, favorite_places: newArray }
    })
  }, [])

  const handleClientArrayChange = useCallback((index, field) => (e) => {
    setClientForm(prev => {
      const newArray = [...(prev.work_gallery || [])]
      newArray[index] = { ...newArray[index], [field]: e.target.value }
      return { ...prev, work_gallery: newArray }
    })
  }, [])

  const addDatePlace = useCallback(() => {
    setDateForm(prev => ({ ...prev, favorite_places: [...(prev.favorite_places || []), { name: '', maps_query: '', notes: '' }] }))
  }, [])

  const removeDatePlace = useCallback((index) => () => {
    setDateForm(prev => {
      const newArray = [...(prev.favorite_places || [])]
      newArray.splice(index, 1)
      return { ...prev, favorite_places: newArray }
    })
  }, [])

  const addClientGallery = useCallback(() => {
    setClientForm(prev => ({ ...prev, work_gallery: [...(prev.work_gallery || []), { image_url: '', title: '', description: '', link: '' }] }))
  }, [])

  const removeClientGallery = useCallback((index) => () => {
    setClientForm(prev => {
      const newArray = [...(prev.work_gallery || [])]
      // Delete the image from storage when the whole gallery item is removed
      const removedUrl = newArray[index]?.image_url
      if (removedUrl) {
        try {
          const url = new URL(removedUrl)
          const marker = '/object/public/image/'
          const idx = url.pathname.indexOf(marker)
          if (idx !== -1) {
            const path = decodeURIComponent(url.pathname.slice(idx + marker.length))
            supabase.storage.from('image').remove([path])
          }
        } catch (_) { }
      }
      newArray.splice(index, 1)
      return { ...prev, work_gallery: newArray }
    })
  }, [])

  // ---- UPDATED Save handlers with explicit field mapping ----
  const saveCasual = useCallback(async () => {
    setSaving(true)

    const dataToSave = {
      user_id: user.id,
      display_name: casualForm.display_name,
      nickname: casualForm.nickname || null,
      bio: casualForm.bio || null,
      phone: casualForm.phone || null,
      email: casualForm.email || null,
      date_of_birth: casualForm.date_of_birth || null,
      profile_image_url: casualForm.profile_image_url || null,
      tiktok_url: casualForm.tiktok_url || null,
      instagram_url: casualForm.instagram_url || null,
      facebook_url: casualForm.facebook_url || null,
      twitter_url: casualForm.twitter_url || null,
      threads_url: casualForm.threads_url || null,
      snapchat_url: casualForm.snapchat_url || null,
    }

    const { data, error } = await supabase
      .from('casual_profiles')
      .upsert(dataToSave, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Save error:', error)
      alert('Error saving: ' + error.message)
    } else {
      setCasualForm(prev => ({ ...prev, ...data }))
      setActiveModal(null)
    }
    setSaving(false)
  }, [casualForm, user?.id])

  const saveDate = useCallback(async () => {
    setSaving(true)

    const dataToSave = {
      user_id: user.id,
      display_name: dateForm.display_name,
      nickname: dateForm.nickname || null,
      tagline: dateForm.tagline || null,
      bio: dateForm.bio || null,
      phone: dateForm.phone || null,
      email: dateForm.email || null,
      date_of_birth: dateForm.date_of_birth || null,
      profile_image_url: dateForm.profile_image_url || null,
      interests: dateForm.interests || [],
      favorite_music: dateForm.favorite_music || null,
      personality_type: dateForm.personality_type || null,
      looking_for: dateForm.looking_for || null,
      favorite_places: dateForm.favorite_places?.filter(p => p.name) || [],
      home_address: dateForm.home_address || null,
      instagram_url: dateForm.instagram_url || null,
      tiktok_url: dateForm.tiktok_url || null,
    }

    const { data, error } = await supabase
      .from('date_profiles')
      .upsert(dataToSave, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Save error:', error)
      alert('Error saving: ' + error.message)
    } else {
      setDateForm(prev => ({ ...prev, ...data }))
      setActiveModal(null)
    }
    setSaving(false)
  }, [dateForm, user?.id])

  const saveClient = useCallback(async () => {
    setSaving(true)

    const dataToSave = {
      user_id: user.id,
      display_name: clientForm.display_name,
      job_title: clientForm.job_title || null,
      company_name: clientForm.company_name || null,
      department: clientForm.department || null,
      industry: clientForm.industry || null,
      work_email: clientForm.work_email || null,
      work_phone: clientForm.work_phone || null,
      whatsapp_business: clientForm.whatsapp_business || null,
      profile_image_url: clientForm.profile_image_url || null,
      company_logo_url: clientForm.company_logo_url || null,
      work_gallery: clientForm.work_gallery || [],
      linkedin_url: clientForm.linkedin_url || null,
      company_website: clientForm.company_website || null,
      portfolio_url: clientForm.portfolio_url || null,
      calendly_url: clientForm.calendly_url || null,
      skills: clientForm.skills || [],
      services_offered: clientForm.services_offered || null,
      elevator_pitch: clientForm.elevator_pitch || null,
      // NEW: Social media fields
      facebook_url: clientForm.facebook_url || null,
      instagram_url: clientForm.instagram_url || null,
      tiktok_url: clientForm.tiktok_url || null,
      twitter_url: clientForm.twitter_url || null,
      threads_url: clientForm.threads_url || null,
    }

    const { data, error } = await supabase
      .from('client_profiles')
      .upsert(dataToSave, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Save error:', error)
      alert('Error saving: ' + error.message)
    } else {
      setClientForm(prev => ({ ...prev, ...data }))
      setActiveModal(null)
    }
    setSaving(false)
  }, [clientForm, user?.id])

  const openGoogleMaps = useCallback((query) => {
    if (!query) return
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank')
  }, [])

  const getModeIcon = (mode) => ({ casual: '👋', date: '💕', client: '💼' }[mode] || '👋')
  const getModeLabel = (mode) => ({ casual: 'Social & Friends', date: 'Romantic Connections', client: 'Professional Networking' }[mode] || 'Social & Friends')
  const getModeColor = (mode) => ({ casual: 'from-blue-500 to-cyan-500', date: 'from-pink-500 to-rose-500', client: 'from-emerald-500 to-teal-500' }[mode] || 'from-blue-500 to-cyan-500')

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 backdrop-blur-md bg-black/80 border-b border-emerald-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">NFC Card</h1>
            </div>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 rounded-xl border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400 transition-all duration-200 font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Mode Selector Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gray-900/50 border border-emerald-500/20 p-6 backdrop-blur-sm">
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${getModeColor(currentMode)}`}></div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                <span className="text-2xl">{getModeIcon(currentMode)}</span>
                Current Mode
              </h3>
              <p className="text-gray-400 text-sm mt-1">{getModeLabel(currentMode)}</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-sm font-medium text-emerald-400 capitalize">{currentMode} Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {['casual', 'date', 'client'].map((mode) => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                disabled={saving}
                className={`
                  relative group p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-3
                  ${currentMode === mode
                    ? `border-emerald-500 bg-gradient-to-br ${getModeColor(mode)} text-black shadow-lg`
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200'
                  }
                  ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'}
                `}
              >
                <span className="text-2xl group-hover:scale-110 transition-transform duration-200">{getModeIcon(mode)}</span>
                <div className="text-left">
                  <span className="block font-semibold capitalize">{mode}</span>
                  <span className={`text-xs ${currentMode === mode ? 'text-black/70' : 'text-gray-500'}`}>
                    {mode === 'casual' ? 'Friends' : mode === 'date' ? 'Dating' : 'Business'}
                  </span>
                </div>
                {currentMode === mode && (
                  <svg className="absolute top-3 right-3 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Welcome Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl bg-gray-900/50 border border-emerald-500/20 p-6 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/10 transition-all duration-500"></div>
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-white mb-2">
                Welcome back, <span className="text-emerald-400">{profile?.full_name || user?.email?.split('@')[0]}</span>!
              </h2>
              <p className="text-gray-400 mb-6">Manage your NFC card profiles and settings</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-black/30 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm text-gray-300 truncate">{user?.email}</p>
                </div>
                <div className="p-4 rounded-xl bg-black/30 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active Profile</p>
                  <p className="text-sm text-emerald-400 font-medium capitalize flex items-center gap-2">
                    {getModeIcon(currentMode)} {currentMode}
                  </p>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-emerald-500/30 via-emerald-500/10 to-transparent mb-6"></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => setActiveModal('casual')} className="group/btn p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-200 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xl group-hover/btn:scale-110 transition-transform">👋</span>
                    <span className="font-semibold text-gray-200">Casual Profile</span>
                  </div>
                  <p className="text-xs text-gray-500">Social links & bio</p>
                </button>

                <button onClick={() => setActiveModal('date')} className="group/btn p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-pink-500/50 hover:bg-pink-500/5 transition-all duration-200 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center text-xl group-hover/btn:scale-110 transition-transform">💕</span>
                    <span className="font-semibold text-gray-200">Date Profile</span>
                  </div>
                  <p className="text-xs text-gray-500">Romantic preferences</p>
                </button>

                <button onClick={() => setActiveModal('client')} className="group/btn p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl group-hover/btn:scale-110 transition-transform">💼</span>
                    <span className="font-semibold text-gray-200">Client Profile</span>
                  </div>
                  <p className="text-xs text-gray-500">Professional details</p>
                </button>

                <button
                  onClick={() => setShowOrderForm(true)}
                  className="group/btn p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all duration-200 text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl group-hover/btn:scale-110 transition-transform">📦</span>
                    <span className="font-semibold text-gray-200">Order NFC Card</span>
                  </div>
                  <p className="text-xs text-gray-500">Get your physical card</p>
                </button>

                <div className="mt-8">
                  <OrdersList userId={user?.id} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-emerald-900/20 to-gray-900 border border-emerald-500/20 p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Quick Tips
            </h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">•</span><span>Switch modes instantly when sharing your card</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">•</span><span>Each profile is optimized for different contexts</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">•</span><span>Your data syncs across all devices</span></li>
            </ul>
            <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-medium mb-1">Pro Tip</p>
              <p className="text-xs text-gray-400">Keep your professional profile updated with recent projects for better networking!</p>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {activeModal === 'casual' && (
        <ModalOverlay onClose={() => setActiveModal(null)} title="👋 Edit Casual Profile">
          <CasualForm
            formData={casualForm}
            onChange={handleCasualChange}
            onImageChange={handleCasualImageChange}
            onSave={saveCasual}
            saving={saving}
          />
        </ModalOverlay>
      )}

      {activeModal === 'date' && (
        <ModalOverlay onClose={() => setActiveModal(null)} title="💕 Edit Date Profile">
          <DateForm
            formData={dateForm}
            onChange={handleDateChange}
            onImageChange={handleDateImageChange}
            onArrayChange={handleDateArrayChange}
            onAddPlace={addDatePlace}
            onRemovePlace={removeDatePlace}
            onSave={saveDate}
            saving={saving}
            onTestMaps={openGoogleMaps}
          />
        </ModalOverlay>
      )}

      {showOrderForm && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <OrderForm
            userId={user.id}
            onOrderCreated={(order) => {
              setShowOrderForm(false)
              alert('Order placed successfully! Your links will be generated once payment is confirmed.')
            }}
            onCancel={() => setShowOrderForm(false)}
          />
        </div>
      )}

      {activeModal === 'client' && (
        <ModalOverlay onClose={() => setActiveModal(null)} title="💼 Edit Client Profile">
          <ClientForm
            formData={clientForm}
            onChange={handleClientChange}
            onImageChange={handleClientImageChange}
            onGalleryImageChange={handleGalleryImageChange}
            onArrayChange={handleClientArrayChange}
            onAddGallery={addClientGallery}
            onRemoveGallery={removeClientGallery}
            onSave={saveClient}
            saving={saving}
          />
        </ModalOverlay>
      )}
    </div>
  )
}