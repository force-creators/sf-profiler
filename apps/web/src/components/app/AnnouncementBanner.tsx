import { Code2, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { dismissedAnnouncementBannerStorageKey } from '../../storage/storageKeys';

const vscodeBannerId = 'vscode-extension-2026-06-27';
const vscodeMarketplaceUrl =
  'https://marketplace.visualstudio.com/items?itemName=force-creators.sf-profiler';

export function AnnouncementBanner() {
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return (
        window.localStorage.getItem(dismissedAnnouncementBannerStorageKey) ===
        vscodeBannerId
      );
    } catch (error) {
      console.warn('Unable to restore dismissed announcement banner', error);
      return false;
    }
  });

  if (isDismissed) {
    return null;
  }

  function dismissBanner() {
    try {
      window.localStorage.setItem(
        dismissedAnnouncementBannerStorageKey,
        vscodeBannerId
      );
    } catch (error) {
      console.warn('Unable to persist dismissed announcement banner', error);
    }

    setIsDismissed(true);
  }

  return (
    <aside className="announcement-banner" aria-label="SF Profiler announcement">
      <div className="announcement-banner-inner">
        <span className="announcement-banner-icon" aria-hidden="true">
          <Code2 size={18} />
        </span>
        <p>
          <strong>New: SF Profiler is in VS Code.</strong>
          <span> Profile Salesforce .log files from Explorer or the editor.</span>
        </p>
        <a
          className="announcement-banner-link"
          href={vscodeMarketplaceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Install extension
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <button
          aria-label="Dismiss VS Code extension announcement"
          className="announcement-banner-dismiss"
          onClick={dismissBanner}
          title="Dismiss"
          type="button"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
