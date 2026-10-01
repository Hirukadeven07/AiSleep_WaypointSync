import type { PhoneTab } from './PhoneTabBar';

/** Driver destinations. The phone tab bar shows all five; the desktop sidebar turns the raised one into "Report issue". */
export const DRIVER_TABS: PhoneTab[] = [
  { href: '/drive', label: 'Home', icon: 'home', exact: true },
  { href: '/drive/stops', label: 'Stops', icon: 'route' },
  { href: '/drive/report', label: 'Report', icon: 'plus', fab: true },
  { href: '/drive/break', label: 'Break', icon: 'coffee' },
  { href: '/drive/vehicle', label: 'Vehicle', icon: 'truck' },
];
