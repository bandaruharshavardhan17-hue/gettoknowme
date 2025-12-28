import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Spaces from "./pages/owner/Spaces";
import SpaceDetail from "./pages/owner/SpaceDetail";
import ShareSpace from "./pages/owner/ShareSpace";
import ActiveLinks from "./pages/owner/ActiveLinks";
import PublicChat from "./pages/PublicChat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/owner/spaces" element={<ProtectedRoute><Spaces /></ProtectedRoute>} />
            <Route path="/owner/spaces/:spaceId" element={<ProtectedRoute><SpaceDetail /></ProtectedRoute>} />
            <Route path="/owner/spaces/:spaceId/share" element={<ProtectedRoute><ShareSpace /></ProtectedRoute>} />
            <Route path="/owner/links" element={<ProtectedRoute><ActiveLinks /></ProtectedRoute>} />
            <Route path="/s/:token" element={<PublicChat />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
