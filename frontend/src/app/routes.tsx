import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "../components/layout/ProtectedRoute";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { StudyLayout } from "../components/layout/StudyLayout";

// Route-level code splitting: each page is its own chunk, loaded on demand.
// Helper adapts named exports to React.lazy (which expects a default export).
function page<T extends Record<string, ComponentType<unknown>>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[name] };
  });
}

const DashboardPage = page(() => import("../pages/DashboardPage"), "DashboardPage");
const ProjectsPage = page(() => import("../pages/ProjectsPage"), "ProjectsPage");
const ProjectDetailPage = page(() => import("../pages/ProjectDetailPage"), "ProjectDetailPage");
const StudyOverviewPage = page(() => import("../pages/StudyOverviewPage"), "StudyOverviewPage");
const ParticipantsPage = page(() => import("../pages/ParticipantsPage"), "ParticipantsPage");
const SessionsPage = page(() => import("../pages/SessionsPage"), "SessionsPage");
const NewSessionPage = page(() => import("../pages/NewSessionPage"), "NewSessionPage");
const ProcessingPage = page(() => import("../pages/ProcessingPage"), "ProcessingPage");
const ProcessingQueuePage = page(() => import("../pages/ProcessingQueuePage"), "ProcessingQueuePage");
const TimelinePage = page(() => import("../pages/TimelinePage"), "TimelinePage");
const AnnotationPage = page(() => import("../pages/AnnotationPage"), "AnnotationPage");
const VideoDetailPage = page(() => import("../pages/VideoDetailPage"), "VideoDetailPage");
const ReportsPage = page(() => import("../pages/ReportsPage"), "ReportsPage");
const SettingsPage = page(() => import("../pages/SettingsPage"), "SettingsPage");
const ModelsPage = page(() => import("../pages/ModelsPage"), "ModelsPage");
const ModelDetailPage = lazy(() => import("../pages/ModelDetailPage"));
const GlobalAnnotationsPage = page(() => import("../pages/GlobalAnnotationsPage"), "GlobalAnnotationsPage");
const GlobalVideosPage = page(() => import("../pages/GlobalVideosPage"), "GlobalVideosPage");
const AuditPage = page(() => import("../pages/AuditPage"), "AuditPage");
const GlobalSessionsPage = page(() => import("../pages/GlobalSessionsPage"), "GlobalSessionsPage");
const StudiesPage = page(() => import("../pages/StudiesPage"), "StudiesPage");
// Multimodal additions
const NewStudyPage = page(() => import("../pages/NewStudyPage"), "NewStudyPage");
const SessionDetailPage = page(() => import("../pages/SessionDetailPage"), "SessionDetailPage");
const EEGQualityPage = page(() => import("../pages/EEGQualityPage"), "EEGQualityPage");
const SyncPage = page(() => import("../pages/SyncPage"), "SyncPage");
const AnalysisWorkspacePage = page(() => import("../pages/AnalysisWorkspacePage"), "AnalysisWorkspacePage");
const AnalysisIndexPage = page(() => import("../pages/AnalysisIndexPage"), "AnalysisIndexPage");
const DatasetsPage = page(() => import("../pages/DatasetsPage"), "DatasetsPage");
const GovernancePage = page(() => import("../pages/GovernancePage"), "GovernancePage");
const AcquisitionPage = page(() => import("../pages/AcquisitionPage"), "AcquisitionPage");
const VariablesPage = page(() => import("../pages/VariablesPage"), "VariablesPage");
const StudyProtocolPage = page(() => import("../pages/StudySectionPages"), "StudyProtocolPage");
const StudyHypothesesPage = page(() => import("../pages/StudySectionPages"), "StudyHypothesesPage");
const StudyConditionsPage = page(() => import("../pages/StudySectionPages"), "StudyConditionsPage");
const StudyQualityPage = page(() => import("../pages/StudySectionPages"), "StudyQualityPage");
const StudyDatasetsPage = page(() => import("../pages/StudySectionPages"), "StudyDatasetsPage");
const StudyAnalysisPage = page(() => import("../pages/StudySectionPages"), "StudyAnalysisPage");
const StudySettingsPage = page(() => import("../pages/StudySectionPages"), "StudySettingsPage");

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
    </div>
  );
}

// Wraps a lazy element in Suspense so each navigation shows the spinner.
function lazyRoute(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { path: "", element: lazyRoute(<DashboardPage />) },
      // Projects
      { path: "projects", element: lazyRoute(<ProjectsPage />) },
      { path: "projects/:projectId", element: lazyRoute(<ProjectDetailPage />) },
      { path: "studies", element: lazyRoute(<StudiesPage />) },
      { path: "studies/new", element: lazyRoute(<NewStudyPage />) },
      // Study — full contextual navigation (docs §6)
      {
        path: "studies/:studyId",
        element: <StudyLayout />,
        children: [
          { path: "", element: <Navigate to="overview" replace /> },
          { path: "overview", element: lazyRoute(<StudyOverviewPage />) },
          { path: "protocol", element: lazyRoute(<StudyProtocolPage />) },
          { path: "hypotheses", element: lazyRoute(<StudyHypothesesPage />) },
          { path: "conditions", element: lazyRoute(<StudyConditionsPage />) },
          { path: "variables", element: lazyRoute(<VariablesPage />) },
          { path: "participants", element: lazyRoute(<ParticipantsPage />) },
          { path: "sessions", element: lazyRoute(<SessionsPage />) },
          { path: "sync", element: lazyRoute(<SyncPage />) },
          { path: "quality", element: lazyRoute(<StudyQualityPage />) },
          { path: "analysis", element: lazyRoute(<StudyAnalysisPage />) },
          { path: "datasets", element: lazyRoute(<StudyDatasetsPage />) },
          { path: "settings", element: lazyRoute(<StudySettingsPage />) },
        ],
      },
      { path: "studies/:studyId/sessions/new", element: lazyRoute(<NewSessionPage />) },
      // Global sections
      { path: "participants", element: lazyRoute(<ParticipantsPage />) },
      { path: "sessions", element: lazyRoute(<GlobalSessionsPage />) },
      // Session — multimodal hub & sub-screens
      { path: "sessions/:sessionId", element: lazyRoute(<SessionDetailPage />) },
      { path: "sessions/:sessionId/eeg", element: lazyRoute(<EEGQualityPage />) },
      { path: "sessions/:sessionId/sync", element: lazyRoute(<SyncPage />) },
      { path: "sessions/:sessionId/analysis", element: lazyRoute(<AnalysisWorkspacePage />) },
      { path: "sessions/:sessionId/annotate", element: lazyRoute(<GlobalAnnotationsPage />) },
      // Acquisition
      { path: "acquisition", element: lazyRoute(<AcquisitionPage />) },
      { path: "videos", element: lazyRoute(<GlobalVideosPage />) },
      { path: "videos/:videoId", element: lazyRoute(<VideoDetailPage />) },
      { path: "videos/:videoId/processing", element: lazyRoute(<ProcessingPage />) },
      { path: "videos/:videoId/timeline", element: lazyRoute(<TimelinePage />) },
      { path: "videos/:videoId/annotations", element: lazyRoute(<AnnotationPage />) },
      // Processing / annotation / analysis
      { path: "processing", element: lazyRoute(<ProcessingQueuePage />) },
      { path: "annotations", element: lazyRoute(<GlobalAnnotationsPage />) },
      { path: "analysis", element: lazyRoute(<AnalysisIndexPage />) },
      // Datasets, models, reports
      { path: "datasets", element: lazyRoute(<DatasetsPage />) },
      { path: "models", element: lazyRoute(<ModelsPage />) },
      { path: "models/:modelId/:version/:action", element: lazyRoute(<ModelDetailPage />) },
      { path: "reports", element: lazyRoute(<ReportsPage />) },
      // Governance & administration
      { path: "governance", element: lazyRoute(<GovernancePage />) },
      { path: "audit", element: lazyRoute(<AuditPage />) },
      { path: "settings", element: lazyRoute(<SettingsPage />) },
    ],
  },
]);
