import type { PortalShop } from '../portal.types';

export interface ShopHeaderProps {
  shop: PortalShop;
}

export function ShopHeader({ shop }: ShopHeaderProps) {
  return (
    <header className="portal-shop">
      {shop.logo_url && <img src={shop.logo_url} alt="" className="portal-shop-logo" />}
      <div className="portal-shop-name">{shop.nombre}</div>
    </header>
  );
}
