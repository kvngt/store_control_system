import { useState } from 'react';
import type { PortalShop } from '../portal.types';

export interface ShopHeaderProps {
  shop: PortalShop;
}

export function ShopHeader({ shop }: ShopHeaderProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = Boolean(shop.logo_url) && failedUrl !== shop.logo_url;

  return (
    <header className="portal-shop">
      {showLogo && (
        <img
          src={shop.logo_url!}
          alt=""
          className="portal-shop-logo"
          onError={() => setFailedUrl(shop.logo_url)}
        />
      )}
      <div className="portal-shop-name">{shop.nombre}</div>
    </header>
  );
}
