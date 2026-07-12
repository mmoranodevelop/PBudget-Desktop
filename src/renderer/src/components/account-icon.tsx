import { Building2, CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = { landmark: Landmark, card: CreditCard, wallet: Wallet, building: Building2, phone: Smartphone }
export const ACCOUNT_ICON_OPTIONS = [
  { value: 'landmark', label: 'Banca' }, { value: 'card', label: 'Carta' }, { value: 'wallet', label: 'Portafoglio' }, { value: 'building', label: 'Azienda' }, { value: 'phone', label: 'Digitale' }
]

export function AccountIcon({ icon, className }: { icon: string; className?: string }): JSX.Element {
  const Icon = ICONS[icon] ?? Landmark
  return <Icon className={className} />
}
