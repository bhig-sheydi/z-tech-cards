import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { AuthCallback } from './pages/AuthCallback'
import { LinkPoolAdmin } from './pages/LinkPoolAdmin'
import { NFCInventoryAdmin } from './pages/NFCInventoryAdmin'
import { TapRedirect } from './pages/TapRedirect' // Import the public profile page

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes - no authentication needed */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* PUBLIC PROFILE ROUTE - This is the key fix! */}
          <Route path="/tap/:linkCode" element={<TapRedirect />} />
          {/* Alternative shorter URL format */}
          <Route path="/p/:linkCode" element={<TapRedirect />} />
          
          {/* Protected routes - require authentication */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/linkpool-admin" 
            element={
              <ProtectedRoute>
                <LinkPoolAdmin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/nfc-inventory-admin" 
            element={
              <ProtectedRoute>
                <NFCInventoryAdmin />
              </ProtectedRoute>
            } 
          />
          
          {/* Default route */}
          <Route path="/" element={<Login />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App