import { Info, LifeBuoy, Mail, ScrollText, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { InfoRoute } from '../../router/infoRoute';

export const INFO_LINKS: { route: InfoRoute; label: string; icon: LucideIcon }[] = [
  { route: 'about', label: 'Про Miston', icon: Info },
  { route: 'rules', label: 'Правила', icon: ScrollText },
  { route: 'privacy', label: 'Конфіденційність', icon: ShieldCheck },
  { route: 'support', label: 'Підтримка', icon: LifeBuoy },
  { route: 'contact', label: 'Адміністрація', icon: Mail },
];
