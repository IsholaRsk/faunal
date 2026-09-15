/**
 * Minimal i18n runtime (spec §47). English is the product default; French and
 * Spanish cover the chrome (nav, CTAs, empty states) so a locale switch is
 * immediately visible without pretending the whole catalogue is translated.
 */
export const LOCALES = [
  { code: 'en', label: 'English', country: 'United States' },
  { code: 'fr', label: 'Français', country: 'United States' },
  { code: 'es', label: 'Español', country: 'United States' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

const DICT: Record<string, Partial<Record<Locale, string>>> = {
  'nav.home': { en: 'Home', fr: 'Accueil', es: 'Inicio' },
  'nav.explore': { en: 'Explore', fr: 'Explorer', es: 'Explorar' },
  'nav.favorites': { en: 'Favorites', fr: 'Favoris', es: 'Favoritos' },
  'nav.cart': { en: 'Cart', fr: 'Panier', es: 'Cesta' },
  'nav.profile': { en: 'Profile', fr: 'Profil', es: 'Perfil' },
  'nav.animals': { en: 'Animals', fr: 'Animaux', es: 'Animales' },
  'nav.breeders': { en: 'Breeders', fr: 'Éleveurs', es: 'Criadores' },
  'nav.guides': { en: 'Care guides', fr: 'Guides', es: 'Guías' },
  'nav.about': { en: 'About', fr: 'À propos', es: 'Acerca' },
  'action.buy': { en: 'Buy Now', fr: 'Acheter', es: 'Comprar' },
  'action.contact': { en: 'Contact Breeder', fr: 'Contacter', es: 'Contactar' },
  'action.addCart': { en: 'Add to cart', fr: 'Ajouter au panier', es: 'Añadir a la cesta' },
  'action.checkout': { en: 'Checkout', fr: 'Commander', es: 'Pagar' },
  'action.search': { en: 'Search animals, species or breeders', fr: 'Rechercher animaux, espèces ou éleveurs', es: 'Buscar animales, especies o criadores' },
  'label.verified': { en: 'Verified Breeder', fr: 'Éleveur vérifié', es: 'Criador verificado' },
  'label.available': { en: 'Available', fr: 'Disponible', es: 'Disponible' },
  'label.emptyCart': { en: 'Your cart is empty.', fr: 'Votre panier est vide.', es: 'Tu cesta está vacía.' },
  'label.exploreCta': { en: 'Explore animals', fr: 'Explorer les animaux', es: 'Explorar animales' },
  'label.total': { en: 'Total', fr: 'Total', es: 'Total' },
  'label.subtotal': { en: 'Subtotal', fr: 'Sous-total', es: 'Subtotal' },
  'label.shipping': { en: 'Shipping', fr: 'Livraison', es: 'Envío' },
  'label.taxes': { en: 'Taxes & fees', fr: 'Taxes et frais', es: 'Impuestos y tasas' },
};

export function t(key: string, locale: Locale | string = 'en'): string {
  const entry = DICT[key];
  return entry?.[locale as Locale] ?? entry?.en ?? key;
}

export function translate(locale: string) {
  return (key: string) => t(key, locale);
}
