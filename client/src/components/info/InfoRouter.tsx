import type { InfoRoute } from '../../router/infoRoute';
import { AboutPage } from './AboutPage';
import { ContactPage } from './ContactPage';
import { PrivacyPage } from './PrivacyPage';
import { RulesPage } from './RulesPage';
import { SupportPage } from './SupportPage';

interface InfoRouterProps {
  route: InfoRoute;
  variant: 'public' | 'overlay';
}

export function InfoRouter({ route, variant }: InfoRouterProps) {
  switch (route) {
    case 'rules':
      return <RulesPage variant={variant} />;
    case 'privacy':
      return <PrivacyPage variant={variant} />;
    case 'support':
      return <SupportPage variant={variant} />;
    case 'contact':
      return <ContactPage variant={variant} />;
    default:
      return <AboutPage variant={variant} />;
  }
}
