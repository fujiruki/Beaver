import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './components/layout/AppLayout';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { APP_ID } from './lib/appId';

const Dashboard            = lazy(() => import('./pages/Dashboard'));
const CustomerList         = lazy(() => import('./pages/CustomerList'));
const CustomerDetail       = lazy(() => import('./pages/CustomerDetail'));
const CarryForwardEdit     = lazy(() => import('./pages/CarryForwardEdit'));
const TateguItemList       = lazy(() => import('./pages/TateguItemList'));
const TateguItemDetail     = lazy(() => import('./pages/TateguItemDetail'));
const ProjectList          = lazy(() => import('./pages/ProjectList'));
const ProjectDetail        = lazy(() => import('./pages/ProjectDetail'));
const DandoriBoard         = lazy(() => import('./pages/DandoriBoard'));
const VoucherList          = lazy(() => import('./pages/VoucherList'));
const VoucherEdit          = lazy(() => import('./pages/VoucherEdit'));
const InvoiceList          = lazy(() => import('./pages/InvoiceList'));
const InvoiceDetail        = lazy(() => import('./pages/InvoiceDetail'));
const SalesCategorySettings = lazy(() => import('./pages/SalesCategorySettings'));
const ProjectStatusSettings = lazy(() => import('./pages/ProjectStatusSettings'));
const AppSettings          = lazy(() => import('./pages/AppSettings'));
const Help                 = lazy(() => import('./pages/Help'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsProvider>
        <BrowserRouter basename={`/contents/${APP_ID}`}>
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>}>
            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<CustomerList />} />
                <Route path="customers/new" element={<CustomerDetail />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="customers/:id/carry-forward" element={<CarryForwardEdit />} />
                <Route path="tategu" element={<TateguItemList />} />
                <Route path="tategu/new" element={<TateguItemDetail />} />
                <Route path="tategu/:id" element={<TateguItemDetail />} />
                <Route path="projects" element={<ProjectList />} />
                <Route path="projects/new" element={<ProjectDetail />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="dandori" element={<DandoriBoard />} />
                <Route path="vouchers" element={<VoucherList />} />
                <Route path="vouchers/new" element={<VoucherEdit />} />
                <Route path="vouchers/:id" element={<VoucherEdit />} />
                <Route path="invoices" element={<InvoiceList />} />
                <Route path="invoices/new" element={<InvoiceDetail />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="settings/sales-categories" element={<SalesCategorySettings />} />
                <Route path="settings/project-statuses" element={<ProjectStatusSettings />} />
                <Route path="settings/app" element={<AppSettings />} />
                <Route path="help" element={<Help />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppSettingsProvider>
    </QueryClientProvider>
  );
}
