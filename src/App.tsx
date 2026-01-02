import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import OwnerDashboard from "./pages/owner/OwnerDashboard";
import SpaceDetail from "./pages/owner/SpaceDetail";
import ShareSpace from "./pages/owner/ShareSpace";
import ProfileSettings from "./pages/owner/ProfileSettings";
import TestRunner from "./pages/owner/TestRunner";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PublicChat from "./pages/PublicChat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ImpersonationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/owner/spaces" element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>} />
              <Route path="/owner/spaces/:spaceId" element={<ProtectedRoute><SpaceDetail /></ProtectedRoute>} />
              <Route path="/owner/spaces/:spaceId/share" element={<ProtectedRoute><ShareSpace /></ProtectedRoute>} />
              <Route path="/owner/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              <Route path="/owner/test" element={<ProtectedRoute><TestRunner /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/s/:token" element={<PublicChat />} />
              <Route path="/chat/:token" element={<PublicChat />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ImpersonationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
