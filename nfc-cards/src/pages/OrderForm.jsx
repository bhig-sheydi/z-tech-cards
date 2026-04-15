import { useState, useCallback, memo, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// At top of OrderForm.jsx
const PAYMENT_FUNCTION_URL = import.meta.env.VITE_PAYMENT_FUNCTION_URL || ''
// ─── Reusable primitives ────────────────────────────────────────────────────

const InputField = memo(({ value, onChange, placeholder, type = 'text', label, hint, disabled }) => (
  <div className="space-y-1">
    {label && <label className="text-xs font-medium text-gray-300 flex items-center gap-2">{label}</label>}
    <input
      type={type}
      disabled={disabled}
      className="w-full px-3 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      placeholder={placeholder}
      value={value || ''}
      onChange={onChange}
    />
    {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
  </div>
))

const SelectField = memo(({ value, onChange, label, options, disabled }) => (
  <div className="space-y-1">
    {label && <label className="text-xs font-medium text-gray-300">{label}</label>}
    <select
      value={value}
      disabled={disabled}
      onChange={onChange}
      className="w-full px-3 py-2 bg-gray-950 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm disabled:opacity-50"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
))

const SectionTitle = memo(({ children }) => (
  <h3 className="text-emerald-400 font-semibold text-sm mt-3 mb-2 pb-1 border-b border-emerald-500/20 flex items-center gap-2">
    <span className="w-1 h-3 bg-emerald-500 rounded-full"></span>
    {children}
  </h3>
))

const CopyButton = memo(({ text, label }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/20 transition-all shrink-0"
    >
      {copied ? '✓ Copied' : label || 'Copy'}
    </button>
  )
})

// ─── Main component ──────────────────────────────────────────────────────────

export const OrderForm = ({ userId, onOrderCreated, onCancel }) => {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // paymentStep: 'select' | 'processing' | 'account' | 'card' | 'verifying' | 'success'
  const [paymentStep, setPaymentStep] = useState('select')
  const [virtualAccount, setVirtualAccount] = useState(null)
  const [currentOrder, setCurrentOrder] = useState(null)
  const [countdown, setCountdown] = useState(1500) // 25 minutes for PwT
  const countdownRef = useRef(null)
  const pollingRef = useRef(null)

  const [formData, setFormData] = useState({
    cardType: 'standard',
    fullName: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    lga: '',
    country: 'NG',
    phone: '',
    whatsapp: '',
    paymentMethod: 'paystack_transfer',
    unitPrice: 15000,
    deliveryMethod: 'pickup' // 'pickup' | 'delivery'
  })

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateField = useCallback((field) => (e) => {
    const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const calculateTotal = () => formData.unitPrice // Only card price, NO delivery fee included
  const formatNaira = (amount) => '₦' + amount.toLocaleString('en-NG')
  const formatCountdown = (s) => {
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
  }

  // ── cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearInterval(countdownRef.current)
      clearInterval(pollingRef.current)
    }
  }, [])

  // ── called ONLY when payment is genuinely confirmed ──────────────────────

  const handlePaymentSuccess = (order) => {
    clearInterval(countdownRef.current)
    clearInterval(pollingRef.current)
    setPaymentStep('success')
    // Only notify parent here — payment is actually done, not just initialized
    onOrderCreated?.(order)
  }

  // ── step 3 main init ─────────────────────────────────────────────────────

  const initializePaystack = async () => {
    setLoading(true)
    setError(null)
    setPaymentStep('processing')

    try {
      const total = calculateTotal()

      // 1. Create the order in Supabase
      const { data: order, error: orderErr } = await supabase
        .from('card_orders')
        .insert({
          user_id: userId,
          status: 'pending',
          amount: total,
          currency: 'NGN',
          payment_status: 'pending',
          payment_method: formData.paymentMethod,
          delivery_method: formData.deliveryMethod, // 'pickup' or 'delivery' - stored for webhook handling
          card_type: formData.cardType,
          shipping_address: {
            full_name: formData.fullName,
            email: formData.email,
            line1: formData.addressLine1,
            line2: formData.addressLine2,
            city: formData.city,
            state: formData.state,
            lga: formData.lga,
            country: formData.country,
            phone: formData.phone,
            whatsapp: formData.whatsapp
          }
        })
        .select()
        .single()

      if (orderErr) throw orderErr
      setCurrentOrder(order)

      const authHeader = await getAuthHeader()

      // 2. Call edge function to initialize payment
      const res = await fetch(PAYMENT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          action: 'initialize',
          order_id: order.id,
          amount: total,
          email: formData.email,
          payment_method: formData.paymentMethod,
          full_name: formData.fullName,
          phone: formData.phone,
          delivery_method: formData.deliveryMethod
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Payment initialization failed')

      if (formData.paymentMethod === 'paystack_transfer') {
        const account = data.data || data
        setVirtualAccount({
          account_number: account.account_number,
          account_name: account.account_name || 'Paystack-Titan',
          bank_name: account.bank_name || 'Paystack-Titan',
          amount: total,
          reference: account.reference || order.id,
          expires_at: account.expires_at,
          // CRITICAL: Narration is required for PwT
          narration: account.narration || account.reference || order.id
        })

        // FIX: Properly await the payment_reference update
        if (account.reference) {
          const { error: refError } = await supabase
            .from('card_orders')
            .update({ payment_reference: account.reference })
            .eq('id', order.id)
          
          if (refError) {
            console.error('Failed to save payment_reference:', refError)
            // Continue anyway - webhook has fallback to order.id
          }
        }

        setPaymentStep('account')
        startCountdown(order.id, account.reference || order.id)

      } else {
        // Card payment — redirect to Paystack hosted page
        const authUrl = data.authorization_url || (data.data && data.data.authorization_url)
        const reference = data.reference || (data.data && data.data.reference)

        if (authUrl) {
          // FIX: Properly await the payment_reference update before redirecting
          if (reference) {
            const { error: refError } = await supabase
              .from('card_orders')
              .update({ payment_reference: reference })
              .eq('id', order.id)
            
            if (refError) {
              console.error('Failed to save payment_reference:', refError)
              // Continue anyway - webhook has fallback to order.id
            }
          }
          
          // FIX: Small delay to ensure DB write completes before redirect
          await new Promise(resolve => setTimeout(resolve, 500))
          
          window.location.href = authUrl
        } else {
          setPaymentStep('card')
        }
      }

    } catch (err) {
      setError(err.message)
      setPaymentStep('select')
    } finally {
      setLoading(false)
    }
  }

  // ── countdown + auto-polling ─────────────────────────────────────────────

  const startCountdown = (orderId, reference) => {
    setCountdown(1500) // 25 minutes for Pay with Transfer

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          clearInterval(pollingRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    pollingRef.current = setInterval(() => {
      pollPaymentStatus(orderId, reference)
    }, 15000)
  }

  const pollPaymentStatus = async (orderId, reference) => {
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch(PAYMENT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          action: 'verify',
          order_id: orderId || currentOrder?.id,
          reference: reference || virtualAccount?.reference
        })
      })
      const data = await res.json()

      if (data.status === 'success') {
        handlePaymentSuccess(data.data?.order || currentOrder)
      }
    } catch {
      // Silent — will retry on next interval
    }
  }

  // ── manual verify ────────────────────────────────────────────────────────

  const handleManualVerify = async () => {
    if (!virtualAccount?.reference && !currentOrder?.id) return
    setPaymentStep('verifying')

    try {
      const authHeader = await getAuthHeader()
      const res = await fetch(PAYMENT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          action: 'verify',
          order_id: currentOrder?.id,
          reference: virtualAccount?.reference
        })
      })

      const data = await res.json()

      if (data.status === 'success') {
        handlePaymentSuccess(data.data?.order || currentOrder)
      } else {
        setError('Payment not confirmed yet. Please wait a moment and try again.')
        setPaymentStep('account')
      }
    } catch (err) {
      setError(err.message)
      setPaymentStep('account')
    }
  }

  // ── Nigerian states ──────────────────────────────────────────────────────

  const nigerianStates = [
    { value: '', label: 'Select State' },
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
    'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
    'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
    'Zamfara','Abuja FCT'
  ].map(s => typeof s === 'string' ? { value: s, label: s } : s)

  // ────────────────────────────────────────────────────────────────────────
  // RENDERS
  // ────────────────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-2">
      <SectionTitle>Select Your Card</SectionTitle>

      {[
        { id: 'standard', name: 'Standard Card', price: 15000, desc: 'Classic black NFC card' },
        { id: 'premium',  name: 'Premium Metal', price: 25000, desc: 'Brushed aluminum finish' },
        { id: 'custom',   name: 'Custom Design', price: 40000, desc: 'Your logo printed' }
      ].map(card => (
        <button
          key={card.id}
          onClick={() => setFormData(prev => ({ ...prev, cardType: card.id, unitPrice: card.price }))}
          className={`w-full p-2.5 rounded-lg border-2 text-left transition-all ${
            formData.cardType === card.id
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-white text-sm">{card.name}</p>
              <p className="text-[10px] text-gray-400">{card.desc}</p>
            </div>
            <p className="text-emerald-400 font-bold text-sm">{formatNaira(card.price)}</p>
          </div>
        </button>
      ))}

      <div className="mt-2 p-2.5 bg-gray-950 rounded-lg border border-emerald-500/20">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Card Price</span>
          <span className="text-white">{formatNaira(formData.unitPrice)}</span>
        </div>
        <div className="border-t border-gray-800 my-1" />
        <div className="flex justify-between text-sm font-bold">
          <span className="text-emerald-400">Total to Pay Now</span>
          <span className="text-emerald-400">{formatNaira(calculateTotal())}</span>
        </div>
        <p className="text-[10px] text-amber-400/80 mt-1 italic">
          *Delivery fee (if applicable) will be communicated separately after payment
        </p>
      </div>

      <button
        onClick={() => setStep(2)}
        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-lg hover:from-emerald-400 hover:to-emerald-500 transition-all text-sm"
      >
        Continue →
      </button>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      <SectionTitle>Delivery Method</SectionTitle>

      {/* Pickup or Delivery Selection */}
      <div className="space-y-2 mb-4">
        {[
          { id: 'pickup', icon: '🏢', name: 'Pickup', desc: 'Collect from our office (No extra fee)' },
          { id: 'delivery', icon: '🚚', name: 'Delivery', desc: 'Delivered to your address (Fee communicated after payment)' }
        ].map(method => (
          <button
            key={method.id}
            onClick={() => setFormData(prev => ({ ...prev, deliveryMethod: method.id }))}
            className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
              formData.deliveryMethod === method.id
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{method.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">{method.name}</p>
                <p className="text-[10px] text-gray-400">{method.desc}</p>
              </div>
              {formData.deliveryMethod === method.id && <span className="text-emerald-500 text-lg">✓</span>}
            </div>
          </button>
        ))}
      </div>

      <SectionTitle>Contact Details</SectionTitle>

      <InputField label="Full Name" value={formData.fullName} onChange={updateField('fullName')} placeholder="Oluwaseun Adebayo" />
      <InputField label="Email" type="email" value={formData.email} onChange={updateField('email')} placeholder="your@email.com" hint="Required for payment receipt" />

      {/* Address fields ONLY show for DELIVERY */}
      {formData.deliveryMethod === 'delivery' && (
        <>
          <SectionTitle>Delivery Address</SectionTitle>
          <InputField label="Street Address" value={formData.addressLine1} onChange={updateField('addressLine1')} placeholder="12 Allen Avenue" />
          <InputField label="Apartment/Office (Optional)" value={formData.addressLine2} onChange={updateField('addressLine2')} placeholder="Suite 4B" />
          <SelectField label="State" value={formData.state} onChange={updateField('state')} options={nigerianStates} />
          <div className="grid grid-cols-2 gap-2">
            <InputField label="City" value={formData.city} onChange={updateField('city')} placeholder="Ikeja" />
            <InputField label="LGA" value={formData.lga} onChange={updateField('lga')} placeholder="Ikeja LG" />
          </div>
        </>
      )}

      <InputField label="Phone Number" type="tel" value={formData.phone} onChange={updateField('phone')} placeholder="0803 123 4567" />
      <InputField label="WhatsApp (Optional)" type="tel" value={formData.whatsapp} onChange={updateField('whatsapp')} placeholder="0803 123 4567" />

      <div className="flex gap-2 mt-2">
        <button onClick={() => setStep(1)} className="flex-1 py-2 border border-gray-600 text-gray-300 font-bold rounded-lg hover:bg-gray-800 transition-all text-sm">Back</button>
        <button
          onClick={() => setStep(3)}
          disabled={!formData.fullName || !formData.email || !formData.phone || (formData.deliveryMethod === 'delivery' && (!formData.addressLine1 || !formData.state || !formData.city))}
          className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-lg hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-50 text-sm"
        >
          Continue →
        </button>
      </div>
    </div>
  )

  const renderPaymentSelect = () => (
    <div className="space-y-2">
      <SectionTitle>Choose Payment Method</SectionTitle>

      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {[
        { id: 'paystack_transfer', icon: '🏦', name: 'Bank Transfer', desc: 'Generate a unique account number' },
        { id: 'paystack_card',     icon: '💳', name: 'Debit/Credit Card', desc: 'Pay with card via Paystack' }
      ].map(method => (
        <button
          key={method.id}
          onClick={() => setFormData(prev => ({ ...prev, paymentMethod: method.id }))}
          className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
            formData.paymentMethod === method.id
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{method.icon}</span>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{method.name}</p>
              <p className="text-[10px] text-gray-400">{method.desc}</p>
            </div>
            {formData.paymentMethod === method.id && <span className="text-emerald-500 text-lg">✓</span>}
          </div>
        </button>
      ))}

      <div className="p-2.5 bg-gray-950 rounded-lg border border-emerald-500/20">
        <div className="flex justify-between text-sm font-bold">
          <span className="text-emerald-400">Total to Pay</span>
          <span className="text-emerald-400">{formatNaira(calculateTotal())}</span>
        </div>
        <p className="text-[10px] text-amber-400/80 mt-1">
          {formData.deliveryMethod === 'delivery' 
            ? '*Delivery fee will be communicated after payment completion' 
            : '*No additional fees for pickup'}
        </p>
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={() => setStep(2)} className="flex-1 py-2.5 border border-gray-600 text-gray-300 font-bold rounded-lg hover:bg-gray-800 transition-all text-sm">Back</button>
        <button
          onClick={initializePaystack}
          disabled={loading}
          className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-lg hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-50 text-sm"
        >
          {loading ? 'Processing...' : 'Proceed to Pay'}
        </button>
      </div>
    </div>
  )

  const renderVirtualAccount = () => {
    if (!virtualAccount) return null
    const expired = countdown === 0

    return (
      <div className="space-y-3">
        <SectionTitle>Complete Your Transfer</SectionTitle>

        {error && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {expired ? (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
            <p className="text-sm text-red-400 font-semibold mb-1">⚠️ Account Expired</p>
            <p className="text-xs text-red-400/80 mb-3">This virtual account has expired. Please start a new payment.</p>
            <button
              onClick={() => { setPaymentStep('select'); setVirtualAccount(null); setError(null) }}
              className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all"
            >
              Start New Payment
            </button>
          </div>
        ) : (
          <>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <p className="text-xs text-emerald-400 mb-2">
                Transfer exactly <strong>{formatNaira(virtualAccount.amount)}</strong> to:
              </p>
              <div className="space-y-2">
                {[
                  { label: 'Account Number', value: virtualAccount.account_number, mono: true, copy: true },
                  { label: 'Bank Name', value: virtualAccount.bank_name, copy: true },
                  { label: 'Account Name', value: virtualAccount.account_name, copy: false },
                  { label: 'Amount', value: formatNaira(virtualAccount.amount), copy: true, copyValue: String(virtualAccount.amount), highlight: true },
                  // CRITICAL: Narration is required for Pay with Transfer
                  { label: 'Narration/Description (REQUIRED)', value: virtualAccount.narration, mono: true, copy: true, highlight: true, warning: true }
                ].map(row => (
                  <div key={row.label} className={`flex justify-between items-center p-2 bg-gray-950 rounded gap-2 ${row.warning ? 'border border-amber-500/30' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        {row.label}
                        {row.warning && <span className="text-amber-500">⚠️</span>}
                      </p>
                      <p className={`text-sm font-medium ${row.highlight ? 'text-emerald-400 font-bold' : 'text-white'} ${row.mono ? 'font-mono tracking-wider text-base' : ''}`}>
                        {row.value}
                      </p>
                    </div>
                    {row.copy && <CopyButton text={row.copyValue || row.value} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Warning for Narration */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              <p className="text-xs text-red-400 font-semibold mb-1">⚠️ IMPORTANT:</p>
              <p className="text-[10px] text-red-400/80">
                You MUST include the <strong>Narration/Description</strong> above when making the transfer in your banking app, or your payment will NOT be detected automatically!
              </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400">⏱️</span>
                <p className="text-xs text-amber-400 font-medium">Expires in {formatCountdown(countdown)}</p>
              </div>
              <p className="text-[10px] text-amber-400/80">
                Use this account number once and send the exact amount. Auto-checking every 15 seconds.
              </p>
            </div>

            <ol className="text-[10px] text-gray-400 list-decimal list-inside space-y-0.5">
              <li>Copy the account number above</li>
              <li>Open your banking app and make a transfer</li>
              <li>Enter the exact amount shown</li>
              <li><strong className="text-amber-400">Paste the Narration/Description in the "Reason" or "Description" field</strong></li>
              <li>Complete the transfer and tap "I've Made the Transfer"</li>
            </ol>

            <button
              onClick={handleManualVerify}
              disabled={paymentStep === 'verifying'}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-lg hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-50 text-sm"
            >
              {paymentStep === 'verifying'
                ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" />Verifying...</span>
                : "✅ I've Made the Transfer"}
            </button>

            <button
              onClick={() => {
                setPaymentStep('select')
                setVirtualAccount(null)
                setError(null)
                clearInterval(countdownRef.current)
                clearInterval(pollingRef.current)
              }}
              className="w-full py-2 text-gray-400 text-xs hover:text-white transition-colors"
            >
              Cancel & Choose Different Method
            </button>
          </>
        )}
      </div>
    )
  }

  const renderCardPayment = () => (
    <div className="space-y-3">
      <SectionTitle>Card Payment</SectionTitle>
      <div className="bg-gray-950 rounded-lg p-4 border border-emerald-500/20 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-gray-300 mb-1">Redirecting to Paystack...</p>
        <p className="text-xs text-gray-500">If you are not redirected automatically, click Back and try again.</p>
      </div>
      <button
        onClick={() => { setPaymentStep('select'); setError(null) }}
        className="w-full py-2 border border-gray-600 text-gray-300 font-bold rounded-lg hover:bg-gray-800 transition-all text-sm"
      >
        Back
      </button>
    </div>
  )

  const renderSuccess = () => (
    <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
      <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center">
        <span className="text-3xl">✓</span>
      </div>
      <div>
        <h3 className="text-emerald-400 font-bold text-lg mb-1">Payment Successful!</h3>
        <p className="text-gray-400 text-sm">Your NFC card order has been confirmed.</p>
      </div>

      {/* Simple success message - WhatsApp handling is done by backend webhook */}
      {formData.deliveryMethod === 'pickup' ? (
        <div className="w-full p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p className="text-sm text-emerald-400 font-semibold mb-1">📍 Pickup Order Confirmed</p>
          <p className="text-xs text-gray-400">
            Our team will contact you via WhatsApp shortly to schedule your pickup time.
          </p>
        </div>
      ) : (
        <div className="w-full p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-blue-400 font-semibold mb-1">🚚 Delivery Order Confirmed</p>
          <p className="text-xs text-gray-400">
            Our team will contact you via WhatsApp with the delivery fee and shipping details.
          </p>
        </div>
      )}

      {currentOrder && (
        <div className="w-full p-3 bg-gray-950 rounded-lg border border-emerald-500/20 text-left">
          <p className="text-[10px] text-gray-400">Order ID</p>
          <p className="text-xs font-mono text-white">{currentOrder.id}</p>
          <p className="text-[10px] text-gray-400 mt-2">Delivery Method</p>
          <p className="text-xs text-white capitalize">{formData.deliveryMethod}</p>
          <p className="text-[10px] text-gray-400 mt-2">Amount Paid</p>
          <p className="text-xs text-emerald-400 font-semibold">{formatNaira(calculateTotal())}</p>
        </div>
      )}

      {onCancel && (
        <button
          onClick={onCancel}
          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-lg text-sm"
        >
          Done
        </button>
      )}
    </div>
  )

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      <p className="text-sm text-emerald-400">Initializing payment...</p>
      <p className="text-xs text-gray-500">Please do not close this window</p>
    </div>
  )

  const renderStep3 = () => {
    switch (paymentStep) {
      case 'processing': return renderProcessing()
      case 'account':    return renderVirtualAccount()
      case 'verifying':  return renderVirtualAccount()
      case 'card':       return renderCardPayment()
      case 'success':    return renderSuccess()
      default:           return renderPaymentSelect()
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-emerald-500/30 p-4 w-full max-w-sm mx-auto max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-base font-bold text-emerald-400">Order NFC Card</h2>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        )}
      </div>

      <div className="flex gap-1 mb-3 shrink-0">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-500 ${s <= step ? 'bg-emerald-500' : 'bg-gray-700'}`} />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  )
}