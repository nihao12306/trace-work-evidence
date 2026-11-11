import { Navigate, createBrowserRouter } from "react-router";
import { App } from "../App";
import { RecordDetailPage } from "../features/records/RecordDetailPage";
import { RecordsPage } from "../features/records/RecordsPage";
import { DataSourcesPage } from "../features/settings/DataSourcesPage";
import { WeekPage } from "../features/week/WeekPage";
import { WeeklyReportPage } from "../features/week/WeeklyReportPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import {
  CaseStudyPage,
  CaseStudyPrintPage,
} from "../features/cases/CaseStudyPage";
import {
  CapabilityClaimPage,
  CapabilitiesPage,
} from "../features/capabilities/CapabilitiesPage";
import { CareerBriefPage } from "../features/career/CareerBriefPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true, element: <Navigate to="/records" replace /> },
      { path: "records", Component: RecordsPage },
      { path: "records/:recordId", Component: RecordDetailPage },
      { path: "week", Component: WeekPage },
      { path: "week/report", Component: WeeklyReportPage },
      { path: "projects", Component: ProjectsPage },
      { path: "projects/:projectId", Component: ProjectDetailPage },
      {
        path: "projects/:projectId/cases/:caseStudyId/print",
        Component: CaseStudyPrintPage,
      },
      {
        path: "projects/:projectId/cases/:caseStudyId",
        Component: CaseStudyPage,
      },
      { path: "capabilities", Component: CapabilitiesPage },
      { path: "capabilities/:claimId", Component: CapabilityClaimPage },
      { path: "career", Component: CareerBriefPage },
      {
        path: "settings",
        Component: DataSourcesPage,
      },
    ],
  },
]);
