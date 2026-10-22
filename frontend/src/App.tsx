import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import { PageLoader } from './components/LoadingSpinner';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Logout = lazy(() => import('./pages/Logout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Resources = lazy(() => import('./pages/Resources'));
const ResourceDetails = lazy(() => import('./pages/ResourceDetails'));
const Compute = lazy(() => import('./pages/Compute'));
const Storage = lazy(() => import('./pages/Storage'));
const Network = lazy(() => import('./pages/Network'));
const ServiceHealth = lazy(() => import('./pages/ServiceHealth'));
const CloudProviders = lazy(() => import('./pages/CloudProviders'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Costs = lazy(() => import('./pages/Costs'));
const CostAnalysis = lazy(() => import('./pages/CostAnalysis'));
const Anomalies = lazy(() => import('./pages/Anomalies'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AlertRules = lazy(() => import('./pages/AlertRules'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/logout" element={<Logout />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/resources/:id" element={<ResourceDetails />} />
          <Route path="/compute" element={<Compute />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/network" element={<Network />} />
          <Route path="/service-health" element={<ServiceHealth />} />
          <Route path="/providers" element={<CloudProviders />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/costs/analysis" element={<CostAnalysis />} />
          <Route path="/costs/anomalies" element={<Anomalies />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/alert-rules" element={<AlertRules />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
