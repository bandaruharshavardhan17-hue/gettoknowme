import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { X, Eye } from 'lucide-react';

export function ImpersonationBanner() {
  const { impersonatedUser, isImpersonating, stopImpersonating } = useImpersonation();

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span className="font-medium">
            Viewing as: {impersonatedUser.display_name || impersonatedUser.email}
          </span>
          <span className="text-amber-800 text-sm">
            ({impersonatedUser.email})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={stopImpersonating}
          className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
        >
          <X className="h-4 w-4 mr-1" />
          Stop Viewing
        </Button>
      </div>
    </div>
  );
}
