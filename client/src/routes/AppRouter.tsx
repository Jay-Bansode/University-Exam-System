import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Role } from '@ues/shared';
import { AuthProvider } from '@/context/AuthProvider';
import { AppLayout } from '@/components/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleHome } from './RoleHome';
import NotFoundPage from './NotFoundPage';
import { paths } from './paths';

/**
 * Route-level code splitting.
 *
 * Each role's dashboard becomes its own JavaScript chunk, fetched only when that route
 * is first visited. A student therefore never downloads the university administration
 * screens. Without this, every role pays for every other role's code on first load,
 * which matters on a phone over mobile data.
 *
 * `Suspense` provides the fallback while a chunk is in flight.
 */
const UniversityDashboard = lazy(
  () => import('@/features/university/UniversityDashboard'),
);
const CollegesPage = lazy(() => import('@/features/university/CollegesPage'));
const SyllabusPage = lazy(() => import('@/features/university/SyllabusPage'));
const ExamWindowsPage = lazy(() => import('@/features/university/ExamWindowsPage'));
const CollegeDashboard = lazy(() => import('@/features/college/CollegeDashboard'));
const PeoplePage = lazy(() => import('@/features/college/PeoplePage'));
const CollegeStreamsPage = lazy(() => import('@/features/college/CollegeStreamsPage'));
const FacultyDashboard = lazy(() => import('@/features/faculty/FacultyDashboard'));
const OfferingsPage = lazy(() => import('@/features/faculty/OfferingsPage'));
const ClerkDashboard = lazy(() => import('@/features/clerk/ClerkDashboard'));
const VerificationPage = lazy(() => import('@/features/clerk/VerificationPage'));
const CorrectionQueuePage = lazy(() => import('@/features/clerk/CorrectionQueuePage'));
const StudentDashboard = lazy(() => import('@/features/student/StudentDashboard'));
const ExamFormPage = lazy(() => import('@/features/student/ExamFormPage'));
const CorrectionsPage = lazy(() => import('@/features/student/CorrectionsPage'));
const StatisticsPage = lazy(() => import('@/features/university/StatisticsPage'));

export function AppRouter() {
  return (
    <BrowserRouter>
      {/* Wraps the routes rather than the whole tree, so a render error inside one page
          still shows the boundary's own UI instead of a blank document. */}
      <ErrorBoundary>
        <AuthProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path={paths.login} element={<LoginPage />} />

              {/* Signed in, any role: the shell plus a redirect to the right dashboard. */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<RoleHome />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allow={[Role.UniversityAdmin]} />}>
                <Route element={<AppLayout />}>
                  <Route path={paths.university} element={<UniversityDashboard />} />
                  <Route path={paths.universityColleges} element={<CollegesPage />} />
                  <Route path={paths.universitySyllabus} element={<SyllabusPage />} />
                  <Route
                    path={paths.universityExamWindows}
                    element={<ExamWindowsPage />}
                  />
                  <Route path={paths.universityStatistics} element={<StatisticsPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allow={[Role.CollegeAdmin]} />}>
                <Route element={<AppLayout />}>
                  <Route path={paths.college} element={<CollegeDashboard />} />
                  <Route path={paths.collegePeople} element={<PeoplePage />} />
                  <Route path={paths.collegeStreams} element={<CollegeStreamsPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allow={[Role.Faculty]} />}>
                <Route element={<AppLayout />}>
                  <Route path={paths.faculty} element={<FacultyDashboard />} />
                  <Route path={paths.facultyOfferings} element={<OfferingsPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allow={[Role.Clerk]} />}>
                <Route element={<AppLayout />}>
                  <Route path={paths.clerk} element={<ClerkDashboard />} />
                  <Route path={paths.clerkVerification} element={<VerificationPage />} />
                  <Route
                    path={paths.clerkCorrections}
                    element={<CorrectionQueuePage />}
                  />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allow={[Role.Student]} />}>
                <Route element={<AppLayout />}>
                  <Route path={paths.student} element={<StudentDashboard />} />
                  <Route path={paths.studentExamForm} element={<ExamFormPage />} />
                  <Route path={paths.studentCorrections} element={<CorrectionsPage />} />
                </Route>
              </Route>

              {/* A real page rather than a redirect: bouncing an unknown URL to the
                dashboard makes a typo look identical to a permissions problem. */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
