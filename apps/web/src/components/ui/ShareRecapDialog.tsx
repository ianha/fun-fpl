import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ShareRecapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  gameweek: number;
  teamName: string;
}

// Brand icon SVGs — inline to avoid external icon dependencies
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function ShareRecapDialog({ open, onOpenChange, accountId, gameweek, teamName }: ShareRecapDialogProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  const recapUrl = `/api/my-team/${accountId}/recap/${gameweek}`;
  const absoluteUrl = `${window.location.origin}${recapUrl}`;
  const shareText = `GW${gameweek} Recap 📊 #FPL #GW${gameweek}`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(absoluteUrl)}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${absoluteUrl}`)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(absoluteUrl)}&text=${encodeURIComponent(shareText)}`;

  const canShareFiles = typeof navigator !== "undefined" && "canShare" in navigator;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silently ignore
    }
  }

  async function shareImageNative() {
    setSharing(true);
    setShareError(false);
    try {
      const res = await fetch(recapUrl);
      if (!res.ok) throw new Error("Failed to fetch recap image");
      const blob = await res.blob();
      const file = new File([blob], `fplytics-gw${gameweek}-recap.png`, { type: "image/png" });
      await navigator.share({ files: [file], title: `GW${gameweek} Recap`, text: shareText });
    } catch (err) {
      // AbortError means the user cancelled — don't treat that as an error
      if (err instanceof Error && err.name !== "AbortError") {
        setShareError(true);
      }
    } finally {
      setSharing(false);
    }
  }

  function openLink(url: string) {
    window.open(url, "_blank", "noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share GW{gameweek} Recap</DialogTitle>
          <DialogDescription>{teamName}</DialogDescription>
        </DialogHeader>

        {/* Preview image */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <img
            src={recapUrl}
            alt={`GW${gameweek} Recap Card`}
            className="w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div className="space-y-2 pt-1">
          {/* Web Share API — native OS share sheet (mobile only) */}
          {canShareFiles && (
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={shareImageNative}
              disabled={sharing}
            >
              {sharing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {sharing ? "Preparing…" : "Share image"}
            </Button>
          )}

          {shareError && (
            <p className="text-xs text-red-400">Couldn't share the image. Try copying the link instead.</p>
          )}

          {/* Platform deep links */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="justify-center gap-2 text-xs"
              onClick={() => openLink(xUrl)}
              aria-label="Post to X"
            >
              <XIcon />
              X
            </Button>
            <Button
              variant="outline"
              className="justify-center gap-2 text-xs text-green-400 hover:text-green-300"
              onClick={() => openLink(waUrl)}
              aria-label="Send on WhatsApp"
            >
              <WhatsAppIcon />
              WhatsApp
            </Button>
            <Button
              variant="outline"
              className="justify-center gap-2 text-xs text-sky-400 hover:text-sky-300"
              onClick={() => openLink(tgUrl)}
              aria-label="Send on Telegram"
            >
              <TelegramIcon />
              Telegram
            </Button>
          </div>

          {/* Copy link */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={copyLink}
          >
            {copied ? (
              <Check className="h-4 w-4 text-accent" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy link"}
          </Button>

          {/* Instagram / Signal note */}
          {canShareFiles && (
            <p className="text-center text-[11px] text-white/35">
              Instagram &amp; Signal: use "Share image" above on mobile
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
