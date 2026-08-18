import { WarehouseProvider } from '@/components/warehouse-provider'
import { AppShell } from '@/components/console/app-shell'

export default function Page() {
  return (
    <WarehouseProvider>
      <AppShell />
    </WarehouseProvider>
  )
}
