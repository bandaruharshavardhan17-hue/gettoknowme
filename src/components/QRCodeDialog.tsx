import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
}

export function QRCodeDialog({ open, onOpenChange, url, title = 'Share QR Code' }: QRCodeDialogProps) {
  const { toast } = useToast();

  const handleDownload = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.download = 'qr-code.png';
      link.href = pngUrl;
      link.click();

      toast({
        title: 'Downloaded!',
        description: 'QR code saved as PNG',
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Chat Link',
          text: 'Scan this QR code or use the link to chat',
          url: url,
        });
      } catch (error) {
        // User cancelled or error
        if ((error as Error).name !== 'AbortError') {
          toast({
            title: 'Share failed',
            description: 'Could not share the link',
            variant: 'destructive',
          });
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied!',
        description: 'Share link copied to clipboard',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            Scan this QR code to open the chat
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 py-6">
          <div className="p-4 bg-white rounded-xl shadow-lg">
            <QRCodeSVG
              id="qr-code-svg"
              value={url}
              size={200}
              level="H"
              includeMargin
              className="rounded"
            />
          </div>
          
          <p className="text-xs text-muted-foreground text-center break-all max-w-[280px]">
            {url}
          </p>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button onClick={handleShare} className="gradient-primary text-primary-foreground">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
